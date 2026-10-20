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
- After restarting the final production build, confirmed corrected Stories sorting
  and non-merged same-publisher alerts. Sources expose publication dates separately
  from successful fetches, including old Telegram publications; this is a real
  coverage gap despite HTTP reachability. Native Logistics map rendered without
  an external product iframe. Mobile integration prompt/return link checked at 390px.
- Screenshots: PARITY/screenshots/{stories,sources,logistics-native,
  integrations-signed-out,integrations-mobile}.jpg.
- Final standalone typecheck and `git diff --check` passed. Checks used the shared
  dirty checkout; clean-checkout CI is still required.
- Draft PR: https://github.com/leo777-debug/OPHANIM-V3/pull/25 (unmerged).
- Full requested browser/load/security matrix is pending. No authenticated admin
  session or private environment credential was borrowed to fake verification.
- REPORT.md is an interim report with every requested capability accounted for.
- First unfinished task remains 01-integrations: finish actual test adapters,
  persistent fetch health, all existing key UIs/prompts and per-operator inventory.
- P2/P3/P4 are unfinished; do not mark overall parity complete or merge this work.

## Task order

## Continuation: completion and merge requested

User authorized merging only after completion. Deployment verification is explicitly
deferred until last. Existing PR CI passed; Vercel preview is failing and the
connector needs reauthentication. Do not bypass that check or mark parity complete.

Implemented additional integration work: private runtime schema, PostgreSQL/shared
storage or explicit single-instance file persistence, pinned bounded connection
probes, optional scheduled health worker, failure-episode alert handling, Admin
Health status table and centralized server AI credentials. Browser secret input
and storage were removed; old preferences are sanitized. New PGlite policy tests
and transport/configuration tests pass. Full milestone checks follow.

Continuation checks: 357 tests passed, 5 skipped; production build and standalone
typecheck passed. This includes six new official source normalizers and their
public API. Public-source UI lint caught an effect scheduling issue, corrected
before review. Only task-owned changes are staged in milestone commits.

## Task order (continued)

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

## 20 October 2026 — official advisories and route/scenario milestone

- Added six official source adapters: NWS warnings; NHC Atlantic, Eastern Pacific
  and Atlantic Spanish; CDC travel health; selected-country UK FCDO advice.
  Every adapter records rights, attribution, cadence, keys and geographic limits.
  A point-in-time local audit parsed all six; see public-intelligence-audit.json
  and audit-public-intelligence.mjs. Counts are capped at 100/source.
- Added public source timeline, filters, rights/coverage details and CSV. Fixed
  the GOV.UK content API's human-page link and flagged a future-dated NHC item;
  preserve its reported timestamp but exclude it from chronological ranking.
- Added independent sea-network routing over pinned Apache-2.0 Marnet data,
  alternatives for eight chokepoints, explicit distance/days formulas, unrouted
  connectors and public USGS/EONET route context. Network version/hash/provenance
  are recorded in docs/ROUTE_SCENARIO_METHODS.md.
- Four scenario templates assess session-scoped organization shipment ports;
  unknown ports remain unknown. No tenant is selected by a request body. Public
  route CSV and private scenario CSV plus browser Print / Save PDF are available.
- Browser verified Jebel Ali to Rotterdam: baseline 11,627 km / 18.69 days;
  Suez-excluded route 20,486 km / 32.92 days at 14 knots. Signed-out private
  scenario evaluation showed a sign-in prompt and return link. Added map bounds
  framing after inspecting the first render. Authenticated browser flow remains
  unverified; API isolation is tested with fixtures.
- Checks: 368 passed, 5 skipped (85 files passed); production build, standalone
  typecheck and targeted lint passed. An earlier unconstrained build/test run
  timed out in PGlite; two-worker rerun passed without weakening the timeout.
- These checks use the shared checkout with preserved pre-existing edits.
  Deployment stays last. No merge has been attempted; broad parity is unfinished.
