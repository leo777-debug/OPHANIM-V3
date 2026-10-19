# Parity and reliability report — work in progress

Date: 2026-10-19. Branch: `parity-and-reliability`.

This is an interim implementation report, not completed parity. Resume from
`state.json` and `PROGRESS.md`. No World Monitor code, styles, assets, API, embeds
or backend data were used for the new work. A pre-existing Logistics iframe and
its product-specific catalogue were removed and replaced with Ophanim controls.
No claim is made about the provenance of historical commits outside this work.

## Section 2: central keys

**Partial.** API_KEYS.md documents 52 service entries/groups and `.env.example`
contains 111 deliberately empty configuration identifiers, generated from source
without reading private environment files. The inventory includes keyless services,
credentials, optional workers, runtime settings and reserved-but-unused keys.
Some keyless catalogue entries group multiple operators (especially cameras and
maps); an exhaustive operator-level commercial-rights audit remains pending.

Admin → Integrations is owner-protected, searchable and environment-only. Credentials
are never accepted, echoed or stored by this page/API. Environment presence is
separate from observation. Five fixed public endpoints have reachability probes;
all other tests explicitly report configuration-only checks. Observations are
process-local and disappear on restart. Existing feature-specific credential UIs
have not yet all been consolidated. Global key-required prompts, authenticated
test adapters, durable last-fetch/error history and setup-test gating remain.

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
| Story clustering and deduplication | Partial | New Stories tab, canonical URLs, Unicode titles, token similarity/window, counts and evidence. First-seen bounded/process-local; no durable cluster history. |
| Entity extraction/correlation | Partial | Dictionary, English/Arabic aliases, valid explicit IMO/MMSI/ICAO24, linked article IDs. Small gazetteer; public-role names require explicit dictionary; not all feeds wired. |
| Geographic convergence | Partial | Configurable tested score, independent operators/types, all contributions. Desk wires news and seismic only; other type adapters and alert delivery pending. |
| Source trust tiers | Partial | Manual tier/affiliation/risk metadata in Stories/news; minimum tier for convergence. Other evidence screens and persisted alert rules pending. |
| Why it matters | Partial | Labelled deterministic inference in Stories. Broader event/asset exposure integration pending. |
| Larger vetted multilingual news catalogue | Blocked | Existing nine sources retained. No new feeds enabled; per-source commercial-rights review and translations pending. |
| Freshness/intelligence gaps | Partial | Sources tab: actual success/check/newest times, stale cache, errors, empty/undated gaps. Geographic/layer-wide coverage matrices pending. |
| Aviation disruption | Partial | Existing gated METAR provider. Delays, ground stops, permitted NOTAM and TAF layers pending. |
| Maritime chokepoint monitoring | Partial | Existing regional AIS/count context retained; global coverage, transit baselines and trends pending. |
| Vessel density | Blocked | Density aggregation and UI not implemented. |
| AIS gaps | Blocked | Permitted historical observation store and conservative gap detection pending. |
| Dedicated Hormuz panel | Blocked | Specialist panel not implemented. |
| GNSS interference | Partial | Existing map controls retained outside new catalogue; permitted sourced detector/layer audit pending. |
| Cable faults/repair monitoring | Partial | Existing reference geometry retained; permitted notices and repair-vessel evidence pending. |
| Infrastructure cascade | Blocked | Dependency graph/model and UI not implemented. |
| Corroborated unrest/conflict | Partial | Existing incident discovery retained; permitted conflict dataset/independence scoring pending. No ACLED adapter added. |
| Regional cyclone warnings | Partial | Existing weather/GDACS context; regional official-centre connectors pending. |
| Cross-source hazard deduplication | Partial | Existing normalized event keys; dedicated GDACS/EONET/USGS matching pending. |
| Climate anomalies | Blocked | Open-dataset importer and anomaly calculation not implemented. |
| Displacement/population exposure | Blocked | Permitted population-grid importer and footprint estimates not implemented. |
| Official travel/security advisories | Blocked | Country advisory connectors not implemented. |
| Civil-defence alerts | Blocked | Licensed official public-warning adapters not implemented. |
| Disease outbreaks | Blocked | Official health connector/panel not implemented. |
| Critical minerals/energy | Blocked | Dated licensed reference importers and disruption panel not implemented. |
| Radiation monitoring | Blocked | Permitted official monitoring adapter not implemented. |
| Trade/tariffs/supply-chain/tenders | Partial | Existing Logistics workspace preserved; public policy/tender adapters pending. |
| Markets/crowd forecasts | Partial | Existing price context retained; licensed stress composite/forecasts and edition default review pending. |
| Country dashboards | Partial | Existing dossier/heuristic country view; unified inputs and transparent score redesign pending. |
| Unified threat timeline | Partial | Existing news/seismic chronology retained; remaining event types pending. |
| Route Explorer | Partial | Existing port resolution; open routing network, alternatives and distance/time model pending. |
| Scenario engine | Blocked | Templates, tenant shipment exposure and CSV/PDF export not implemented. |
| Deduce/what-if analyst | Blocked | Sourced structured FACT/INFERENCE analysis experience pending. |
| Forecast panel/scoring | Blocked | Question/horizon/outcome/probability persistence and scoring pending. |
| Panel management | Blocked | General drag/resize/layout persistence not implemented. |
| Dense marker clustering/LOD | Partial | Existing map preserved; new all-layer clustering/load validation pending. |
| Global Ctrl/Cmd+K and shortcut help | Partial | Existing search retained; unified keyboard palette/help pending. |
| Share links/snapshots | Partial | Existing routing/shared verification retained; full map/time/data snapshots pending. |
| Seen/unseen activity | Partial | Existing browser news-read IDs; organization/user-wide activity pending. |
| Custom monitors/email | Partial | Existing watchlists and email retained; universal entity/place highlights pending. |
| Official embeddable video | Partial | Existing media retained; permitted operator-level catalogue audit pending. |
| English/Arabic RTL UI | Blocked | Entity matching supports Arabic; full interface localization/RTL not implemented. |
| Mobile/onboarding | Partial | Existing mobile desk retained; broader responsive/default-layer/welcome redesign pending. |
| PWA/offline/browser ML | Blocked | App shell/snapshots/service worker/browser inference not implemented. |
| Optional desktop package | Blocked | Deferred until required web capabilities are implemented. |
| Organization API keys/OpenAPI/read-only MCP | Blocked | Scoped hashed keys, rotation, limits and agent endpoints not implemented. |
| Signed webhook subscriptions | Blocked | HMAC/retries/pinned SSRF-safe delivery not implemented. |
| SDK/CLI after API stability | Blocked | Public API stability prerequisite unmet. Existing private ingestion is a separate interface. |
| Public read-only map widget | Blocked | Independent public-layer embed not implemented. External product embed removed. |
| Focused editions | Partial | Existing edition configuration retained; new specialist configurations pending. |

## Section 4: limitations

| Limitation | Fixed here | Still outstanding |
| --- | --- | --- |
| 4.1 Feed health | News timeout/backoff/circuit/cache, transparent stale labels; five integration probes; 14 live reachability probes all reached endpoints | Scheduled all-provider/payload audit, durable health metrics, admin outage email and replay snapshots |
| 4.2 Keys/separate services | Central empty inventory, protected status and clear configuration states | Optional Docker Compose services, actual per-service health tests and universal unavailable-service states |
| 4.3 Static reference data | Native Logistics controls explicitly label infrastructure/cable reference | Scheduled authoritative importers, versions/history and status overlays |
| 4.4 Periodic refresh | News says Every 300 s; existing SDK SSE remains periodic store checks with cancellation cleanup | Public normalized-event push, cross-instance fanout and per-layer refresh labels |
| 4.5 Research/private SDK | Setup docs; SDK reads require session and matching configured tenant; unset configuration disabled | Wizard, actual connection-test gating, send-test-event, durable/scoped SDK storage |
| 4.6 Protected API UX | Integration sign-in prompt; safe login returnTo; SDK metadata/stream 401 signed-out and 403 other tenant | Remember-me choice, demo organization, full private-route regression suite and all protected-screen prompts |

SDK stream no longer invents nine connected feeds or a latest update on connection.
Unknown observation timestamps remain unknown; receipt time is separate. The
legacy ingestion credential still authorizes machine-to-server POST without a
browser session. One tenant per configured worker; no multi-tenant SDK claim.
Request body streaming limits and full private-data API audit remain outstanding.

## Sources and licences

No new external data connector was enabled. New integration metadata/probes refer
to sources already consumed by Ophanim. No World Monitor request was made.
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
- Current: 343 tests passed, 5 skipped (75 files passed); production build passed.
- Targeted security tests: protected integrations API; no arbitrary URL/key probe
  input; redacted errors; SDK read session/tenant gating; SSE timer cleanup; safe
  return destinations. No database migration or tenant policy was changed.
- Resilience tests include 100 simultaneous callers sharing one source fetch.
  This is not a WebGL marker benchmark or many-browser SSE load test.
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
