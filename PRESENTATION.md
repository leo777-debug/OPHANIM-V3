# Presentation Mode

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
