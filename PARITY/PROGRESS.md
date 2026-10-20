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

## 20 October 2026 — first-observation persistence

- Replaced process-only article observations with canonical public article hashes
  and an atomic earliest-time register. PostgreSQL resolves concurrent writes
  with the earlier UTC observation; serialized file writes preserve identities
  across restarts. Serverless/no-store failures explicitly report memory fallback.
- Storage mode and persistence warnings travel with news records and appear in
  Stories. Publication times are never substituted for observation times.
- Tests execute the real first-seen SQL in PGlite, verify overlapping file writes,
  URL tracking normalization and fallback reporting. The 368-test/build/typecheck/
  lint milestone above includes these changes. News, seismic and dated FIRMS fire
  observations now feed convergence; other disruption adapters remain unfinished.

## 20 October 2026 — public polling notifications

- Public advisory SSE coalesces one polling loop/server instance, sends changed
  revision notifications and explicitly labels 300-second polling. Browser
  fallback polling continues on disconnect. Country advice retains its hourly
  source cache. No private SDK/organization data enters this channel.
- Added capacity/rate limits, bounded connection lifetime and timer/subscriber
  cleanup; heartbeats never claim new source observations. Unit-tested 1,000
  listeners; 12/12 concurrent local HTTP streams received notification in 2.63 s.
  This is not a many-browser or multi-instance load benchmark.
- Browser verified connected channel status and health filtering; screenshot:
  screenshots/official-health.jpg. Full remaining layout/RTL/Presentation matrix
  is still pending. Route screenshot is a partial mobile viewport, not a complete
  desktop geometry validation.
- Checks: 372 passed, 5 skipped (87 files passed); production build, standalone
  typecheck and targeted lint passed. Follow docs/PUBLIC_UPDATES.md.

## 20 October 2026 — public offline shell

- Updated install manifest; registered a service worker that caches only explicit
  public shell/icon files. API responses and private/navigation HTML are never
  stored. Network-failed navigations use a clearly labelled standalone shell.
- Public advisory filters can be saved to a field-whitelisted local snapshot,
  capped at 150 records. Null organization scope and six approved provider IDs
  are required. Feed text is rendered with textContent; arbitrary fields and
  unsafe/non-official links are excluded. Original source and save/check times
  are preserved. Added offline banner, view and clear controls.
- Browser saved 21 public health notices, stopped the local app server, navigated
  to another app page and verified offline shell + saved notices. Clearing the
  test snapshot worked. Screenshot: screenshots/offline-public-snapshot.jpg.
- Checks: 377 passed, 5 skipped (89 files passed); production build, standalone
  typecheck and targeted lint passed. Device installation, multi-tab lifecycle,
  offline interactive map and optional browser ML remain outside this milestone.
- Remaining first task is 01-integrations. Broad P2/P4 work and final full
  regression matrix are unfinished; no merge or deployment has been attempted.

## 20 October 2026 — runtime outage bounds

- Isolated operational metadata into a two-connection pool with 3-second connect
  and 5-second query/statement budgets. Added a 30-second circuit after failure;
  public observations fall back honestly rather than repeatedly waiting per bucket.
  Production runtime TLS verifies certificates. Existing application pool unchanged.
- Atomic first-seen writes preserve earlier in-memory observations on recovery.
  Tests execute the revised multi-row PostgreSQL upsert and verify circuit behavior.
- Checks: 380 passed, 5 skipped (90 files passed); production build, standalone
  typecheck and targeted lint passed. Repeated contention confirmed that PGlite
  can exceed 30 seconds when a build runs concurrently. Run CPU-heavy build and
  database-test milestones sequentially; no test deadline was weakened.
- Next in progress: organization-scoped, source-linked forecast records and Brier
  scoring. The forecast migration was generated locally, not applied to a database.

## 20 October 2026 — sourced forecast register

- Added authenticated organization forecast panel/API: question, evidence URL,
  analyst probability, prospective horizon and rationale. Initial inputs remain
  immutable; after the horizon an authorized analyst can record one sourced
  outcome. Binary Brier score is shown transparently, unresolved = unscored.
- Additive migration has forced RLS and no browser write policies/grants. Tests
  execute real SQL for two tenants, horizon gating, immutable probability,
  repeat-resolution prevention and browser-role isolation. The migration is not
  applied to a live database. No automatic prediction or source scraping occurs.
- API exposes write capability; UI waits for access checks and viewers get read-only
  controls. Signed-out browser prompt and safe return link verified. Screenshot:
  screenshots/forecasts-signed-out.jpg. Authenticated production UI remains pending.
- Checks: 386 passed, 5 skipped (92 files passed); production build, standalone
  typecheck and targeted lint passed. Built browser token-format scan found zero
  matches in 61 JavaScript chunks, without reading env files or printing values.
- Broad specialist coverage, global UX/API and end-to-end validation still need
  work. Deployment remains last; this does not satisfy the condition for merging.

## 20 October 2026 — hazard matching and conflict-location honesty

- Added a public hazard map with source-retaining possible duplicate groups,
  family-specific spatial/time/name rules and ambiguity preservation. No transitive
  merging or same-provider different-ID merging. Unknown/future/unlocated records
  stay separate; tenant records are excluded. See docs/HAZARD_MATCHING.md.
- GDACS normalized parser/adapter is registered but disabled: commercial reuse
  remains unknown from the accessible specific terms. Admin Integrations/Health
  flag it, and direct fetch/registry tests prove it makes no requests. Keyless
  status is not treated as permission. Legacy GDACS RSS rights still need audit.
- Local audit: 27 USGS quake records and 100 open NASA EONET metadata records;
  127 separate groups, zero cross-source matches in this selection. GDACS skipped.
  That is not a validated-corroboration or complete global-coverage claim.
- Found and removed legacy conflict coordinate offsets and fetch-time event dates
  assigned to headline mentions. Conflict references now say REFERENCE, have null
  update/reference dates, and assert no validated active-warzone count. Actual
  source-reported news points retain their original coordinates/publication times.
  Source failure clears points instead of manufacturing fallback incidents.
- Route/hazard maps disable conflict/private SDK overlays. Disabled conflict layers
  do not fetch that endpoint. Non-country official source caches are shared across
  country selections, preserving the intended source cadence.
- Checks: 397 passed, 5 skipped (96 files passed); production build, standalone
  typecheck, targeted lint and whitespace check passed. Browser hazard filter/map
  checked; screenshot screenshots/natural-hazards.jpg, audit hazard-audit.json.
  Remaining broad P2/P4 and end-to-end checks are still unfinished.

## 20 October 2026 — provider map readiness repair

- Fixed provider overlays skipped when data arrives before the MapLibre style is
  ready. Bindings now wait for readiness, restore after style replacement and
  remove handlers/layers on cleanup. Invalid layer retries are bounded.
- Regression tests cover readiness, repeated style events, line/polygon restoration,
  click cleanup and failure bounds. Production browser visibly rendered all three
  selected METAR stations and both the Suez baseline and Cape alternative routes.
  Screenshots: screenshots/aviation-metar-map.jpg, screenshots/route-rendered.jpg.
- Checks including the in-progress aviation milestone: 408 passed, 5 skipped
  (99 files passed); production build, standalone typecheck and targeted lint passed.
  Built-client token-format scan: 63 chunks, zero findings. Broader parity remains
  unfinished; deployment remains last and no merge was attempted.

## 20 October 2026 — US aviation status and weather

- Added fixed official FAA public status metadata plus NOAA/NWS US K-station
  METAR/TAF providers, registered licence/attribution/rates/keyless defaults, and
  centralized inventory (62 services, 119 empty configuration identifiers).
- Public aviation panel filters source categories and documented display priorities,
  preserves observation/issue/validity/retrieval dates, flags old/future/expired data,
  shows forecast periods separately, exports CSV and plots source station coordinates.
  FAA conditional/scheduled notice categories never imply full-airport closure.
- Audit parsed 5 FAA notices, 3 METAR and 3 TAF products. Ground-stop/delay parsing
  is fixture-tested, absent from this live sample. No global NOTAM coverage claim.
  Sources are bounded/cached; AWC requests spaced/capped; last-good data labelled stale.
- Checks: 408 passed, 5 skipped (99 files passed); production build, standalone
  typecheck and targeted lint passed. Browser checked METAR points and TAF periods.
  See aviation-audit.json and screenshots/aviation-{metar-map,taf}.jpg. Deployment
  remains last. First unfinished integration task and broad P2/P4 remain pending.

## 20 October 2026 — research and SDK setup safeguards

- Added an admin three-step setup wizard with credential-free drafts, private
  environment templates, research connection check and synthetic SDK test button.
  Public readable setup guides are generated from the repository documentation.
  Keys stay server-side; the wizard saves no credentials or configuration.
- Research health is authenticated and checked before context leaves Ophanim.
  Shared transport pins DNS for public/trusted local origins, rejects redirects
  and metadata targets, bounds response size and applies one DNS/socket/body
  deadline. A late DNS answer cannot open a request after the deadline.
- SDK diagnostic uses actual server credential/ingestion validation but never
  stores/maps/streams the synthetic entity. Admin and matching tenant required;
  arbitrary credentials/URLs/entities are rejected by the setup-test API.
- SDK ingestion now bounds actual streamed JSON, preserves unknown/zero confidence,
  separates observation/receipt times, and keeps update revisions separate from
  timestamps. Tenant configuration changes clear process data and close old streams.
- Checks: 424 passed, 5 skipped (103 files passed); production build, standalone
  typecheck and targeted lint passed. Built-client scan: 64 chunks, zero findings.
  Production browser checked public guide and sign-in return prompt. HTTP checks
  cover signed-out APIs; explicit private no-store headers added to denied responses.
- Authenticated wizard/external worker validation, deployable isolated worker
  profiles and durable scoped SDK storage remain pending. Broad P2/P4 parity is
  unfinished; deployment remains last and the PR has not been merged.

## 20 October 2026 — dense provider point layers

- Provider point layers with 100+ points now use MapLibre worker clustering,
  48-pixel radius, zoom-14 cutoff, counted circles and expansion on selection.
  Original source data/evidence is retained; counts do not imply independent events.
  Late worker results cannot move a disposed/replaced map binding.
- Route Explorer optionally displays all 3,962 packaged Marnet port references,
  default off, with source/licence/dataset/import dates. Port SHA-256 is pinned and
  tested. No operating status or live vessel count is inferred from reference data.
- Tests cover 10,000 points with one source/three draw layers, style restoration,
  cleanup and late expansion results. Production browser rendered actual reference
  clusters, expanded Europe and retained Suez/Cape route lines with the layer on.
  Screenshots: clustered-reference-ports.jpg, expanded-port-cluster.jpg and
  routes-with-clustered-ports.jpg. No frame-rate/hardware benchmark claim.
- Checks: 428 passed, 5 skipped (104 files passed); production build, standalone
  typecheck, targeted lint and whitespace checks passed. Client scan: 64 chunks,
  zero known-token-format findings. Legacy bespoke layers/mobile GPU performance
  and the broader P2/P4 scope remain pending. Deployment remains last; no merge.
