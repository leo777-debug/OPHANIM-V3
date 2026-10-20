# World Monitor / Ophanim Comparison

Reviewed: 2026-10-08. This is a capability comparison, not a claim of complete parity.
No World Monitor code, styles, assets, API, embeds or backend data were used for
the parity-and-reliability work. Implementations are independent.

## Parity and reliability work (2026-10-19)

The active branch is `parity-and-reliability`. `PARITY/state.json` and
`PARITY/PROGRESS.md` are the resumable record; `PARITY/REPORT.md` records verified
coverage and outstanding work. This is not a claim of full parity.

Central configuration now has generated `API_KEYS.md`, an all-empty `.env.example`,
and an owner-protected Admin → Integrations page. Presence checks are distinguished
from actual endpoint reachability. Five fixed public probes are implemented;
authenticated probes and persistent fetch observations remain unfinished.
Credentials are environment-only and never returned by the integrations API.
No new external data connector is enabled by the integration inventory.

The Intel Desk now includes independent deterministic Stories analysis with
evidence-preserving groups, limited dictionary entities, manual trust metadata,
labelled context and a documented convergence method. Only news/seismic adapters
are wired for convergence; other source types remain pending. News gains bounded
last-good caching, coalesced requests, backoff/circuit protection and explicit
stale labels. See `docs/INTELLIGENCE_METHODS.md` for formulas and caveats.

The pre-existing Logistics World Monitor iframe and product-specific catalogue
were removed. Logistics uses Ophanim's native map and source-attributed controls.
Unsupported competitor catalogue entries are not treated as implementations.
SDK reads now require sign-in and the configured organization, and no longer
invent a latest source update or nine connected feeds. Setup wizard, durable
health/storage and the broader parity roadmap remain unfinished.

Reference material:
- https://github.com/koala73/worldmonitor
- https://www.worldmonitor.app/docs/features
- https://www.worldmonitor.app/docs/data-sources

## Existing Ophanim Capabilities Reused

| Area | Ophanim implementation | Qualification |
| --- | --- | --- |
| Globe and map | `src/app/atlas/page.tsx`, MapLibre map, layers, basemap controls, map workspaces | Preserved, not replaced with a second application. |
| Aircraft and vessels | Flights, maritime API routes, AIS configuration and entity interaction | Availability and coverage depend on configured sources. |
| Hazards and incidents | Earthquakes, fires, weather, incidents and GDACS route | The route named `gdelt` currently ingests GDACS; it is not evidence of a GDELT protest feed. |
| Infrastructure | Existing infrastructure, cable and satellite layers | Catalog labels alone do not prove live data integration. |
| Cyber intelligence | Cyber-threats, malware, OSINT routes, provider registry | Some providers require credentials or a separately installed service. |
| News and media | News API, live-news, LiveAlerts, camera routes | Public embeds may be unavailable or restricted by their publishers. |
| Markets and space weather | Existing markets, crypto and spaceweather APIs/panels | Preserved. |
| Regional context | Region dossier and country-risk API | Country risk is heuristic; do not advertise a validated instability index. |
| Monitoring | Watchlists, notifications, entity tracking, map tabs | Persisted operations depend on authentication/database configuration. |
| AI | Existing compatible-endpoint configuration, local model support and briefings | AI does not pick search providers. |
| Logistics | Imports, shipments, disruptions and operations workflows | These are additional Ophanim-specific capabilities, not gaps to replace. |

## Implemented In This Update

| Previously missing or limited capability | Addition |
| --- | --- |
| News search and filtering | Text, publisher, 1/6/24/48-hour or 7-day window, keyword score, unread filter. |
| News activity | Per-browser persistent read IDs; individual opening and bulk marking; synchronized browser tabs. |
| News export | Filtered CSV and JSON, with spreadsheet formula escaping. |
| News beyond the first 25 items | Load-more pagination for all loaded matching items. |
| Cross-stream chronology | Combined dated news and USGS earthquake timeline, type/time filters, source links and map navigation. |
| Regional coverage | Region mentions, report counts and distinct source counts; approximate map navigation. This is NOT proof of correlated events or a hostility prediction. |
| World clocks | UTC, New York, London, Dubai, Singapore and Tokyo, using DST-aware IANA time zones. |
| News ingestion breadth | BBC, Al Jazeera and GDACS now load alongside Telegram instead of only on failure. NASA releases and CISA advisories added. |
| Feed transparency | Individual availability, item count, checked time and latest publication time. Reachable feeds may still contain old publications. |
| News freshness | Atlas refreshes news every five minutes, matching the upstream request cache. |
| Mobile access | Expanded intelligence desk exposed through the mobile NEWS / INTEL controls. |

The nine configured news sources are BBC, Al Jazeera, GDACS, NASA, CISA,
OSINTtechnical, Faytuks, Liveuamap and CyberKnow. No existing sources were removed.
These are polled feeds, not streaming telemetry. The API does not invent publication
dates for undated stories. Keyword-derived locations remain approximate. Source
summaries and links do not transfer publisher ownership or republication rights.

## Remaining Differences

The earlier catalogue in `src/lib/world-monitor-layers.ts` has now been removed,
along with its external product iframe. That catalogue was never evidence of native
connectors. The broader specialist work below remains unfinished.

| Area | Remaining work |
| --- | --- |
| News catalog parity | Vet a larger source catalog, regional/language coverage and redistribution terms. Nine sources is not catalog parity. |
| Event analysis | Entity-aware story clustering, deduplication across publishers, escalation/baselines and evidence-backed cross-stream convergence. Regional mentions do not substitute for this. |
| Additional public datasets | Dedicated connectors for disease outbreaks, airport delays, pipelines, data centers, critical minerals and other unsupported catalog entries. Each needs a verified source, normalization and map UI. |
| Credential-dependent datasets | ACLED-style events, outages, radiation or other datasets where usable access needs configuration or specific permissions. Do not silently simulate results. |
| Economic depth | Prediction markets, macroeconomic series, rate dashboards, trade and national-resilience models, with independent source validation. |
| Country analytics | Replace static/heuristic risk with an independently specified, tested scoring model before claiming comparability. |
| Interface customization | General draggable/resizable/reorderable panel layouts and saved dashboard arrangements. Existing map tabs are retained. |
| Desktop/offline | Native desktop packaging, offline datasets and offline inference beyond connecting to an already running local server. |
| Localization | Full translated interface and right-to-left layouts. |
| Specialist experiences | Separate technology/finance/other domain editions, route scenarios and specialized analytical dashboards. |

No paid/contract-only feeds are enabled by this work. Check Point live data, for
example, must not be scraped or rebroadcast without permitted access. Future
connectors should follow Ophanim's registry/normalization contracts and preserve
deterministic provider selection. No unnecessary connection to a second Osiris
deployment is introduced.

## Testing

1. Run `npx vitest run` and `npx tsc --noEmit`.
2. Open `http://localhost:3000/atlas`, then INTEL DESK (mobile: NEWS).
3. In NEWS, select a publisher, search a headline term, change the time/score
   filters, and confirm the matching count changes. Clear filters when testing
   feeds whose most recent publications are old.
4. Export CSV and JSON. Check that only matching rows are included. Mark matching
   news as read, turn on Unread, and reload to verify saved activity.
5. Open TIMELINE, filter earthquakes, and use a map-location button. News without
   publication dates must not appear as newly dated events.
6. Open REGIONS and check the approximate-location warning. Source counts count
   publishers, not the number of articles.
7. Open SOURCES and check each of the nine feeds independently; compare publication
   times with checked times. Offline or failed sources must not crash the others.
8. Open CLOCKS and verify all six tick. Repeat at a 390px-wide mobile viewport;
   the tab row scrolls and the desk must remain within the screen.

Automated tests cover combined filtering, invalid/future timestamps, stable URL
deduplication, safe external links, CSV escaping, regional source counts, timeline
ordering, RSS plus Telegram ingestion, reported coordinates, and partial/all-source
failures without live network dependency.

## Files Changed By This Comparison Update

- `src/app/api/news/route.ts`
- `src/app/api/news/route.test.ts` (new)
- `src/app/atlas/page.tsx`
- `src/components/IntelFeed.tsx`
- `src/components/IntelligenceWorkbench.tsx`
- `src/components/intelligence/IntelligenceExplorer.tsx` (new)
- `src/components/intelligence/desk.module.css` (new)
- `src/components/intelligence/useReadNews.ts` (new)
- `src/lib/intelligence/news.ts` (new)
- `src/lib/intelligence/news.test.ts` (new)
- `docs/WORLD_MONITOR_COMPARISON.md` (new)

The separately pending local-AI changes are preserved, but are not attributed to
this comparison update. No GitHub commit or deployment is implied by this document.

## Independent parity continuation — 20 October 2026

No World Monitor code, styles, assets, API, embeds or backend data were used.
The following additions use Ophanim's own components and documented original
sources. This remains an incomplete parity project; see PARITY/state.json.

- Admin integrations now persist connection observations in a private runtime
  schema, or an explicitly reported local-file/memory fallback. An optional
  health worker checks connections and sends configured critical-outage emails.
  A successful connection is not a claim of current item coverage.
- Official public advisories use NOAA/NWS, NHC (English and Spanish), CDC and
  UK FCDO sources, with source-specific rights, coverage and polling metadata.
  Their timeline supports filtering and CSV. NHC coverage does not include the
  Arabian Sea or Bay of Bengal. NWS weather warnings are not global siren feeds.
- Route Explorer independently calculates shortest sea paths and closed-passage
  alternatives over pinned Apache-2.0 Marnet reference data. It shows distance,
  constant-speed days, unrouted endpoint connectors and public hazard context.
  It does not provide navigation or actual road/rail routing.
- Four hypothetical scenario templates assess the signed-in organization's
  recorded shipment ports. Every modeled exposure includes inputs, calculation,
  unresolved records and limitations. Private CSV and browser Print / Save PDF
  exports require access to the private results.

Dataset provenance and formulas: docs/ROUTE_SCENARIO_METHODS.md. New official
source declarations live in specialist-providers.ts and the existing event
provider registry. Founder configuration remains centralized in API_KEYS.md.
Public advisory updates use Ophanim SSE revision notifications over explicitly
periodic polling. Source cadence remains visible; no continuous upstream stream
is implied. See docs/PUBLIC_UPDATES.md for capacity and instance limitations.
The independent public offline shell now stores a deliberately saved, filtered
official-advisory snapshot with explicit offline timestamps. It caches no private
HTML or API responses; offline interactive maps are not implemented. Browser
server-down fallback was verified. See docs/OFFLINE_MODE.md.
An independent organization forecast register stores analyst-entered, source-linked
probabilities and future horizons, with immutable inputs and one-time sourced
outcomes. It computes binary Brier scores explicitly; no automated prediction or
validated accuracy is implied. See docs/FORECASTS.md and the additive RLS migration.
Natural hazards now retain every contributing source in conservative possible
duplicate groups. GDACS normalized data remains disabled pending commercial-rights
review. Legacy conflict news no longer receives fabricated map offsets or current
event dates; static areas are explicitly undated references. None of this work
uses World Monitor code or services. See docs/HAZARD_MATCHING.md.
The public aviation workspace independently parses FAA status metadata and selected
US NOAA/NWS METAR/TAF products, with source times, separate forecast periods,
documented watch thresholds and an optional source-coordinate map. Conditional FAA
notices do not establish complete airport closures. Raw operator NOTAM text is not
republished; worldwide NOTAM/weather coverage remains incomplete. Source rights,
rate rules and limitations are in docs/AVIATION_DISRUPTIONS.md. No World Monitor
code, styles, assets, APIs or data were used.
Research/SDK setup now uses Ophanim's own three-step guide with no browser key
storage. Research passes an authenticated worker health check before context is
sent through pinned, bounded transport. SDK diagnostics validate a server-supplied
credential without creating map objects; bounded ingestion preserves unknown
confidence/times and resets process state on a tenant configuration change.
External worker isolation and multi-worker SDK persistence remain incomplete.
Provider point layers now use MapLibre's existing worker clustering API, with
count labels and expansion, preserving original source records. Route Explorer
optionally shows 3,962 dated Apache-2.0 port reference points; these do not assert
live operations. Production browser rendering/expansion and route coexistence were
checked. Legacy layer and measured hardware load work remain. See MAP_CLUSTERING.md.
No World Monitor code, styles, assets, APIs, embeds or data were used.
