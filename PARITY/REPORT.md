# Parity and reliability report — work in progress

Updated: 2026-10-21. Branch: `parity-and-reliability`.

This is an interim implementation report, not completed parity. Resume from
`state.json` and `PROGRESS.md`. No World Monitor code, styles, assets, API, embeds
or backend data were used for the new work. A pre-existing Logistics iframe and
its product-specific catalogue were removed and replaced with Ophanim controls.
No claim is made about the provenance of historical commits outside this work.

## Section 2: central keys

**Partial.** API_KEYS.md documents 65 service entries/groups and `.env.example`
contains 119 deliberately empty configuration identifiers, generated from source
without reading private environment files. The inventory includes keyless services,
credentials, optional workers, runtime settings and reserved-but-unused keys.
Some keyless catalogue entries group multiple operators (especially cameras and
maps); an exhaustive operator-level commercial-rights audit remains pending.

Admin → Integrations is owner-protected, searchable and environment-only. Credentials
are never accepted, echoed or stored by this page/API. Environment presence is
separate from observation. Read-only adapters test registered public endpoints,
compatible model lists and supported authenticated service metadata. Unsupported
protocols explicitly report configuration-only checks. Observations persist through
the private runtime schema, or a reported local-file/memory fallback. Browser AI
key inputs/storage were removed and server configuration overrides preferences.
Global key-required prompts, remaining protocol-specific adapters and setup-test
gating remain for other services. Research/SDK now have a three-step setup guide
and credential-free configuration drafts. Research health is checked before each
context-bearing request; SDK has a protected, tenant-matched synthetic diagnostic
through real ingestion validation, with no map/stream mutation. No UI
credential-saving feature is exposed.

Full service/variable/unlock/price/access/fallback tables: [API_KEYS.md](../API_KEYS.md).
No real keys were invented, requested, inspected or added.

Key dependencies include:

| Feature | Required configuration | Keyless behaviour |
| --- | --- | --- |
| Compatible hosted AI / Mistral | AI_BASE_URL, AI_MODEL, AI_API_KEY | Deterministic views; explicitly allowed local inference can omit key |
| Gemini briefings | GEMINI_API_KEY_1 through _8 | Compatible/local AI or no AI |
| Semantic knowledge | EMBEDDING_BASE_URL, EMBEDDING_MODEL; optional EMBEDDING_API_KEY | Lexical search; no fake embeddings |
| Streaming/global AIS | AIS_API_KEY or customer AIS URL/token or MarineTraffic URL/key, plus AIS_ORGANIZATION_ID | Public regional Digitraffic coverage; licensed feeds require matching organization sign-in |
| OpenSky quota | OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET | Existing public ADS-B, source terms apply |
| Shodan | SHODAN_API_KEY; authorized scan targets for scans | Other cyber providers |
| ThreatFox | THREATFOX_AUTH_KEY | Permitted keyless cyber sources |
| Research | AI_SANDBOX_RESEARCH_URL/TOKEN or separate VOIDACCESS credentials | Optional research unavailable |
| Recon | SCANNER_URL/KEY | Optional scanner unavailable |
| Private SDK | SDK_INGEST_KEY, SDK_ORGANIZATION_ID | Disabled; public map remains available |
| Organization storage/auth | DATABASE_URL; optional Supabase public/server settings | Public feeds remain accessible |
| Emails | RESEND_API_KEY, RESEND_FROM; webhook/cron secrets as applicable | In-app results only |
| Customer notices/sanctions/observations | Configured feed URLs and rights review | No fabricated coverage |
| FIRMS area API / N2YO | Reserved FIRMS_API_KEY / N2YO_API_KEY | Existing FIRMS CSV/EONET/orbit sources; these variables do not implement adapters |

## Section 3: capability coverage

“Partial” includes inherited functionality where the requested extension is still
unfinished. “Blocked” below means that the specific capability is not implemented;
the reason states the missing work rather than implying that keys alone will fix it.

| Capability | Status | Evidence / remaining work |
| --- | --- | --- |
| Story clustering and deduplication | Partial | Stories tab, canonical URLs, Unicode titles, token similarity/window, counts and evidence. First-seen persists using atomic earliest-observation writes; explicit memory fallback. No durable cluster membership history. |
| Entity extraction/correlation | Partial | Dated ICU/CLDR English/Arabic labels for 249 country/territory codes, conservative ambiguous aliases, longest-country-span matching, explicit IMO/MMSI/ICAO24 and linked article IDs. Asset/city dictionary remains small; public-role names require explicit review; universal cross-feed graph remains pending. |
| Geographic convergence | Partial | Configurable tested score, independent operators/types, all contributions. Desk wires reported news, seismic and dated FIRMS fire observations; other disruption adapters and alert delivery pending. |
| Source trust tiers | Partial | Manual tier/affiliation/risk metadata in Stories/news; minimum tier for convergence. Other evidence screens and persisted alert rules pending. |
| Why it matters | Partial | Labelled deterministic inference in Stories. Broader event/asset exposure integration pending. |
| Larger vetted multilingual news catalogue | Partial | Six official advisory sources added, including NHC English/Spanish, with explicit source rights. Broad regional media catalogue and optional labelled translations remain pending. |
| Freshness/intelligence gaps | Partial | Sources tab: actual success/check/newest times, stale cache, errors, empty/undated gaps. Geographic/layer-wide coverage matrices pending. |
| Aviation disruption | Partial | FAA public ground-stop/delay/closure metadata and selected US METAR/TAF panel, documented weather thresholds, source dates, optional native map and CSV. Worldwide NOTAM and international weather rights remain pending; conditional notices do not establish full airport closure. |
| Maritime chokepoint monitoring | Partial | Existing regional AIS/count context retained; global coverage, transit baselines and trends pending. |
| Vessel density | Blocked | Density aggregation and UI not implemented. |
| AIS gaps | Blocked | Permitted historical observation store and conservative gap detection pending. |
| Dedicated Hormuz panel | Blocked | Specialist panel not implemented. |
| GNSS interference | Partial | Existing map controls retained outside new catalogue; permitted sourced detector/layer audit pending. |
| Cable faults/repair monitoring | Partial | Existing reference geometry retained; permitted notices and repair-vessel evidence pending. |
| Infrastructure cascade | Blocked | Dependency graph/model and UI not implemented. |
| Corroborated unrest/conflict | Partial | Removed fabricated coordinate offsets/fetch-time event dates from legacy conflict news. Fixed areas now labelled undated reference; reported news points preserve source dates. Corroborated conflict datasets/independence scoring remain pending. No ACLED adapter added. |
| Regional cyclone warnings | Partial | NHC Atlantic/Eastern Pacific/Spanish official advisories. Arabian Sea, Bay of Bengal and other regional centres remain pending. |
| Cross-source hazard deduplication | Partial | Source-retaining hazard groups, anchored spatial/time/name matching, ambiguity preservation and native map. USGS/EONET active; GDACS parser registered but disabled by unresolved commercial rights. |
| Climate anomalies | Blocked | Open-dataset importer and anomaly calculation not implemented. |
| Displacement/population exposure | Blocked | Permitted population-grid importer and footprint estimates not implemented. |
| Official travel/security advisories | Partial | UK FCDO country selection, source date/link, rights and freshness. Additional governments and country-wide aggregation remain pending. |
| Civil-defence alerts | Partial | Official NWS public weather warnings with severity mapping; national siren/civil-defence feeds remain pending. Coverage explicitly limited to the United States. |
| Disease outbreaks | Partial | CDC Travel Health Notices panel, original dates and source links; broader official health-agency coverage remains pending. |
| Critical minerals/energy | Blocked | Dated licensed reference importers and disruption panel not implemented. |
| Radiation monitoring | Blocked | Permitted official monitoring adapter not implemented. |
| Trade/tariffs/supply-chain/tenders | Partial | Existing Logistics workspace preserved; public policy/tender adapters pending. |
| Markets/crowd forecasts | Partial | Existing price context retained; licensed stress composite/forecasts and edition default review pending. |
| Country dashboards | Partial | Existing dossier/heuristic country view; unified inputs and transparent score redesign pending. |
| Unified threat timeline | Partial | Existing news/seismic chronology retained; remaining event types pending. |
| Route Explorer | Partial | Pinned Apache-2.0 sea network, port search, eight passage choices, alternatives, extra distance/days, public hazard context and native map. Endpoint connectors are explicitly unrouted; road/rail legs remain pending. |
| Scenario engine | Partial | Four hypothetical templates assess session-scoped organization shipments, with exact port resolution, unknowns, calculations, CSV and browser Print / Save PDF. Up to 200 records; no persisted scenarios or capacity/queue simulation. |
| Deduce/what-if analyst | Blocked | Sourced structured FACT/INFERENCE analysis experience pending. |
| Forecast panel/scoring | Partial | Organization-scoped analyst probability register, evidence/horizon, immutable initial record, sourced outcome after horizon and binary Brier score. Forced RLS and API guards tested; live migration/authenticated browser validation pending. No automated predictions or validated accuracy claim. |
| Panel management | Blocked | General drag/resize/layout persistence not implemented. |
| Dense marker clustering/LOD | Partial | Provider point layers cluster at 100+ points using one worker source and three draw layers, with count labels/expansion/style restoration. Production browser checked 3,962 dated reference ports and route coexistence. Legacy bespoke layers and measured GPU/mobile load validation remain pending. |
| Global Ctrl/Cmd+K and shortcut help | Partial | Existing search retained; unified keyboard palette/help pending. |
| Share links/snapshots | Partial | Public Atlas settings links restore camera, projection, basemap and exact layer selection; private/unreviewed flags block sharing. Current-data disclosure, no private IDs. Full authenticated map/time/data snapshots and desk filters remain pending. |
| Seen/unseen activity | Partial | Existing browser news-read IDs; organization/user-wide activity pending. |
| Custom monitors/email | Partial | Existing watchlists and email retained; universal entity/place highlights pending. |
| Official embeddable video | Partial | Existing media retained; permitted operator-level catalogue audit pending. |
| English/Arabic RTL UI | Blocked | Entity matching supports Arabic; full interface localization/RTL not implemented. |
| Mobile/onboarding | Partial | Existing mobile desk retained; broader responsive/default-layer/welcome redesign pending. |
| PWA/offline/browser ML | Partial | Installable manifest, public offline shell, saved filtered official-advisory snapshot and offline banner. APIs/private HTML excluded from caching. Browser server-down fallback verified; device installation, map snapshots and optional browser ML remain unverified/unimplemented. |
| Optional desktop package | Blocked | Deferred until required web capabilities are implemented. |
| Organization API keys/OpenAPI/read-only MCP | Blocked | Scoped hashed keys, rotation, limits and agent endpoints not implemented. |
| Signed webhook subscriptions | Blocked | HMAC/retries/pinned SSRF-safe delivery not implemented. |
| SDK/CLI after API stability | Blocked | Public API stability prerequisite unmet. Existing private ingestion is a separate interface. |
| Public read-only map widget | Blocked | Independent public-layer embed not implemented. External product embed removed. |
| Focused editions | Partial | Existing edition configuration retained; new specialist configurations pending. |

## Section 4: limitations

| Limitation | Fixed here | Still outstanding |
| --- | --- | --- |
| 4.1 Feed health | News timeout/backoff/circuit/cache, persistent connection observations, optional health worker and sustained-outage email; six new official-source payloads parsed in local audit | Complete all-provider/item-age audit, universal durable last-good caches and labelled replay snapshots |
| 4.2 Keys/separate services | Central empty inventory, server-only AI credentials, protected connection adapters, optional Compose health profile | Remaining optional service containers, protocol adapters and universal unavailable-service states |
| 4.3 Static reference data | Native Logistics reference labels; route dataset pinned by version/date/hash/licence | Scheduled authoritative importers, change history and live asset-status overlays |
| 4.4 Periodic refresh | News says Every 300 s; public advisories receive SSE revision notifications from shared 300-second polling; source cadence is explicit | Other map layers, cross-instance fanout and universal per-layer labels remain pending; country advice follows hourly cache |
| 4.5 Research/private SDK | Three-step setup wizard and public guides; authenticated research health gating and bounded/pinned transport; tenant-matched server SDK diagnostic without map mutation; bounded ingestion and honest unknown confidence/times | Deployable isolated worker profile, durable/scoped multi-tenant SDK storage, external sender and authenticated deployment validation |
| 4.6 Protected API UX | Integration sign-in prompt; safe login returnTo; SDK metadata/stream 401 signed-out and 403 other tenant | Remember-me choice, demo organization, full private-route regression suite and all protected-screen prompts |

SDK stream no longer invents nine connected feeds or a latest update on connection.
Unknown observation timestamps remain unknown; receipt time is separate. The
legacy ingestion credential still authorizes machine-to-server POST without a
browser session. One tenant per configured worker; no multi-tenant SDK claim.
SDK request bodies are now streaming-bounded to 1 MB, with at most 500 entities.
Changing the configured tenant clears its process-local store and closes old
streams. Unknown confidence remains null, including preservation of supplied zero.
Full private-data API audit remains outstanding.

## Sources and licences

The following independently implemented connectors/reference datasets were added.
No World Monitor request was made. Each new source has an existing-registry entry,
attribution, rate rules and explicit key requirements. All are keyless.

| Source | Licence | Commercial use | Default |
| --- | --- | --- | --- |
| NOAA/NWS public weather warnings | US government public domain, NWS-authored text | yes | on; US coverage |
| NHC Atlantic, Eastern Pacific and Atlantic Spanish RSS | US government public domain, NHC-authored text | yes | on; stated basin/language coverage |
| CDC Travel Health Notices | US government public domain, CDC-authored notices; excludes third-party media | yes | on |
| UK FCDO country travel advice | Open Government Licence v3.0; stated exclusions apply | yes | on when country selected |
| Marnet sea edges and ports, searoute-py 1.6.0 data | Apache-2.0 | yes | on; dated reference, no navigation claim |
| GDACS normalized hazard adapter | GDACS specific terms; commercial reuse unresolved | unknown | off; no requests, flagged in Admin |
| FAA NAS public airport status facts | US government public domain, FAA-authored metadata; excludes raw third-party/operator NOTAM text | yes | on; US national list, not full NOTAM coverage |
| NOAA/NWS US K-station METAR and TAF | US government public domain, NWS US products | yes | on; selected US stations, broader international rights gate retained |
| ICU/CLDR English/Arabic country and territory labels | Unicode License v3, full notice retained | yes | on; packaged reference, generated 2026-10-20 from ICU 78.3 / CLDR 48.0 / Unicode 17.0 |

Source terms and attribution are shown in the public advisory UI and declared in
`specialist-providers.ts`. Pinned network provenance, SHA-256 hashes, formulas and
limitations are in `docs/ROUTE_SCENARIO_METHODS.md`; original licence is included.
Country labels are generated from the attributed ICU/CLDR reference. Asset aliases
and ambiguity rules are manually curated Ophanim metadata. No name match supplies
event coordinates or a sovereignty/impact finding. See docs/ENTITY_DICTIONARY.md.
All future connectors must register licence name, yes/no/unknown commercial use,
attribution, rate limits and key requirement; no/unknown default off. The existing
provider registries still need comprehensive governance synchronization and audit;
do not infer permission from HTTP accessibility or this inventory.

Live audit: [feed-audit.json](feed-audit.json), reproducible with
`node PARITY/feed-audit.mjs`. Fourteen fixed public endpoints reached successfully.
This checks HTTP reachability only, not parsing, publication recency, legal rights,
coverage, a successful real-time subscription or every existing camera/operator.

## Checks and screenshots

- Before: typecheck/build passed; 311 tests passed, 5 skipped (68 files passed).
- Continuation milestone: 436 tests passed, 5 skipped (106 files passed); production
  build, standalone typecheck and targeted lint passed. One database-policy test
  timed out during the first unconstrained concurrent build/test run; rerunning
  with two test workers passed. These results include first-seen persistence and
  the source-date anomaly correction.
- Targeted security tests: protected integrations API; no arbitrary URL/key probe
  input; redacted errors; SDK read session/tenant gating; SSE timer cleanup; safe
  return destinations. An additive private-runtime migration was added and tested
  with PGlite; no live migration was applied. Tenant document policies were not changed.
- Resilience tests include 100 simultaneous callers sharing one source fetch.
  This is not a WebGL marker benchmark or many-browser SSE load test.
- Public updates: 1,000 hub listeners unit-tested; 12/12 concurrent local HTTP
  streams received a public polling notification in 2.63 seconds. See
  public-updates-load.json and docs/PUBLIC_UPDATES.md. These were HTTP clients,
  not full browsers or a cross-instance throughput benchmark.
- Browser verified official health filtering (21 publications) and connected
  polling-notification status: screenshots/official-health.jpg. A future-dated
  NHC source item is retained with an anomaly warning and excluded from ranking.
- Offline browser verification saved 21 public records, stopped the local server,
  navigated to another app page and read the cached offline shell/snapshot. Clear
  snapshot succeeded. Screenshot: screenshots/offline-public-snapshot.jpg. No
  organization data was cached or authenticated account used in this check.
- Forecast PostgreSQL fixtures verify cross-tenant isolation, future-horizon
  gating, immutable probabilities, one-time outcome resolution and browser-role
  RLS denial. Signed-out browser prompt/return link verified in
  screenshots/forecasts-signed-out.jpg. No live forecast migration was applied.
- Aviation audit parsed 5 FAA closure/restriction notices, 3 METAR observations and
  3 TAF products with no missing selected stations. No ground stop/delay programme
  occurred in this sample; those parser branches are fixture-tested. See
  aviation-audit.json, screenshots/aviation-taf.jpg and aviation-metar-map.jpg.
- Browser verification found and fixed provider overlays skipped before map style
  readiness. Regression tests cover readiness/style replacement/cleanup. Three
  airport points and both sea-route alternatives visibly rendered in production;
  route screenshot: screenshots/route-rendered.jpg.
- SDK setup tests cover signed-out/non-admin/wrong-tenant rejection, no arbitrary
  URL/key input, actual credential validation and diagnostic non-mutation. Transport
  tests cover DNS deadline/late-answer rejection, socket address pinning, redirects,
  link-local/mapped-metadata rejection, response bounds and invalid JSON. Research
  context is withheld when health fails. No actual external worker was used.
- Public setup guide and signed-out integrations prompt checked in the production
  browser. Screenshot: screenshots/sdk-setup-guide.jpg. Local HTTP security audit:
  setup-security-audit.json. Authenticated wizard interaction remains unverified.
- Dense provider-point tests bind 10,000 fixture points without per-point layers,
  preserve original data and discard late cluster-worker responses after cleanup.
  Production browser rendered 3,962 packaged reference points, expanded a European
  cluster and retained both sea routes with the port layer enabled. Screenshots:
  clustered-reference-ports.jpg, expanded-port-cluster.jpg, routes-with-clustered-ports.jpg.
  This is functional rendering evidence, not a frame-rate or hardware benchmark.
- Country dictionary tests cover all 249 scoped identities, English/Arabic aliases,
  Arabic conjunction/preposition matching, withheld ambiguous names, longer-country
  spans and cross-publisher links. Production Atlas Stories showed 26 linked
  entities in the available 77-item sample and rendered the source/version/date
  disclosure. Screenshot: screenshots/country-dictionary-provenance.jpg.
- Public map link opened in a fresh production-browser tab, retaining centre,
  2D/night and all layers off beyond the geolocation timer. Renderer zoom clamps
  to its existing 1.5–18 range. Fixed zero-zoom fallback, implicit conflict layer,
  overlapping share panel and selected-layer/health wording. Unit URL/privacy
  checks passed. Screenshot: screenshots/public-map-share.jpg.
- Built-client known-token-format scan: 64 JavaScript chunks, zero findings; see
  client-secret-audit.json. This limited pattern scan is not a proof about all
  arbitrary secret formats or every runtime API response.
- Full requested Playwright/layout/RTL/mobile/Presentation regression matrix,
  authenticated integration UI and broader runtime-secret checks remain pending.
- Signed-out integrations screenshot: `screenshots/integrations-signed-out.jpg`.
- Stories screenshot: `screenshots/stories.jpg`.
- Sources and native Logistics screenshots: `screenshots/sources.jpg`,
  `screenshots/logistics-native.jpg`. Mobile sign-in prompt/return-link check at
  390px: `screenshots/integrations-mobile.jpg`. This is not the full mobile matrix.
- Additional browser verification and final standalone typecheck results are
  recorded in PROGRESS.md. Screenshots must not imply authenticated flows passed.

## Git and review

Commits include task-owned files only; pre-existing dirty Shodan/freshness/search
changes are preserved. `.env.example` was intentionally consolidated. The branch
inherits local committed work newer than the remote foundation branch; its PR must
disclose that ancestry. The new work does not justify merging unfinished parity.
Draft pull request: https://github.com/leo777-debug/OPHANIM-V3/pull/25. Not merged.
All checks above ran against the shared checkout, which includes preserved
pre-existing uncommitted work. A clean-checkout CI run remains required before merge.

**Baseline reconciliation required.** GitHub reports the actual default branch as
`feat/gdacs-weather-ai-overview`, fetched at `d22f6a0`; this working branch lacks 21
of its commits. They contain Presentation mode, operational homepage, fullscreen,
entity selection, Vercel output and AI reliability/configuration changes. PR #25
currently targets the older `codex/ophanim-foundation-worldmonitor` instead.
This was discovered during the browser/ancestry audit; previous checks do not
validate preservation of the current default branch. Integrate in an isolated
worktree, preserve unrelated local edits, retarget the draft PR appropriately and
re-run regressions before any merge or deployment. See task 00a in state.json.

Combined default integration (20 October): default d22f6a0 is now reconciled in the isolated managed worktree, preserving Presentation, shared map and current AI behavior with server-only credentials. Anonymous demo auth fallback removed to maintain session requirements. Clean combined suite: 529 passed, 5 skipped; typecheck/build/targeted lint passed. Earlier screenshots/checks remain historical. Dependency audit contains critical Next.js/MapLibre findings; remediation and renewed browser checks are pending. PR base has not yet been retargeted.

Dependency remediation: Next16.4.2/MapLibre6.15.0/Sharp0.35.5 pinned, compatible transitive fixes applied. 531 tests passed, 5 skipped; typecheck/lint/Webpack build passed. Production audit zero findings; five dev-only lint-chain high advisories remain without a compatible patch. See docs/DEPENDENCY_SECURITY.md. Browser validation is running, not yet passed.

21 October: public maritime projector now uses a separate keyless-only path/cache; licensed AIS requires session and AIS_ORGANIZATION_ID match, with private/no-store and pinned transport. Legacy maritime snapshots without public-only provenance are withheld. News/quake provenance survives projection; replay disables current convergence. Latest isolated checks: 538 passed, 5 skipped; typecheck/lint/production build passed. Presentation browser run restarted after interruption and remains pending. See docs/PUBLIC_MAP_PRIVACY.md.

21 October browser follow-up: real Integrations suite passed seven checks using local production routes, disposable SQL and synthetic accounts. Actual sign-in returns during Presentation, keys are not accepted or displayed, licence gating applies, blocked connections persist Error across reload, and SDK setup fits mobile. Shared canonical-origin checks fix valid mutation rejection behind normalized Next hosts; foreign/cross-site origins remain rejected. Latest 543 tests, typecheck, lint and rebuild passed. Full map aggregate is still running. Client pattern audit: 271 chunks, zero findings.

Combined baseline verification completed21 October:33 production-browser integration checks passed. This includes actual rendered globe/click details, 1920/1366/390 layouts, map/Full/PIN controls, tools, tabs, command palette, fresh unsigned public settings links, fullscreen sharing, private query isolation and real Integrations sign-in/licence/failure-persistence/mobile setup. Synthetic fixtures only, external API transport blocked; no upstream availability claim. No uncaught or unexpected browser console errors. Evidence: PARITY/presentation-validation/results.json and screenshots. Local default alignment is complete; broad parity is still partial.

Standalone-map milestone: 548 tests passed/5 skipped, typecheck/lint/build passed. Keyless basemap and bounded initial fallback now apply to Route/Hazard/Aviation maps; original hidden-attribution CSS removed. Metadata for two permitted map sources added, bringing inventory to65 services/119 empty identifiers. Actual font404 repaired with an available Noto font. Native browser verified attributed fallback,3962 real reference ports, Dubai–Rotterdam/Suez alternative model, CSV and Hazard/Aviation recovery. Updated Integrations mobile configuration/disabled cues passed. Source dates remain unknown when not supplied. See docs/BASEMAP_RELIABILITY.md and PARITY/presentation-validation/native-results.json. Broad parity remains incomplete.
