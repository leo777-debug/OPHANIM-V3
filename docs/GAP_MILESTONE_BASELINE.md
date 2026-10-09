# Logistics Gap Milestones: Baseline and Blocker

Recorded 9 October 2026 (Asia/Dubai).
Starting revision: `6f8523b`.

## Scope

The requested sequence starts with Ophanim Verify (Milestone 0), followed by
logistics layers, routes/scenarios, outbound webhooks/localization, intelligence
processing and platform features. Logistics features must connect evidence to
organization-owned shipments, routes, ports or airports. Verify is the explicit
general-purpose exception. Decisions remain deterministic with AI off.

World Monitor source code was not opened or copied for this request. No World
Monitor APIs or embeds were queried. No new data providers were added or enabled.

## Baseline Checks

| Check | Command / observation | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | Passed |
| Tests | `npx vitest run` | 50 test files passed; 153 tests passed, 1 skipped |
| Focused lint | Command below | Passed, no output |
| Production build | `npm run build` | Passed; 96 static pages generated |
| Static RLS assertions | `npx vitest run src/lib/supabase/tenant-rls.test.ts` | 5 passed; these inspect migration text, not a live database |
| PostgreSQL tenant-isolation assertions | Existing `supabase/tests/*.test.sql` | Not run: no reachable development database configured |

Focused lint command:

```bash
npx eslint src/lib/providers/provider-registry.ts src/lib/providers/types.ts src/lib/intelligence/event-provider-registry.ts src/lib/intelligence/event-provider.ts src/lib/logistics/disruptions.ts src/lib/platform/http.ts
```

This is not a whole-repository lint result. No legacy lint findings were changed.
Vitest emits an existing configuration-loader warning; it did not fail the tests.

## Implementation Findings

- Search already has deterministic classifier/registry/enrichment contracts.
- The intelligence event registry has normalized USGS and NASA event providers.
  Reuse those contracts instead of introducing direct frontend source calls.
- Existing provider metadata and source records have licensing/commercial-use
  fields; future additions must record attribution and rate limits too, and must
  enforce the requested off-by-default policy for unknown or disallowed use.
- Database changes currently live in two paths: numbered application migrations
  under `db/migrations`, and Supabase security migrations under
  `supabase/migrations`. Additive schema and RLS changes must be verified together.
- Existing live RLS scripts exercise authenticated roles, tenant visibility,
  writes and cross-tenant parent/child integrity. They require the Supabase auth
  schema, applied migrations and pgTAP in a development/test database.

## Blocking Condition

The local environment has no `DATABASE_URL`. The connected Supabase project named
OPHANIM reports `INACTIVE`. Docker is installed, but the Docker Desktop Linux
engine is not running. The unrelated active Supabase project was not queried or
modified.

No remote database was restored, no infrastructure was provisioned, no database
passwords were requested or printed, and no migrations were applied. Existing
tenant-isolation acceptance tests cannot currently be executed. Text assertions
are not a substitute for those tests.

Following the instruction to stop and report when blocked, implementation stops
at this preflight checkpoint. Milestone 0 and Milestones A-E are not completed or
claimed as implemented. No acceptance screenshots or after-change feature checks
exist yet.

## Required Next Decision

Provide a non-production Supabase-compatible development/test database, either
by authorizing restoration/configuration of the existing OPHANIM project or by
starting a local Supabase development stack. Its connection string belongs in an
uncommitted environment file, not chat or version control. Apply/verify the
existing application and security migrations, then execute both existing RLS
scripts before implementing organization-owned Verify history and share records.

## Changes In This Checkpoint

Only `docs/GAP_MILESTONE_BASELINE.md` was added. No application files, migrations,
provider defaults, data-source permissions or tests were modified.
