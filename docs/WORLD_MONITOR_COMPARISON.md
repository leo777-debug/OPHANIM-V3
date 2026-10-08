# World Monitor / Ophanim Comparison

Reviewed: 2026-10-08. This is a capability comparison, not a claim of complete parity.
World Monitor source code was not copied into Ophanim.

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

These are not implemented by this update. Entries in `src/lib/world-monitor-layers.ts`
labelled WorldMonitor API or public embed must not be described as native Ophanim
data connectors just because they appear in that catalog.

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
