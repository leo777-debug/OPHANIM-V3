# Parity and reliability progress

Branch: `parity-and-reliability`. Started 2026-10-19.

Read `state.json` first when resuming. Complete the first unfinished task, run
typecheck, tests and build, record evidence here, then commit only task files.
Do not include the pre-existing dirty checkout changes in task commits.

## Constraints

No World Monitor source, styles, assets, API, embeds or backend data may be used.
Independent implementations only. Public awareness and operational safety only.
No private-person tracking or military targeting. New sources require explicit
licence, commercial-use decision, attribution, limits and key requirements in the
provider registry; unknown/disallowed commercial rights default off.
Organization data remains authenticated and isolated; migrations are additive.
Do not fabricate keys, observations, availability, timestamps or successful checks.

## Baseline

- Created requested branch from `codex/ophanim-foundation-worldmonitor`.
- Existing work includes Shodan, freshness, search and provider changes; preserved.
- Read repository AGENTS.md and installed Next.js route/client-component guides.
- Baseline tests: 68 files passed, 1 skipped; 311 tests passed, 5 skipped.
- Baseline typecheck and production build passed.

## Milestone 1: central integration inventory

- Added generated API_KEYS.md and an all-empty .env.example (52 service entries,
  110 environment identifiers), plus a reproducible inventory generator.
- Added owner-protected `/admin/integrations` and its API; no UI credential storage.
- Status uses configuration presence, explicit licence gates for verification
  sources and process-local observations. Six fixed public probes test reachability.
- Tests accept only a registered ID, reject supplied credentials/URLs and
  cross-origin requests, rate-limit calls, and do not return raw provider errors.
- 320 tests passed, 5 skipped; repaired the test environment typing issue and
  production build and standalone typecheck passed. All nine integration-specific
  tests passed after the correction.
- Limitations: service-specific authenticated probes, payload/data-age validation,
  persistent observations and global key-required empty-state adoption remain.
- Existing `.env.example` comments/settings are consolidated into the empty
  inventory deliberately; no private environment files were read or modified.

## Milestone 2 in progress

Independent deterministic story clustering, bounded public-role entity extraction,
trust metadata and convergence calculations are being connected to the Intel Desk.

## Task order

0. Inventory, branch and resumable state.
1. Central API_KEYS.md, empty .env.example, protected integrations status/tests.
2. P1 deterministic story/entity/convergence/trust/context and coverage UI.
3. Provider health scheduler, resilience and feed audit.
4. P2 specialist layers, source governance and country/timeline experiences.
5. P3 route/scenario/analysis/forecast tools.
6. P4 layout, search, sharing, accessibility/localization/offline and public API.
7. Reference refresh, browser push, optional services/setup and session UX.
8. End-to-end/load/security checks, screenshots, final report and pull request.

The detailed capability list is in REPORT.md. Pending means unimplemented or not
verified; never infer completion from a catalog entry or this plan.
