# Parity and reliability report — work in progress

Updated: 2026-10-20. Branch: `parity-and-reliability`.

This is an interim implementation report, not completed parity. Resume from
`state.json` and `PROGRESS.md`. No World Monitor code, styles, assets, API, embeds
or backend data were used for the new work. A pre-existing Logistics iframe and
its product-specific catalogue were removed and replaced with Ophanim controls.
No claim is made about the provenance of historical commits outside this work.

## Section 2: central keys

**Partial.** API_KEYS.md documents 60 service entries/groups and `.env.example`
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
gating remain. No UI credential-saving feature is exposed.

Full service/variable/unlock/price/access/fallback tables: [API_KEYS.md](../API_KEYS.md).
No real keys were invented, requested, inspected or added.

Key dependencies include:

| Feature | Required configuration | Keyless behaviour |
| --- | --- | --- |
| Compatible hosted AI / Mistral | AI_BASE_URL, AI_MODEL, AI_API_KEY | Deterministic views; explicitly allowed local inference can omit key |
| Gemini briefings | GEMINI_API_KEY_1 through _8 | Compatible/local AI or no AI |
| Semantic knowledge | EMBEDDING_BASE_URL, EMBEDDING_MODEL; optional EMBEDDING_API_KEY | Lexical search; no fake embeddings |
| Streaming/global AIS | AIS_API_KEY or customer AIS URL/token or MarineTraffic URL/key | Regional Digitraffic coverage |
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
| Entity extraction/correlation | Partial | Dictionary, English/Arabic aliases, valid explicit IMO/MMSI/ICAO24, linked article IDs. Small gazetteer; public-role names require explicit dictionary; not all feeds wired. |
| Geographic convergence | Partial | Configurable tested score, independent operators/types, all contributions. Desk wires reported news, seismic and dated FIRMS fire observations; other disruption adapters and alert delivery pending. |
| Source trust tiers | Partial | Manual tier/affiliation/risk metadata in Stories/news; minimum tier for convergence. Other evidence screens and persisted alert rules pending. |
| Why it matters | Partial | Labelled deterministic inference in Stories. Broader event/asset exposure integration pending. |
| Larger vetted multilingual news catalogue | Partial | Six official advisory sources added, including NHC English/Spanish, with explicit source rights. Broad regional media catalogue and optional labelled translations remain pending. |
| Freshness/intelligence gaps | Partial | Sources tab: actual success/check/newest times, stale cache, errors, empty/undated gaps. Geographic/layer-wide coverage matrices pending. |
| Aviation disruption | Partial | Existing gated METAR provider. Delays, ground stops, permitted NOTAM and TAF layers pending. |
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
| Dense marker clustering/LOD | Partial | Existing map preserved; new all-layer clustering/load validation pending. |
| Global Ctrl/Cmd+K and shortcut help | Partial | Existing search retained; unified keyboard palette/help pending. |
| Share links/snapshots | Partial | Existing routing/shared verification retained; full map/time/data snapshots pending. |
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
| 4.5 Research/private SDK | Setup docs; SDK reads require session and matching configured tenant; unset configuration disabled | Wizard, actual connection-test gating, send-test-event, durable/scoped SDK storage |
| 4.6 Protected API UX | Integration sign-in prompt; safe login returnTo; SDK metadata/stream 401 signed-out and 403 other tenant | Remember-me choice, demo organization, full private-route regression suite and all protected-screen prompts |

SDK stream no longer invents nine connected feeds or a latest update on connection.
Unknown observation timestamps remain unknown; receipt time is separate. The
legacy ingestion credential still authorizes machine-to-server POST without a
browser session. One tenant per configured worker; no multi-tenant SDK claim.
Request body streaming limits and full private-data API audit remain outstanding.

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

Source terms and attribution are shown in the public advisory UI and declared in
`specialist-providers.ts`. Pinned network provenance, SHA-256 hashes, formulas and
limitations are in `docs/ROUTE_SCENARIO_METHODS.md`; original licence is included.
The small entity dictionary is manually curated Ophanim reference metadata.
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
- Continuation milestone: 397 tests passed, 5 skipped (96 files passed); production
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
- Built-client known-token-format scan: 61 JavaScript chunks, zero findings; see
  client-secret-audit.json. This limited pattern scan is not a proof about all
  arbitrary secret formats or every runtime API response.
- Full requested Playwright/layout/RTL/mobile/Presentation regression matrix,
  authenticated integration UI and browser-bundle secret scanning remain pending.
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
