-- Per-project checklist tasks (freelancer app). Apply in Supabase / psql alongside Prisma.

CREATE TABLE IF NOT EXISTS public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  title varchar(500) NOT NULL,
  done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_tasks_project_id_idx ON public.project_tasks (project_id);
CREATE INDEX IF NOT EXISTS project_tasks_project_sort_idx ON public.project_tasks (project_id, sort_order);
