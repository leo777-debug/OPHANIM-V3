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
- Baseline typecheck and production build running; results pending.

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
