# Watchtower (public port cameras)

Type a port or area ("Bandar Abbas", "Fujairah anchorage", "Jebel Ali gate",
"Khor Fakkan", a UN/LOCODE or an Arabic name) and get a map and live tiles of
**publicly published** camera feeds that show the port, its approaches or waterfront.
Page: `/watchtower` (`?port=AEJEA`). Job files link to "Cameras: <port>".

## Public, lawful OSINT only

Only feeds already published for public viewing: port-authority webcam pages,
webcam aggregators (Windy), public YouTube livestreams, tourism/marina cams, public
traffic cameras. No private CCTV, no default-credential or exposed-RTSP scanning,
no bypassing logins, geofencing, paywalls or robots.txt, no scraping where terms
forbid it. Feeds are embedded with the publisher's own player or image — never
re-streamed. Every feed records its source URL and terms.

## Sources

- **Curated catalogue** `src/lib/watchtower/catalog.json`: 15 priority ports (Iran,
  UAE, Oman, Qatar, Bahrain, Kuwait, Saudi Arabia) and feeds. A feed is `verified`
  only after a person has opened its public page and recorded its terms; otherwise
  it is an `unverified` lead with **no stream URL**. As shipped, no fixed feed is
  verified — nothing was invented.
- **Windy Webcams API** (`WINDY_WEBCAMS_API_KEY`): public webcams within each port's
  radius, embedded with the Windy player; 15-minute cache. Verify the v3 response
  shape with a real key before relying on it.

Feed record (`camera` provider type): `{ id, name, port, country, lat, lon, type
(port|traffic|marina|tourist|shop), streamUrl, embedType (hls|youtube|mjpeg|iframe|snapshot),
sourceUrl, terms, lastSeen, status }`.

## Health

`POST /api/watchtower/health` (cron, `JOBFILE_CRON_SECRET`) checks each verified
feed at most every 15 minutes through the SSRF-safe fetch (YouTube via its public
oEmbed endpoint), storing status in `ophanim_camera_feed_status`. Three failures in
a row mark a feed `dead` and remove it from the default view (kept for audit).

## Never an all-clear

State-run port cameras are erratic. The UI says so, shows last-online badges, and
when no live feed exists says "No live public view of this port right now. This is
not an all-clear."

## Adding a feed

Add an entry to `feeds` in the catalogue with `port` (UN/LOCODE), `type`,
`embedType`, `sourceUrl` (the public page), `terms`, and set `status` to anything
other than `unverified` only after checking the page and its terms. Add new ports
to `ports` with coordinates, aliases and a search radius.
