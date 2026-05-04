# RizzUp API — operations

This document covers security configuration, observability, backups, and database hygiene for the Nest API (`RizzUpBE`) and related Supabase resources (`RizzUpApp/supabase`).

## Security (API)

- **CORS:** In production (`NODE_ENV=production`), the server **requires** `CORS_ORIGINS` (comma-separated). Misconfiguration fails fast at startup instead of falling back to an open policy.
- **Rate limiting:** `@nestjs/throttler` applies a global limit (`RATE_LIMIT_PER_MIN`, default 120/min). `/health` is excluded so load balancers and probes are not blocked.
- **Debug impersonation:** `X-Debug-User-Id` is honored only when `ALLOW_DEBUG_USER_IMPERSONATION=true` **and** `NODE_ENV` is not `production`. Keep the flag `false` in prod and rely on real JWTs.
- **Helmet:** Standard security headers are applied via `helmet`.

## Structured logs

- In **production**, HTTP access lines are logged as **JSON** (one object per line: `method`, `path`, `status`, `durationMs`, `time`). Ship stdout to your log aggregator (Datadog, CloudWatch, Axiom, etc.).
- **Alerts:** Configure alerts on:
  - High rate of `5xx` responses
  - Sudden spike in `429` (throttling) or `401`/`403` if unexpected
  - Process restarts / OOM (platform-specific)

## In-app purchases — RevenueCat (primary for mobile)

- **App:** `react-native-purchases` + `Purchases.logIn(<supabase user id>)` so `app_user_id` in RevenueCat matches `profiles.id`.
- **Webhook:** Function `supabase/functions/revenuecat-webhook`. Set the same **Authorization** secret in RevenueCat (Integrations → Webhooks) and in Supabase secrets as `REVENUECAT_WEBHOOK_AUTH`.
- Optional env `REVENUECAT_ENTITLEMENT_ID` (default `premium`) must match the entitlement identifier in the RevenueCat dashboard and `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` in the app.
- Native IAP requires a **development or production build** (not Expo Go). Use `eas build` / `expo prebuild` per `react-native-purchases` docs.

## Stripe webhooks (optional — web-only billing)

- **Nest:** `POST /v1/webhooks/stripe` verifies the payload with `constructEvent` using **`STRIPE_WEBHOOK_SECRET`** (Dashboard → Webhooks → signing secret for **this exact URL**). Raw body must be enabled (`rawBody: true`) or signature verification will fail.
- **Idempotency:** Each Stripe event id (`evt_…`) is stored once in `processed_stripe_webhook_events`. Retries and duplicate deliveries do not mark an invoice paid twice. Checkout Session creation uses Stripe’s **`idempotencyKey`** (`checkout_inv_<invoiceId>`) so network retries do not spawn extra sessions.
- **Trust:** After verifying the signature, the handler checks `payment_status === paid` when present, and that **`amount_total`** / **currency** match the invoice before updating status (logs and skips on mismatch).
- **Connected accounts / per-user API keys:** One global `STRIPE_WEBHOOK_SECRET` only matches events signed by **one** Stripe account. If freelancers use **their own** Stripe keys for Checkout, either use **Stripe Connect** (platform receives all events with one secret) or register **separate webhook endpoints** per account (not what this single route models today).
- Legacy **Supabase Edge** function `supabase/functions/stripe-webhook` may remain for older flows; prefer the Nest route for CRM invoice checkout. Still verify with `constructEvent` — never trust raw JSON.

## Edge Functions (AI)

- Functions `proposal`, `pricing`, `client-score`, `insights` require `Authorization: Bearer <Supabase access token>` and use `SUPABASE_URL` + `SUPABASE_ANON_KEY` to validate the user.
- Optional: `EDGE_AI_RATE_LIMIT_PER_MIN` (default 30) caps AI calls per user per minute (in-memory per isolate).

## Cron (`invoice-reminder-cron`)

- Protect with `CRON_SECRET`; reject requests without `x-cron-secret` or `Authorization: Bearer` matching the secret.
- Schedule **hourly** (UTC) via `pg_cron` (see `RizzUpApp/supabase/sql/schedule_invoice_reminder_cron.sql`). Hourly ticks are required so every user timezone can hit their preferred local hour.
- The Edge function calls Postgres RPC `claim_invoice_reminder_targets()` which:
  - filters invoices stuck in `sent` for 3+ days
  - filters users whose **local hour** matches `profiles.invoice_reminder_local_hour` in `profiles.time_zone`
  - **atomically stamps** `profiles.last_invoice_reminder_sent_at` to prevent duplicate sends the same local day
- The mobile app writes `profiles.time_zone` from the device IANA zone when saving the Expo push token (`RizzUpApp/src/notifications/push.ts`).

## Backups

- **Supabase:** Enable Point-in-Time Recovery (PITR) on paid tiers; otherwise rely on daily backups from the dashboard and test restores periodically.
- **Application DB (if self-hosted Postgres):** Schedule `pg_dump` or managed automated backups; store off-site with encryption; document retention.

## Secret rotation

- JWT validation in the Nest API uses Supabase Signing Keys (JWKS) via `SUPABASE_URL` (no longer relies on `SUPABASE_JWT_SECRET`).
- Rotate `STRIPE_WEBHOOK_SECRET` when recreating the webhook endpoint in Stripe.
- Rotate `CRON_SECRET` and update GitHub Actions / Supabase secrets / callers together.
- Rotate database passwords and update `DATABASE_URL` on the API host.

## Migrations and environments

- **Nest / Prisma:** Apply `prisma/migrations` to the target database before deploying API changes that depend on new columns.
- **Supabase SQL:** Apply migrations from `RizzUpApp/supabase/migrations` in order in the correct project (staging vs production). Never assume “local” and “prod” are identical without checking.
- After migrations, run `npx prisma generate` in CI and redeploy the API.

## RLS (Row Level Security)

- Client-facing access to `public.*` tables should use RLS policies tied to `auth.uid()`.
- The Nest API typically uses `DATABASE_URL` with sufficient privileges; still review policies so anon/authenticated roles cannot escalate (e.g. only own rows).
- Periodically audit policies in Supabase SQL Editor or `supabase db dump` review.

## Runbook — API unhealthy

1. Check `/health` from the load balancer or directly.
2. Inspect recent deploys and migration application order.
3. Verify env vars: `DATABASE_URL`, `SUPABASE_URL`, `CORS_ORIGINS` (prod).
4. Check DB connectivity and connection pool limits.
5. Roll back last deploy if a regression is confirmed.

## Runbook — Stripe webhooks failing

1. Confirm Stripe Dashboard → Webhooks shows successful deliveries; check signature errors.
2. Verify `STRIPE_WEBHOOK_SECRET` matches the endpoint’s signing secret.
3. Ensure raw body is used for verification (Edge function uses `req.text()` before verify).
