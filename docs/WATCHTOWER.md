# Watchtower

Open **Watchtower** in the existing operational globe, or use a shipment's
**Destination cameras** link. `/api/watchtower?q=…` returns ports, auditable
camera entries, explicit coverage gaps and separately stored health observations.
Search covers all fifteen priority Gulf port locations, including Iranian ports,
plus Muscat/Mina Qaboos with nearby Yiti coastal coverage.
Port coordinates are approximate references, not camera locations or observations.

`src/lib/watchtower/ports.json` is the searchable coverage list;
`catalogue.json` is the extensible feed catalogue. The initial audit on 21 October
2026 verified the public [Dubai Marina publisher page](https://www.skylinewebcams.com/en/webcam/united-arab-emirates/dubai/dubai/dubai-marina.html).
It explicitly displayed **OFFLINE**. It overlooks a nearby marina, not Jebel Ali
berths. Its public page is linked; embedding rights and playback were not verified.
No priority-port approach/berth feed was verified. Those locations remain
**unverified**, with no invented stream URLs.

The follow-up audit verified **one playable public coastal stream**: DarGlobal's
[AIDA Beach / Muscat YouTube broadcast](https://www.youtube.com/watch?v=lgQ8-E3rJ_4).
The publisher channel, LIVE badge and waterfront imagery were inspected; the
documented YouTube IFrame API confirmed advancing playback with no player error
on 21 October 2026. See `docs/verification/camera-playback.json` and reproduce
with `node tools/watchtower/check-public-player.mjs`. No media is downloaded or
committed. The [publisher identifies AIDA in Yiti](https://darglobal.co.uk/press/dar-al-arkan-and-omran-group-announce-partnership-to-develop-aida-overlooking-the-sea-of-oman).
Its approximate Yiti-area pin has roughly 10 km accuracy, not a surveyed camera
position. This is nearby coastal imagery, **not Mina Qaboos cargo berths or
Sohar/Salalah coverage**. Night conditions restrict visibility.

Use only the standard branded YouTube player under the
[YouTube terms](https://www.youtube.com/t/terms?hl=en), with no separate charge for
video access, downloads, frame harvesting or re-streaming. Do not replace the
player with extracted media URLs. This stream has no API-key requirement.
The Fairmont Dubai source was also investigated: its published YouTube recording
was unavailable, and the aggregator's [terms](https://www.whatsupcams.com/en/terms-of-use/)
restrict commercial use. It was excluded. Exposed-CCTV directories were rejected.

Each feed declares identity, port/country, coordinates, camera type, stream URL
(nullable when unknown), embed type, source URL, source terms/terms URL, last seen,
status, verification time and coverage limitations. Set `publicViewingVerified`,
`embedAllowed` and `healthCheckAllowed` only after a source-specific review.
The registry's `camera` category exposes Watchtower search and map metadata.
HLS, YouTube embeds, iframe, MJPEG and snapshot tiles use direct public embeds;
fullscreen is browser-native. There is no stream proxy or re-streaming service.

The existing authenticated intelligence cron runs the catalogue health checker.
Checks are opt-in per feed, HEAD-only, at most every thirty minutes, with six-second
deadlines and no redirects. Three consecutive failed endpoint checks mark a feed
offline; an earlier failure stays unverified. Recovery resets the failure count
but remains unverified until playback is separately checked. Reachability alone
never promotes a feed to live. Health is persisted
in `ophanim_camera_health`; last-online is never fabricated from a page response.
Offline feeds are excluded from playback, retained for source audit and not used
as evidence of safe port conditions. Actual playback/fresh-frame verification
requires an approved source-specific adapter. Neither seed permits server polling.
The public player remains manually audited: after thirty minutes its status
becomes unverified. An operator may explicitly open the previously reviewed
player with the stale-status warning; this does not promote its global health.

Only intentionally public, lawful OSINT is eligible: authority, tourism/marina,
public traffic, public livestream and licensed aggregator pages. Never scan CCTV,
RTSP or credentials; never bypass login, geofencing, paywalls, robots or source
terms. Review commercial use, embed permission, attribution, refresh limits and
robots before enabling any automated access. Do not extract hidden stream URLs.
The [Windy Webcams API](https://api4.windy.com/webcams/docs) requires its own key
and has expiring player/image URLs. Optional discovery is restored through the
same catalogue search, registry and Route Lens, gated by `WINDY_WEBCAMS_API_KEY`
and `WINDY_WEBCAMS_TERMS_REVIEWED=true`. Both remain blank by default. Review
[API/publisher terms](https://api4.windy.com/webcams/terms) for your intended use.
The adapter fetches only a selected, unambiguous port (25 km radius), at most ten
requests/minute per process, with a five-minute cache (free URLs expire after ten
minutes). Render Windy attribution and use the returned player/source URLs.
No undocumented stream extraction or re-streaming. An active provider listing,
including a day/time-lapse player, stays **unverified**, never automatically live.
Distributed installations must coordinate their provider quota upstream.

Existing `/watchtower?q=...` / `?port=...` bookmarks open the shared globe tool.
`GET /api/watchtower?q=...` retains `ports[].cameras`; the earlier `?port=CODE`
contract returns `feeds`, `live`, `warnings`, `policy` (`dead=1` includes offline
entries). `POST /api/watchtower/health` accepts either existing camera/job cron
secret and calls the same checker used by the intelligence cron. No second
camera-status table is created. Apply `027_camera_health_retry.sql` and its
matching Supabase security migration before deploying the retry-aware checker.

Empty, old, offline or inaccessible cameras mean **unknown coverage**, never
“all clear”. A camera is not a congestion measurement unless separately observed
and validated through the normal evidence pipeline.
