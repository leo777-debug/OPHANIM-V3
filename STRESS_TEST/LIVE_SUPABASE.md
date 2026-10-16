# Disposable Supabase Session Gate

The normal suite tests actual PostgreSQL session/membership predicates, with
claims mocked. It does not certify an Auth server. The live suite uses actual
Supabase signup, signed claims, refresh and logout over HTTP, plus the actual
application actor query. Only the Next client factory is replaced to supply the
real SDK's in-memory session instead of framework cookies.

## Run

Use a disposable local Supabase with the Ophanim migrations applied and email
auto-confirm enabled. Never point these tests at production or customer data.
Both URLs are checked for loopback hosts before any database or Auth access.

```powershell
$env:RUN_LOCAL_SUPABASE_SESSION_TESTS='1'
$env:STRESS_SUPABASE_URL='http://127.0.0.1:54321'
$env:STRESS_SUPABASE_DATABASE_URL='postgresql://postgres:YOUR_LOCAL_ONLY_PASSWORD@127.0.0.1:54322/postgres'
$env:STRESS_SUPABASE_PUBLISHABLE_KEY='YOUR_DISPOSABLE_LOCAL_PUBLISHABLE_KEY'
npx vitest run src/lib/supabase/live-sessions.integration.test.ts
```

The five ordered checks cover a real signed session, forged organization cookie,
current role changes, refresh, and replay of the original access token after
logout. Synthetic fixture records are removed in cleanup; no external email,
paid API or live active scan is used. Signup/account cleanup needs local Auth
database privileges. Do not log these variables or commit environment files.

This is not a browser-cookie integration test. The separate browser login tests
currently exercise standalone legacy login only.

## Current Machine Blocker (16 October)

Docker Desktop cannot start its Linux engine: its local `sailor-ingest.sock`
reparse-point socket is inaccessible. Starting Desktop reproduced the error.
A conservative backup/rename attempt also failed. No factory reset, WSL distro
deletion, update install, billing change or hosted Auth modification was made.
There is no running local Supabase Auth service, so the five live tests remain
explicitly skipped, not passed. Repair Docker Desktop or provide a disposable
local Auth instance before closing this gate.

## Revocation Design

Every application actor lookup now requires a signed `session_id` whose
`auth.sessions` row belongs to the signed subject and is not past `not_after`.
Membership and role are read fresh; no legacy-cookie fallback or auth cache is
used. Missing table/privileges fail closed: the backend DATABASE_URL must target
the corresponding Supabase database with permission to inspect its Auth sessions.
No grants to browser/Data API roles were added.

Logout returns a retryable failure when Auth cannot confirm sign-out, rather than
claiming success. This does not implement Supabase's configurable inactivity or
single-session policies; those are applied by Auth during refresh.

Reference: [Supabase session and logout semantics](https://supabase.com/docs/guides/auth/sessions).
