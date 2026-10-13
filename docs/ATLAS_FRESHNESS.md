# Current Atlas Data

The globe's current view now checks source observation timestamps independently
from the time Ophanim fetched a response. Downloading an old record today does not
make the record current. These rules do not remove historical records from the
underlying news API or change logistics history, watchlists or Verify evidence.

## Display Rules

- Aircraft and vessel positions: observed within the last 10 minutes.
- News, earthquakes, fires, GDACS incidents and cyber reports: dated within the
  last 24 hours, a rolling window rather than a local calendar day.
- Official weather warnings issued earlier may remain visible while their
  explicit expiry is in the future and the source snapshot is still fresh.
- Future, undated and out-of-window records are withheld from the current view.
- Last-known responses expire after three refresh intervals, even if the next
  fetch fails. A failed fetch never resets the successful fetch timestamp.
- Cables, port coordinates and War & Sanctions associated ports remain reference
  geography. Sanctions listing dates are not live vessel location timestamps.
- No source connectivity or global coverage is guaranteed. An empty current
  view means no sufficiently recent, dated observations were available, not
  proof that nothing happened.

## Refresh Cadence

| Feed | Globe refresh |
| --- | --- |
| Aircraft | 2 minutes (existing upstream quota backoff/cache retained) |
| Vessels | 1 minute |
| News, earthquakes, weather, GDACS, cyber reports | 5 minutes |
| Satellite fire detections | 10 minutes |
| Cyber advisory catalogue | 30 minutes (current view shows recent updates/listings) |

Visible tabs also re-fetch these feeds when brought back into the foreground.
A 30-second local expiry check ages records out without waiting for a network
request. Sources shows current counts, withheld counts, last checks, latest
observation times and failures. These are feed-level diagnostics, not a claim
that every enabled provider is connected.

## Timestamp Normalization

- Digitraffic: `timestampExternal` (epoch milliseconds), not `timestamp`
  (AIS second-of-minute). [Source documentation](https://www.digitraffic.fi/en/marine-traffic/).
- OpenSky: state-vector `time_position`, not API receipt time.
- ADS-B JSON: snapshot `now` minus aircraft `seen_pos` seconds. Both must be
  present; missing times are unknown, not today's date.
- AISStream: `MetaData.time_utc` on position reports. Static metadata updates do
  not refresh a vessel position's observation time.
- Customer AIS: `observedAt`, `timestamp` or `position.timestamp`. MarineTraffic:
  `TIMESTAMP`, `timestamp` or `POSITION.TIMESTAMP`. Configured adapters must
  supply a full timestamp, not an AIS second-of-minute.
- FIRMS: acquisition date and UTC acquisition time. EONET: geometry date.
- Cyber CSV timestamps retain their full time rather than only the date.

## Verification

`src/lib/atlas-freshness.test.ts` covers numeric/UTC timestamps, ADS-B ages,
position-window boundaries, stale/unknown/future records, cache expiry, active
and expired weather alerts, FIRMS acquisition times and reference preservation.
`src/app/api/maritime/route.test.ts` verifies actual route normalization and that
failed-source cache reuse cannot make an old position current.

This is freshness enforcement, not a new data licence or paid feed activation.
Provider outages, rate limits and source publication delays still apply.
