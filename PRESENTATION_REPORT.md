# Presentation Mode Report

## Scope

Implemented on `presentation-mode`, created from the then-current default branch
`feat/gdacs-weather-ai-overview`. The stress-test branch and original dirty user
checkout were not changed. No production deployment, database migration, billing
or infrastructure change was performed.

Per the founder's clarification, this uses the existing owner permission. There
is no new platform-admin role, allowlist or company-management workflow.

## What Changed

### Tool Discovery And Fullscreen Follow-Up

The Full platform operational map now also has its own **Fullscreen map**
control inside the **Ophanim live** toolbar. It requests fullscreen on only the
map workspace element, excluding the enclosing sidebar, app header and
presentation bar. Layer controls, region selection and exit remain inside the
fullscreen workspace. A resize notification keeps the MapLibre canvas fitted.
Browser coverage checks 1920x1080 and 1366x768, geographic pixels, button exit
and Escape. The normal whole-page fullscreen controls are still separate.

Live-source verification exposed a FIRMS acquisition-time parsing bug: a value
such as `2333` was treated as a year. Fire observations now combine the source
date with its UTC HHMM time. Five regression cases cover padded times, date-only
volcano records and malformed/missing dates or times.

- Added a labelled fullscreen control in Map view and the Full platform presenter
  bar, including exit state and a dismissible browser-rejection message.
- Added an Intelligence tools menu in both headers. It opens the existing Atlas
  panels rather than duplicating their implementations in the public map.
- Atlas accepts allowlisted `tool` links, opens the corresponding panel, preserves
  the query while saving layers, and avoids interpreting absent map coordinates
  as zero. Tool-to-tool navigation works without a full page reload. Direct tool
  links skip the old blocking startup animation, which browser testing caught
  intercepting lookup clicks.
- The optional switch PIN retains the requested tool destination. Normal login
  and private API restrictions are unchanged. Presenter controls remain absent
  when mode is OFF.
- The existing Shodan InternetDB lookup now uses the existing server route and
  a LOOKUP button. Full authenticated Shodan query/scan capabilities are not in
  this branch. Vessel/aircraft entry enables position layers and target search;
  historical tracks are not added by this follow-up.
- Added allowlist/URL unit tests and mocked-browser tool navigation, PIN,
  fullscreen and read-only lookup checks. No live scans or paid searches run.

- `src/lib/presentation/`: settings, routing policy, bounded/CSRF-checked input,
  fixed public-feed loaders, explicit public projection, independent cache and
  snapshot/replay fallback. Reads are bounded; public flags cache for two seconds,
  while page redirect decisions read the current database revision to avoid loops.
- `src/app/api/presentation/`: public flags and normalized feeds; owner-only
  settings/snapshot endpoints; browser view preference and optional PIN unlock.
- `src/components/presentation/`: globe, dense layer panel, stacked Intelligence
  Desk, ticker, world clocks, object detail card, presenter switch, PIN dialog,
  admin settings and owner-only Admin entry.
- `/presentation`, `/presentation/preview`, `/admin`, `/admin/presentation` pages.
- Root layout wraps the original content in a boundary that adds no presentation
  controls or shortcut while OFF. Generic Admin links appear only for the owner.
- `src/proxy.ts`: request-time page redirects; public map does not bypass private
  API authentication. Service-authenticated cron/webhook flows remain separate.
- `src/lib/auth/actor.ts`: request-bound Supabase client support for proxy checks;
  an invalid configured Supabase session cannot fall through to a legacy cookie.
- `public/presentation/`: bundled Natural Earth countries and attribution.
- `tools/presentation/`: authenticated snapshot CLI, disposable local preview,
  local-only database/fixtures, outbound-network guard and browser proof runner.
- Package scripts: `presentation:snapshot`, `presentation:preview`,
  `test:presentation`. Test dependencies: PGlite/socket and Playwright.

### Additive Migration

`supabase/migrations/20261016010656_presentation_mode.sql` adds:

- Public singleton settings, default OFF, with revision/concurrency checking.
- Public normalized snapshots, one bounded payload per supported feed.
- Private scrypt PIN hash/version, hashed expiring view grants and audit log.

All five tables have RLS. Browser database roles can read only public settings
and snapshots, cannot write them, and cannot access the private schema. Owner API
changes are transactional and logged with actor, time, old/new public values.
PIN values, PIN hashes and grant tokens are not put into audit values or public
API responses. Rotating/clearing the PIN invalidates existing grants.

`supabase/migrations/20261016120627_presentation_public_layers.sql` expands only
the allowed public snapshot feed IDs. It retains all existing rows, the 8 MB
payload bound, RLS, grants and owner-only writes. A real SQL regression verifies
new camera snapshots work while anonymous inserts remain denied.

## Runtime Behavior

OFF preserves normal page routing and renders no presenter toolbar or shortcut.
ON maps ordinary visitor navigation to `/presentation`; Full platform restores
the original routes. Admin access and `/login?admin=1` remain reachable. Changes
apply through database reads, with no environment edit or redeploy. Visible open
pages poll every 15 seconds and refresh on tab visibility changes.

The browser preference is HttpOnly and lasts four hours. URL overrides respect
the PIN. The PIN is deliberately not an authentication mechanism: private APIs
still require the normal session in every mode. This includes AI endpoints that
previously accepted anonymous requests; that authentication tightening is an
intentional security change, not an OFF-mode feature removal.
The original maritime API also requires login when a customer or contract AIS
URL is configured, while the anonymous presentation projection excludes those
positions entirely. Public-only maritime configuration keeps its normal access.

No World Monitor code, styles, branding, API, data relay or embed is used. The map
reuses the original `OphanimMap` renderer, not a replacement circle-only globe;
its aircraft silhouettes, close-zoom vessel hulls, event markers and blue cable
layers are preserved. Night/Earth/Satellite and 2D/3D controls are restored,
along with the original Ophanim eye/orbit mark and teal/pink layer styling.
Public object picking uses original observation screen positions and the map's
occlusion check, rather than MapLibre's failing symbol-index decoder. Hidden
layers and locations behind the globe are excluded; details retain original
source records and observation coordinates. The browser regression exercises
an actual rendered aircraft click, not a mocked detail-card state.
The Intelligence
Desk reuses `IntelligenceExplorer` and existing news models/helpers. Its new
public-feed projection cannot include tenant payloads or arbitrary provider URLs.

## Feed Coverage

All are existing Ophanim public adapters, not new paid integrations. A working
source is live/current-fetch; a saved source is explicitly replay; missing sources
say unavailable. Fetch time is never used as a fabricated observation timestamp.
In particular, legacy aviation/AIS receipt timestamps are not presented as source
observation times.

| Feed | Presentation behavior |
| --- | --- |
| Aviation | Existing ADS-B/configured providers; only received positions |
| Maritime | Digitraffic/AISStream public positions; customer/contract AIS excluded; no static ports counted as vessels |
| Ports / chokepoints | Restored original reference locations, separately toggled; historical volumes and inferred congestion/risk not republished as live measurements |
| Public cameras | Existing worldwide region warmer, read progressively from completed region caches; up to 40,000 markers, not the former 5,000 cap |
| Broadcast locations | Original broadcaster directory markers, reference only; no guarantee a channel is currently broadcasting |
| Conflict regions | Original warning icons at curated reference anchors; synthesized RSS scatter coordinates are excluded |
| Infrastructure | Original reference location layer |
| War & Sanctions | Existing named provider's source-listed associated ports, not live vessel positions |
| Earthquakes | USGS observations and source timestamps |
| Fires/hazards | Existing NASA FIRMS/EONET adapter |
| Weather/disasters | Existing weather/GDACS-related adapter |
| Incident markers | Existing GDACS adapter |
| Satellites | Calculated from orbital elements, labelled not live telemetry |
| Cyber | Existing public abuse.ch indicators |
| Cables | Bundled reference geography, labelled reference, not live traffic |
| News | Existing public news items, source links and publication times |
| Space weather | NOAA Kp only with an actual observation timestamp |

Replay On makes no live-provider calls. Auto falls back independently for failed
sources. A failed snapshot capture does not replace an older successful snapshot.
Automated test fixtures have a separate visible **Test replay fixture** label;
they are not presented as recorded real-world intelligence. The local preview now
defaults to real public feeds in Auto mode with an empty disposable database,
not the tiny forced replay that previously hid most sources. Fixtures require
`--fixtures`. Live provider credentials are allowlisted in memory; production
database/auth/AI/customer AIS settings are never forwarded into this preview.

All 18 feed groups remain discoverable, even if a source is unavailable. Flight
and vessel projections allow up to 30,000 observations each. Public camera
regions fill in without blocking on the slowest directory. News map pins retain
their approximate story-location label. Day/night shading is calculated, not a
sensor feed. Missing GPS-jamming/balloon/radiation endpoints and private SDK data
are not fabricated to create density.

Hidden from Map view: business workflows, imports, account/settings menus, AI
configuration, tenant records, original demo banners and all public embeds. The
Verify button remains disabled because Verify is absent from this default branch.

## Basemap

Following the founder's uploaded August recording, presentation now uses the
original atlas renderer and its night palette. The key-free night style is
`https://tiles.openfreemap.org/styles/dark`, documented by
[OpenFreeMap](https://openfreemap.org/quick_start/). It supplies its own tile,
sprite and glyph URLs. Explicit attribution links credit OpenFreeMap,
OpenMapTiles and OpenStreetMap. This avoids the old CARTO API-key requirement
without replacing the original Ophanim symbols with generic circles.

If the style is unavailable within 1.8 seconds, bundled public-domain Natural
Earth geometry is the labelled overview fallback, using dark land and grey-blue
water. The original Earth and satellite overlays use Esri's World_Topo_Map and
World_Imagery MapServer tile endpoints, with Esri/contributor attribution. They
need internet. Original atlas defaults remain unchanged when presentation is OFF.

Browser testing caught and fixed the lazy-loaded MapLibre CSS overriding the
map container's absolute positioning, which clipped the globe to zero height.
It also caught layer initialization during projection changes and a stale-path
keyboard-switch race. The restored atlas initializes its existing data sources;
rotation is throttled, pauses on interaction, resumes after 60 seconds and
respects reduced-motion preference. Changing basemap overlay visibility does not
recreate the map or discard its feed layers.

## Verification

Baseline: typecheck PASS; 153 tests passed and one opt-in live test skipped;
production build PASS. No existing database/RLS baseline was configured.
New RLS tests execute the real additive migration in disposable PostgreSQL-
compatible PGlite, not regex-only assertions. The browser runner applies the full
repository migration chain, uses only synthetic records and blocks external APIs.

Final numerical results and screenshots are recorded in
`presentation-evidence/results.json`. The screenshot set includes OFF/original
site, 1920x1080, 1366x768 and 390x844 map views, a clicked object, Full platform,
and the owner settings page. Browser checks cover live settings changes without
redeploy, redirects, owner/viewer/anonymous access, PIN hashing/rotation, audit
redaction, rendered canvas pixels, populated replay layers, news, moving ticker,
quick-switch buttons and the keyboard shortcut in both directions.

Final checks on 16 October 2026:

| Check | Result |
| --- | --- |
| TypeScript / production build | PASS |
| Unit and database tests | 272 passed, one pre-existing opt-in live test skipped; 59 files |
| Focused ESLint on presentation code | PASS, zero errors or warnings |
| Shared legacy map lint baseline | Unchanged: 96 existing errors, 10 existing warnings; unrelated cleanup excluded |
| Shared Atlas / Recon lint baseline | Unchanged: Atlas 57 errors / 16 warnings; Recon 27 errors / 7 warnings |
| Local migration chain / actual RLS checks | PASS |
| Browser integration scenarios | 20 PASS; zero uncaught errors on map/tool navigation and zero console errors on map/switch path; at least 14 enabled populated layers |
| Map-only fullscreen follow-up | 6 focused browser checks PASS on the new build, including scoped fullscreen at 1920x1080 and 1366x768, rendered geography, button/Escape exit and retained layers; `tools-results.json` |
| Geographic starter + panel shell under 2 seconds | PASS: 0.407 / 0.650 / 1.438 s |
| Fully interactive WebGL under 2 seconds | NOT MET: approximately 7.1-8.7 seconds in latest local run |

The browser's default GPU path measured the geographic starter and panel shell
at **0.407 s (1920x1080), 0.650 s (1366x768), 1.438 s (390x844)**. This is an
actual render of the bundled geography, labelled while loading, with no fake live
markers. Full interactive globe readiness took **7.084 / 8.460 / 8.692 s**.
PNG/pixel readback is measured separately in the results file. Forced SwiftShader
was substantially slower. These are local PGlite/headless measurements, not a
hosted PostgreSQL or projector-device benchmark. Fully interactive startup under
two seconds remains an open performance limitation, not a claimed pass. Runtime
ON/OFF propagation was measured at 37 ms in the final integration run. The tool
follow-up also has a repeatable focused run: `node tools/presentation/check.mjs
--tools-only`, recorded in `presentation-evidence/tools-results.json`. Its Shodan
image uses a reserved test IP and mocked response, not a live customer lookup.

The later real-provider probe (`live-feeds.json`, 14:25 UTC) received responses
for all 18 public feeds with no synthetic fixtures or replay. In that probe,
fire observation time was 10:41 UTC on 16 October after the HHMM parsing fix,
weather 14:10 UTC, news 14:02 UTC and space weather 10:21 UTC. Aviation/AIS
adapters did not supply reliable observation timestamps, so same-day position
freshness cannot be certified from retrieval time alone. Camera directories
warm progressively after startup (four markers on this cold-start probe, versus
thousands in the prior warm probe). No claim is made that every camera stream
plays or that every reference record is live.

Screenshots (all use labelled synthetic replay, no real customer records):

- [Original site, mode OFF](presentation-evidence/screenshots/off-original-site.png)
- [1920x1080 map](presentation-evidence/screenshots/map-1920x1080.png)
- [1366x768 map](presentation-evidence/screenshots/map-1366x768.png)
- [390x844 map](presentation-evidence/screenshots/map-390x844.png)
- [Clicked object](presentation-evidence/screenshots/object-details.png)
- [Full platform](presentation-evidence/screenshots/full-platform.png)
- [Owner settings](presentation-evidence/screenshots/admin-settings.png)

## Limitations And Founder Actions

### Restored Live-Feed Check

The opt-in `node tools/presentation/check-live.mjs --live` check fetched each
normal local public-feed endpoint once (not a load test). Its counts and times
are in `presentation-evidence/live-feeds.json`. The live preview contains no
seeded fixture snapshots and no network-blocking test preload.

On 16 October, the live check returned approximately 10,600 aircraft, 1,163
vessels, 8,374 public camera locations, 1,991 fire observations, 5,000 calculated
satellite positions, 234 disaster indicators and 140 news items, plus 81 ports,
10 chokepoints, 15 broadcast locations, 15 curated region anchors, 57 infrastructure
locations, 402 sanctions-associated port markers and 717 cable geometries.
These are received counts at the recorded check time, not a coverage guarantee;
camera directories continue warming and positions change on refresh.

A normal-browser live check rendered 17 populated map layers using the original
atlas renderer, no replay label and zero uncaught page errors. Its public-data
screenshot is [Live globe](presentation-evidence/screenshots/live-map-1920x1080.png).
Unlike the regression screenshots above, this screenshot is a live public-data
check, not synthetic presentation/demo evidence. The current UI layout and CSS
were retained. No AISStream/OpenSky credentials were found in the existing local
configuration; global AIS coverage still requires an appropriately configured
provider. The key-free sources succeeded without those credentials.

- Merge the PR and deploy once; the existing migration runner must apply the
  additive migration. The hosted site has not been changed by this work.
- Record actual public snapshots from the owner dashboard before presenting.
  Screenshots/test fixtures prove UI behavior, not today's third-party coverage.
- Live sources still require their existing credentials, coverage and usage
  rights. Ordinary feeds are bounded at 14 seconds, camera/sanctions at 22 seconds
  and the shared maritime request at 40 seconds; none blocks
  the globe or other sources. Venue performance is not guaranteed by local tests.
- Replay is a server/database fallback, not an offline copy of the hosted site.
  Local offline presentation requires a local database and previously saved data.
- Natural Earth fallback is an overview basemap, not a street-level navigation
  product. Detailed OpenFreeMap tiles and original Esri overlays need internet.
- This presentation-only installation uses existing owner authorization. Revisit
  the global write policy before offering independent companies a shared host.
- Hosted Supabase sessions were not exercised with production credentials.
  Database role enforcement and mocked/session-backed local authorization were
  tested instead. Live public provider availability was checked separately as
  documented above. No production secrets were copied.
- Verify and automatic demo-account provisioning were not added or faked. Use
  your existing labelled demo account for the real presentation; keep its
  credentials in an uncommitted env file, as documented in `PRESENTATION.md`.
