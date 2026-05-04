-- Freelancer CRM schema (init) — apply in Supabase SQL Editor or psql.
-- This migration is the new baseline for the CRM-only app.
-- Prerequisite: Supabase project with auth.users (default).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid not null,
  email varchar(255),
  display_name varchar(100),
  avatar_url text,
  is_premium boolean not null default false,
  subscription_tier varchar(32) not null default 'free',
  niche varchar(32) not null default 'uxui',
  expo_push_token text,
  -- IANA timezone for user-local scheduling (e.g. "America/Mexico_City")
  time_zone text not null default 'UTC',
  -- Preferred local hour (0-23) for invoice reminder pushes
  invoice_reminder_local_hour integer not null default 9
    check (invoice_reminder_local_hour >= 0 and invoice_reminder_local_hour <= 23),
  -- Last time we successfully claimed/sent an invoice reminder batch for this user (UTC)
  last_invoice_reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade on update cascade
);

create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

-- Keep updated_at fresh on profile updates
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Core CRM tables
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  whatsapp text,
  avg_payment_days integer,
  health_score numeric(3,1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_user_id_idx on public.clients (user_id);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  status text not null default 'brief',
  deadline timestamptz,
  value numeric(12,2),
  paid_amount numeric(12,2) default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id);
create index if not exists projects_client_id_idx on public.projects (client_id);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  amount numeric(12,2) not null,
  status text not null default 'draft',
  stripe_id text,
  memo text,
  currency varchar(3) not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_project_id_idx on public.invoices (project_id);

-- Ensure invoices.updated_at changes on updates (for reminders)
create or replace function public.invoices_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row
  execute procedure public.invoices_set_updated_at();

-- Claim targets for invoice reminder pushes (service_role only).
-- Intended to be called hourly from Edge `invoice-reminder-cron`.
-- Atomically stamps `last_invoice_reminder_sent_at` to prevent duplicate sends the same local day.
create or replace function public.claim_invoice_reminder_targets()
returns table (
  user_id uuid,
  expo_push_token text,
  pending_count bigint,
  time_zone text,
  invoice_reminder_local_hour integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  return query
  with candidates as (
    select
      p.id as user_id,
      p.expo_push_token,
      p.time_zone,
      p.invoice_reminder_local_hour,
      count(i.id)::bigint as pending_count
    from public.profiles p
    inner join public.projects pr on pr.user_id = p.id
    inner join public.invoices i on i.project_id = pr.id
    where p.expo_push_token is not null
      and btrim(p.expo_push_token) <> ''
      and i.status = 'sent'
      and i.updated_at < v_now - interval '3 days'
      -- Only send during the user's preferred local hour window (top-of-hour tick)
      and extract(hour from timezone(p.time_zone, v_now))::int = p.invoice_reminder_local_hour
      -- At most once per local calendar day
      and (
        p.last_invoice_reminder_sent_at is null
        or (timezone(p.time_zone, v_now))::date
          <> (timezone(p.time_zone, p.last_invoice_reminder_sent_at))::date
      )
    group by p.id, p.expo_push_token, p.time_zone, p.invoice_reminder_local_hour, p.last_invoice_reminder_sent_at
    having count(i.id) > 0
  ),
  claimed as (
    update public.profiles p
    set last_invoice_reminder_sent_at = v_now
    from candidates c
    where p.id = c.user_id
    returning
      p.id as user_id,
      p.expo_push_token,
      c.pending_count,
      p.time_zone,
      p.invoice_reminder_local_hour
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_invoice_reminder_targets() from public;
grant execute on function public.claim_invoice_reminder_targets() to service_role;

comment on function public.claim_invoice_reminder_targets is
  'Atomically selects users with stale sent invoices, stamps last_invoice_reminder_sent_at, returns push targets. Call hourly.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.invoices enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "clients_all_own" on public.clients;
create policy "clients_all_own" on public.clients for all using (auth.uid() = user_id);

drop policy if exists "projects_all_own" on public.projects;
create policy "projects_all_own" on public.projects for all using (auth.uid() = user_id);

drop policy if exists "invoices_via_project" on public.invoices;
create policy "invoices_via_project" on public.invoices for all using (
  exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
);

