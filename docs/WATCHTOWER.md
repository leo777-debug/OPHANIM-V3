# Watchtower

Open **Watchtower** in the existing operational globe, or use a shipment's
**Destination cameras** link. `/api/watchtower?q=…` returns ports, auditable
camera entries, explicit coverage gaps and separately stored health observations.
Search covers all fifteen priority Gulf port locations, including Iranian ports.
Port coordinates are approximate references, not camera locations or observations.

`src/lib/watchtower/ports.json` is the searchable coverage list;
`catalogue.json` is the extensible feed catalogue. The initial audit on 21 October
2026 verified the public [Dubai Marina publisher page](https://www.skylinewebcams.com/en/webcam/united-arab-emirates/dubai/dubai/dubai-marina.html).
It explicitly displayed **OFFLINE**. It overlooks a nearby marina, not Jebel Ali
berths. Its public page is linked; embedding rights and playback were not verified.
No other priority-port feed was verified. Those locations remain **unverified**,
with no invented stream URLs. There are currently **zero verified playable feeds**.

Each feed declares identity, port/country, coordinates, camera type, stream URL
(nullable when unknown), embed type, source URL, source terms/terms URL, last seen,
status, verification time and coverage limitations. Set `publicViewingVerified`,
`embedAllowed` and `healthCheckAllowed` only after a source-specific review.
The registry's `camera` category exposes Watchtower search and map metadata.
HLS, YouTube embeds, iframe, MJPEG and snapshot tiles use direct public embeds;
fullscreen is browser-native. There is no stream proxy or re-streaming service.

The existing authenticated intelligence cron runs the catalogue health checker.
Checks are opt-in per feed, HEAD-only, at most every thirty minutes, with six-second
deadlines and no redirects. HTTP 404/410 marks a feed offline; other responses stay
unverified. Reachability alone never promotes a feed to live. Health is persisted
in `ophanim_camera_health`; last-online is never fabricated from a page response.
Offline feeds are excluded from playback, retained for source audit and not used
as evidence of safe port conditions. Actual playback/fresh-frame verification
requires an approved source-specific adapter. No seed currently permits polling.

Only intentionally public, lawful OSINT is eligible: authority, tourism/marina,
public traffic, public livestream and licensed aggregator pages. Never scan CCTV,
RTSP or credentials; never bypass login, geofencing, paywalls, robots or source
terms. Review commercial use, embed permission, attribution, refresh limits and
robots before enabling any automated access. Do not extract hidden stream URLs.
The [Windy Webcams API](https://api4.windy.com/webcams/docs) requires its own key
and has expiring image URLs; an automatic Windy adapter is not enabled here.

Empty, old, offline or inaccessible cameras mean **unknown coverage**, never
“all clear”. A camera is not a congestion measurement unless separately observed
and validated through the normal evidence pipeline.
