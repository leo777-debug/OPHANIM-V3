# Installable app and public offline snapshots

Ophanim's manifest includes a start URL, scope, standalone display mode and existing
192/512-pixel icons. Installation is controlled by the browser/operating system;
use its Install app or Add to Home Screen command when available. HTTPS is required
in hosting; localhost is supported for development. No notification permission or
push subscription is requested.

The root shell registers /sw.js. Its cache contains only the explicit public
offline HTML, text renderer, manifest and icon files. Application HTML, private
pages, APIs, organization records, credentials, external map tiles and video are
not cached. A failed navigation displays the standalone public offline shell.
It does not recreate the full interactive globe or private workspace offline.

While online, open Public advisories, apply filters and choose **Save public
snapshot offline**. The latest saved selection replaces the prior snapshot on that
device, at most 150 records. The snapshot contains a whitelist of fields from the
six public official advisory providers with null organization scope. Other providers
and organization records are excluded, even if accidentally passed to the helper.
Source, original publication/fetch dates, save/check dates, attribution and data
mode are retained. Arbitrary attributes are never serialized.

Open **Open saved snapshot** or /offline.html to view it. The page always labels
the content OFFLINE / SAVED VIEW, even when viewed with an internet connection.
It is not evidence of present safety, source health or current warning status.
Text is inserted with textContent, never interpreted as feed HTML. Source URLs
are restricted to official HTTPS hosts during snapshot creation.

Use **Clear saved public snapshot** to remove that local public selection. Browser
site-data controls can remove all shell/storage caches. Updates wait for the normal
service-worker lifecycle; active clients are not forcibly replaced. The offline
banner uses the browser's connection signal, which is not a test of each upstream
source. No in-browser ML is bundled in this milestone.

Automated tests check public/private filtering, field limits, official URL rules,
cache whitelist, protected/API request exclusion and failed-navigation fallback.
Browser verification saved 21 filtered public health notices, stopped the local
application server, navigated to a different application page and confirmed the
cached offline shell and saved notices appeared with the offline warning. Clearing
the test snapshot also succeeded. Actual device installation, airplane-mode and
multi-tab update behavior still require device validation. Public snapshots are
separate from authenticated shareable map/data snapshots.
