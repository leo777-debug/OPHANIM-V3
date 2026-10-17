# Presentation Mode

## One Operational Map

Map view and **Full platform > Operational map** now use the same map layout,
renderer, public feed pipeline and saved globe workspaces. Old `/atlas` links
redirect to `/logistics/map`; they no longer open another map interface.

- The left rail contains the real public feed layers, their counts and provenance.
  Reference locations, calculated satellite positions and replay are labelled.
- Use the map toolbar for Analyst, Fusion, Recon, Markets, Alerts, Entities,
  Shodan/IP lookup, tracking, Intel Desk, AI setup, watchlists and source health.
  Tools open in a right-hand dock beside the existing globe, not another page.
  On a phone the dock becomes a bottom panel and **Show layers** opens the rail.
- **New globe** creates an independent set of layers, camera position, basemap
  and projection. Switching Map/Full platform retains these in this browser.
  Only map configuration is saved locally, never feed payloads or credentials.
- **Fullscreen map** expands only this workspace: globe, layers, tabs and tools.
  The outer company sidebar and presenter bar are excluded. Escape exits.
- Search is in one toolbar field. Ctrl/Cmd+F focuses it; Ctrl/Cmd+K opens the
  command palette for tools, regions, layers and globe tabs. Earth,
  Satellite, Night, 2D/3D and day/night controls stay inside the map canvas.
- **Share map view** copies public map configuration, not shipment IDs or private
  records. **Import** and other private pages still use the normal login/PIN flow.

Shodan in this branch is the existing read-only **InternetDB IP lookup**, not
paid Shodan query search or authorized scanning. Missing feeds stay unavailable;
the interface does not generate replacement observations. Fusion is explicitly
unavailable during replay rather than mixing live analysis into a recording.

This is a presentation switch for your existing Ophanim installation, not a new
company-management system. Use your existing **owner** login. No global-admin
role, account allowlist, billing change or second deployment is needed.

## One Time

1. Merge the `presentation-mode` pull request and deploy normally.
2. Keep the existing database configured. The normal Render pre-deploy/startup
   migration runner applies `20261016010656_presentation_mode.sql`. For a manual
   installation, run `node db/run-migrations.mjs` against your own database.
3. Nothing changes for visitors: the database starts with presentation mode OFF.
4. Sign in as the owner. Open **Admin** in the workspace sidebar, then
   **Presentation mode**, or go directly to `/admin/presentation`.
   If presentation mode is already ON and you are signed out, use
   `/login?admin=1`. This always leaves the owner a route back to the switch.

## Before Presenting

1. Open Admin > Presentation mode.
2. Press **Record snapshot now**. Check the saved counts and recording dates.
   An unavailable feed keeps its previous snapshot; a feed with no previous
   snapshot stays unavailable. No sample data is silently substituted.
3. Leave Replay at **Auto** to try live data independently for each source.
4. Optionally set a 4-12 digit switch PIN and press **Save settings**.
5. Turn presentation mode ON and confirm. The default view should be Map view.
6. Open the site's root URL in a new tab. It redirects to `/presentation`.
7. Test Map view > Full platform > normal login > Back to map.

Settings take effect on new requests within a few seconds. An already-open page
checks every 15 seconds while visible and again when the tab becomes visible.
No redeploy is involved. Full-platform preference is remembered in an HttpOnly
browser cookie for four hours; a new browser uses the configured default.

## During The Presentation

- Use **Map view | Full platform** at the top, or **Ctrl+Shift+P**
  (**Cmd+Shift+P** on macOS). The browser must give the page that shortcut.
- The PIN, if set, is requested before entering Full platform. It does **not**
  sign anyone in or grant access to shipments, settings, AI or tenant data.
- You can force a view with `?view=map` or `?view=full`. A full-view URL still
  respects the PIN. Pinning a view is a presentation preference, not authorization.
- The globe initially shows Europe, the Middle East and the Gulf. It rotates
  slowly while idle, stops when you interact with it, and resumes after 60 seconds.
- Select a map object for source, observation time and coordinates. An absent
  observation timestamp is explicitly reported, never replaced with fetch time.
- The right-hand Intelligence Desk contains news, timeline, regions, source
  freshness and six world clocks. News links open in a separate tab.
- Only layers with observations appear as toggles. Missing feeds do not blank
  the globe or other panels. Cable geography is reference data; satellite
  positions are calculated from orbital elements, not live spacecraft telemetry.
- Customer/contract AIS is excluded from the anonymous presentation feed. If a
  customer AIS or MarineTraffic URL is configured, the original maritime API also
  requires the normal login; a public presentation preference cannot unlock it.

### Full Platform And Demo Login

**Intelligence tools** in the Map view header and Full platform presenter bar
opens the original Atlas with the chosen panel already open: Analyst, Fusion,
Recon, Markets, Alerts, Entities, Search, Shodan IP lookup or IP search.
**Vessels & aircraft** enables position layers and opens target search.
Select a vessel or aircraft on that globe for its existing details. This is not
a promise of historical tracks or global AIS coverage.

The **Fullscreen** button beside the tools menu expands the entire application;
press it again or Escape to leave fullscreen. Small screens retain the expand
icon. A browser that blocks fullscreen shows a dismissible message.

For **only the embedded map**, open Full platform > Operational map > Ophanim
live, then use **Fullscreen map** beside the region selector. This expands just
the map workspace, including its layer rail. The outer workspace sidebar, app
header and presentation bar are not included. **Exit fullscreen** or Escape
returns to the surrounding Full platform page without resetting the map.

Opening a tool enters Full platform through the same optional switch PIN. It
does not sign in a visitor or unlock private APIs. The selected tool is retained
after PIN entry, and Back to map / Full platform remembers its URL in this
browser. The tools are absent from the presenter bar when presentation is OFF.

In this branch, **Shodan IP lookup** is the existing read-only InternetDB host
lookup, routed through Ophanim's backend. It is not the authenticated Shodan
database-query / credit / active-scan integration from other work in progress.
No Shodan key is needed for InternetDB; no active scan is submitted on opening
any menu or tool. Do not present this branch as offering full Shodan search.

The normal app and login are preserved. Use the existing clearly labelled demo
organization, not customer records. This feature does not manufacture demo
accounts or grant public access to a real organization's workspace.

Keep any demo login details only in your **uncommitted** `.env.local`, for example
`PRESENTATION_DEMO_EMAIL`, `PRESENTATION_DEMO_PASSWORD` and
`PRESENTATION_DEMO_ORGANIZATION_SLUG`. These are presenter notes, not public
configuration and not an automatic login mechanism. Enter them in the normal
login form. Never use `NEXT_PUBLIC_` for a password or provider key.

## After Presenting

Admin > Presentation mode > OFF > Confirm OFF. The normal site returns within
seconds on new navigation and within 30 seconds on visible open pages. Map-only
redirects, quick-switch controls and the shortcut disappear. The admin settings
page remains available to turn it on again.

## Replay And Plan B

### Real Data Versus Live Data

These are different properties. The public preview uses real provider responses,
not the synthetic browser-test fixtures. Aircraft, vessels, earthquakes, fire
detections, weather/disasters, cyber indicators, news and space weather refresh
from their providers, subject to each provider's delays, caching and coverage.
A successful fetch is not proof every observation is current or from today.
Several legacy position adapters do not supply a reliable observation timestamp;
the UI must not replace that missing time with the time of retrieval.

Ports, chokepoints, cables, infrastructure, broadcaster locations, conflict-region
anchors and vessel-associated sanctions ports are **reference locations**. They
are not live port congestion, current frontlines or sanctioned-vessel positions.
Satellite positions are **calculated** from orbital elements, not telemetry.
Camera-directory markers do not guarantee each image/video stream is online.
Saved snapshots are shown as **Replay** with the recording time.

- **Auto:** live data first; a failed source uses its own last saved snapshot.
- **On:** recorded feeds only. This does not make requests to live providers.
- **Off:** live feeds only; a failed source says unavailable rather than replaying.
- Every replay shows its recording time. Mixed live/replay coverage is labelled.
- Record a snapshot before leaving for the venue. Do not depend on getting a
  first snapshot while offline. A hosted site's database is still required.
- If the venue's internet is unreliable, select Replay On. The browser must
  still reach the hosted Ophanim server.
- If the hosted site cannot be reached, run `npm run dev` locally with a reachable
  local database that already has migrations and public snapshots. Use the local
  admin page to turn mode ON. A laptop with no database or no saved snapshot
  cannot conjure an offline replay from the remote deployment.
- The map is the original Ophanim atlas renderer, with its aircraft symbols,
  heading-aware vessel hulls at close zoom, blue cable routes and event markers.
  Use the controls below the layer panel for **Night / Earth / Sat** and **2D / 3D**.
  The night basemap uses key-free OpenFreeMap Dark; if its style cannot load,
  bundled Natural Earth geography uses the same dark land/ocean palette.
  Earth and satellite use the original Esri overlays and require internet.
  A geographic starter view appears while WebGL initializes, labelled
  "Starting Ophanim map". It contains no fake live markers.
- Verify has not been merged into the current default branch. Its button is
  disabled in settings and hidden from Map view rather than linking to a 404.

## Snapshot Command (Optional)

The dashboard button is easiest. For `npm run presentation:snapshot`, put these
values in an **uncommitted** `.env.local` on the machine running the command:

```dotenv
APP_URL=http://localhost:3000
PRESENTATION_OWNER_EMAIL=your-existing-owner-email
PRESENTATION_OWNER_PASSWORD=your-existing-owner-password
PRESENTATION_ORGANIZATION_SLUG=your-existing-organization-slug
```

Run `npm run presentation:snapshot`. It uses the ordinary owner login and records
the same public-only snapshots as the dashboard. It never prints the credentials
or session cookie. Use HTTPS for a remote server. It cannot bypass an external
login flow that requires additional interactive steps; use the dashboard then.

## Security And Scope

- The existing `organization:manage` permission (owner) controls changes. Per
  your presentation-only request, there is no new global role or admin allowlist.
  This assumes your founder-controlled installation: on a future multi-company
  deployment, a separate platform-admin policy should be designed first.
- Public flags, public normalized snapshots and public feed endpoints contain no
  tenant data. PIN hashes, browser-grant hashes and audit records are in a private
  schema, inaccessible to browser database roles.
- The PIN is salted/scrypt-hashed. Unlock grants are random, stored hashed,
  expire after four hours and are invalidated when the PIN changes or is cleared.
- Owner updates and snapshot recording are audit-logged. No PIN or credential
  is stored in the audit values. Concurrent settings updates use a revision check.
- Private API login checks apply in every presentation view and when mode is OFF.
  A presentation cookie is never a login session. Existing service-key cron and
  webhook authentication remain separate.
- No World Monitor source, assets, API or embed is used. Map view has no webcam
  grid, business records, tenant search box or synthetic-demo banner.

## Reproducing The Checks

```powershell
npm ci
npx tsc --noEmit
npm test -- --maxWorkers=1
$env:NEXT_DEV_DIST_DIR='.next-presentation'
npm run build
npm run test:presentation
```

The browser test starts a disposable local PostgreSQL-compatible PGlite database
and production server on ports 55439 and 3107, blocks external APIs, uses clearly
labelled synthetic replay fixtures, takes screenshots in `presentation-evidence`,
and stops both processes. It does not connect to Supabase or a production database.
Set `PRESENTATION_TEST_PORT` / `PRESENTATION_TEST_DB_PORT` if those ports are busy.
Playwright Chromium must be installed (`npx playwright install chromium`).

### Isolated Local UI Preview

After the build command above, `npm run presentation:preview` starts a disposable
local preview at `http://127.0.0.1:3108/presentation` with **real public feeds** and
Replay set to Auto. It does not seed synthetic signals or connect to a production
database. Public camera regions fill progressively while their sources warm.
Its temporary owner login details are in
the generated, ignored `.env.presentation.local`; use `/login?admin=1` with those
details to try the settings UI. Stop the command with Ctrl+C. A restart resets
this disposable preview. This helper is not the production snapshot workflow.

For a deterministic, network-blocked UI preview only, run
`npm run presentation:preview -- --fixtures`. That opt-in mode is visibly labelled
**Test replay fixture**. Automated tests always use this labelled fixture path,
not live provider traffic.

Optional live provider keys may be set in the launching process, or set
`PRESENTATION_PROVIDER_ENV` to an existing local env-file path. The helper reads
only AISStream/OpenSky/ThreatFox credential names from that file into the server
process; it does not copy the file, expose values, or forward production database,
Supabase, AI or customer/contract AIS settings. Without keys, the key-free public
adapters still run; AIS coverage is regional rather than guaranteed global.

The current layout is retained. The globe restores aircraft categories, vessels,
ports, chokepoints, public cameras, broadcaster locations, region anchors,
infrastructure, sanctions-associated ports, satellites, hazards, cyber indicators,
news markers and cable routes. Missing sources stay listed as unavailable rather
than silently disappearing. Reference locations are not counted as live events.
GPS-jamming, balloon and radiation endpoints absent from this branch are not faked;
private SDK entities remain private. The day/night control is a calculated overlay.

### Vercel Database Connections

On Vercel, the PostgreSQL client uses at most two connections per function and
releases idle connections after five seconds. A Supabase shared session-pooler
URL (host ending in `.pooler.supabase.com`, port 5432) is used with the same
credentials and database on transaction-pooler port 6543 at runtime. Other hosts,
explicit transaction URLs, and Docker/local connections are unchanged. Migrations
continue to use the configured session/direct connection, not this runtime override.
The driver uses unnamed queries; session-scoped database features are not suitable
for the transaction pooler.

Presentation settings allow up to ten seconds for a cold database connection and
query. A failed fresh read still reports an error, rather than reusing stale mode
or PIN settings. No database passwords need to be changed for this behavior.

### Temporary Public Demo Access

For the 17 October presentation, anonymous visitors can use one shared workspace
labelled **Presentation demo (public)**. This is not a permanent removal of login:
the private `ophanim_private.presentation_demo_access` grant must be explicitly
enabled, Presentation mode must be ON, and the grant expires automatically.
The presentation cutoff is **17 October 2026, 20:30 Asia/Dubai (16:30 UTC)**.
An individual grant cannot last longer than 24 hours. No grant is created by the
migration, so ordinary installations retain their original login requirements.

Only the fixed demo organization and demo user can receive this fallback. Real
signed-in users retain their own permissions. Treat everything entered in the
shared workspace as public; do not upload personal or customer information.
Active scanning, private SDK/extension access, and sandbox research still require
normal sign-in. Credentials and provider secrets remain server-side.

To end access early, disable the grant in the database:

```sql
update ophanim_private.presentation_demo_access set enabled = false where id = 1;
```

Turning Presentation mode OFF also ends anonymous demo access. No redeploy is
needed for either change. After the presentation, disable the grant and confirm
that a signed-out request to `/api/auth/me` no longer returns a demo actor.

### Entity Inspection

The map's Entities tool searches objects already loaded from public feeds. Select
a result to inspect its source fields. Vessel expansion uses MMSI/IMO and aircraft
expansion uses ICAO24 instead of presentation-specific marker IDs. Event and other
unsupported observation types remain inspectable without requesting enrichment.

External relationship expansion additionally requires a reachable `INTEL_URL`
service. The bundled `intel/` Docker service is not deployed as part of a Vercel
Next.js build. Without this service, the selected observation remains visible,
and no ownership, sanctions or other relationships are invented. Vercel reports
the missing configuration immediately instead of attempting a Docker hostname.
