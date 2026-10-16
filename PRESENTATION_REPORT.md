# Presentation Mode Report

## Scope

Implemented on `presentation-mode`, created from the then-current default branch
`feat/gdacs-weather-ai-overview`. The stress-test branch and original dirty user
checkout were not changed. No production deployment, database migration, billing
or infrastructure change was performed.

Per the founder's clarification, this uses the existing owner permission. There
is no new platform-admin role, allowlist or company-management workflow.

## What Changed

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
The test/preview fixtures have a separate visible **Test replay fixture** label;
they are not presented as recorded real-world intelligence.

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
| Unit and database tests | 237 passed, one pre-existing opt-in live test skipped; 55 files |
| Focused ESLint on presentation code | PASS, zero errors or warnings |
| Shared legacy map lint baseline | Unchanged: 96 existing errors, 10 existing warnings; unrelated cleanup excluded |
| Local migration chain / actual RLS checks | PASS |
| Browser integration scenarios | 15 PASS; zero uncaught errors and zero console errors |
| Geographic starter + panel shell under 2 seconds | PASS: 0.377 / 0.931 / 0.667 s |
| Fully interactive WebGL under 2 seconds | NOT MET: approximately 5.2-6.3 seconds locally |

The browser's default GPU path measured the geographic starter and panel shell
at **0.377 s (1920x1080), 0.931 s (1366x768), 0.667 s (390x844)**. This is an
actual render of the bundled geography, labelled while loading, with no fake live
markers. Full interactive globe readiness took **5.162 / 6.330 / 5.729 s**.
PNG/pixel readback is measured separately in the results file. Forced SwiftShader
was substantially slower. These are local PGlite/headless measurements, not a
hosted PostgreSQL or projector-device benchmark. Fully interactive startup under
two seconds remains an open performance limitation, not a claimed pass. Runtime
ON/OFF propagation was measured at 30 ms in the final integration run.

Screenshots (all use labelled synthetic replay, no real customer records):

- [Original site, mode OFF](presentation-evidence/screenshots/off-original-site.png)
- [1920x1080 map](presentation-evidence/screenshots/map-1920x1080.png)
- [1366x768 map](presentation-evidence/screenshots/map-1366x768.png)
- [390x844 map](presentation-evidence/screenshots/map-390x844.png)
- [Clicked object](presentation-evidence/screenshots/object-details.png)
- [Full platform](presentation-evidence/screenshots/full-platform.png)
- [Owner settings](presentation-evidence/screenshots/admin-settings.png)

## Limitations And Founder Actions

- Merge the PR and deploy once; the existing migration runner must apply the
  additive migration. The hosted site has not been changed by this work.
- Record actual public snapshots from the owner dashboard before presenting.
  Screenshots/test fixtures prove UI behavior, not today's third-party coverage.
- Live sources still require their existing credentials, coverage and usage
  rights. A first cold provider fetch can take up to 14 seconds; it does not block
  the globe or other sources. Venue performance is not guaranteed by local tests.
- Replay is a server/database fallback, not an offline copy of the hosted site.
  Local offline presentation requires a local database and previously saved data.
- Natural Earth fallback is an overview basemap, not a street-level navigation
  product. Detailed OpenFreeMap tiles and original Esri overlays need internet.
- This presentation-only installation uses existing owner authorization. Revisit
  the global write policy before offering independent companies a shared host.
- Hosted Supabase sessions and real provider availability were not exercised with
  production credentials. Database role enforcement and mocked/session-backed
  local authorization were tested instead. No production secrets were copied.
- Verify and automatic demo-account provisioning were not added or faked. Use
  your existing labelled demo account for the real presentation; keep its
  credentials in an uncommitted env file, as documented in `PRESENTATION.md`.
