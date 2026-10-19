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
  initially 110, now 111 environment identifiers), plus an inventory generator.
- Added owner-protected `/admin/integrations` and its API; no UI credential storage.
- Status uses configuration presence, explicit licence gates for verification
  sources and process-local observations. Five fixed public probes test reachability.
- Tests accept only a registered ID, reject supplied credentials/URLs and
  cross-origin requests, rate-limit calls, and do not return raw provider errors.
- 320 tests passed, 5 skipped; repaired the test environment typing issue and
  production build and standalone typecheck passed. All nine integration-specific
  tests passed after the correction.
- Limitations: service-specific authenticated probes, payload/data-age validation,
  persistent observations and global key-required empty-state adoption remain.
- Existing `.env.example` comments/settings are consolidated into the empty
  inventory deliberately; no private environment files were read or modified.

## Milestone 2: core intelligence and news resilience (partial)

- Stories tab groups cross-publisher reports by canonical URL/title/window,
  preserves evidence and exposes publisher counts and observed first-seen times.
- Added dictionary entities, cross-report links, explicit IMO/MMSI/ICAO24 extraction,
  manually configured trust/affiliation flags and labelled rule-based context.
- Added configurable convergence with operator independence and unique-type scores.
  Only news and seismic adapters are wired, so default three-type convergence
  cannot yet trigger. Remaining signal adapters and alert delivery are pending.
- Shared bounded news cache coalesces requests; timeout, backoff, circuit breaker,
  last-good results and stale-since labels do not move the last-success time.
- Browser testing found over-grouped generic GDACS titles. Added same-publisher
  identity and distant-reported-location guards plus regression tests.
- Methods and caveats: docs/INTELLIGENCE_METHODS.md.

## Milestone 3: independent Logistics map

- Removed the pre-existing third-party product iframe and catalogue.
- Native Ophanim map, regional navigation, layers and organization detail drawers
  remain. Auth/reference provenance and source-health limitations stay explicit.
- Added a regression assertion that the workspace has no product iframe dependency.

## Milestone 4: SDK isolation and sign-in return

- SDK metadata/stream require a session in SDK_ORGANIZATION_ID; 401 signed out,
  403 other tenant, 503 incomplete configuration. Ingestion also needs the existing
  SDK credential. This is a single-organization, process-local worker contract.
- Removed invented feed count/latest update; actual receipt and observation times
  differ. SSE cancellation clears timers and reconnects after a minute for auth.
- Added limits, conservative errors and valid zero-coordinate handling.
- Login respects a validated same-site returnTo. Research/SDK docs explain what is
  available and what still needs implementation; no fake worker was bundled.

## Verification and remaining work

- Baseline: 311 tests passed / 5 skipped, typecheck and build passed.
- Current: 343 tests passed / 5 skipped (75 files passed); production build passed.
- Targeted ESLint passed after fixing the effect scheduling and legacy SDK any types.
- Live reachability audit: 14/14 endpoints reached; NOT a parsing/freshness audit.
- Browser: protected integration sign-in prompt, Atlas and Stories verified.
- Full requested browser/load/security matrix is pending. No authenticated admin
  session or private environment credential was borrowed to fake verification.
- REPORT.md is an interim report with every requested capability accounted for.
- First unfinished task remains 01-integrations: finish actual test adapters,
  persistent fetch health, all existing key UIs/prompts and per-operator inventory.
- P2/P3/P4 are unfinished; do not mark overall parity complete or merge this work.

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
