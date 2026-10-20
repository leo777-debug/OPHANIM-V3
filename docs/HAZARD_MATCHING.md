# Hazard matching and source evidence

The Natural hazards page groups **possible duplicate reports**, retaining every
source record, actual publication time and retrieval time. Provider count does
not establish independent corroboration: one provider may repeat another's data.
Current public collection uses USGS magnitude 4.5+ past-day events and up to 100
open NASA EONET records. Some EONET events are long-running; a recent fetch does
not mean a new event. Only metadata is republished from EONET; third-party source
descriptions are replaced by a factual catalogue reference and original links.

Matching requires public scope, the same hazard family, reported coordinates,
valid non-future onset times and different providers. Compare against a fixed
anchor, not a transitive chain:

| Family | Maximum distance | Maximum onset difference |
| --- | --- | --- |
| Earthquake | 50 km | 20 minutes |
| Wildfire | 30 km | 48 hours |
| Volcanic activity | 50 km | 48 hours |
| Severe storm | 300 km | 72 hours |
| Flood | 30 km | 24 hours |

Non-seismic matching also requires at least 50% Jaccard similarity among
distinctive title words after removing generic hazard/region terms. These are
conservative review heuristics, not a validated identity model. False positives
and missed matches remain possible. Multiple plausible groups stay separate and
show ambiguity. Same-provider different IDs stay separate. Repeated copies of
one provider/ID retain the latest retrieval. Undated/unlocated/future records
remain visible separately; private records are excluded entirely.

The API's five-minute collection cache preserves source retrieval times. Failure
and stale modes are explicit. No notice, event time, coordinate, corroboration or
current-safety conclusion is synthesized to fill a coverage gap.

## GDACS normalized adapter: off by default

Original documentation: [API quick start](https://www.gdacs.org/Documents/2025/GDACS_API_quickstart_v1.pdf),
[feed cadence](https://www.gdacs.org/feed_reference.aspx), and
[specific terms](https://www.gdacs.org/About/termofuse.aspx).
The quick start's referenced reuse PDF was inaccessible during this review; the
readable specific terms did not resolve commercial reuse rights. The new adapter
therefore declares **unknown** commercial use and is disabled. Admin Integrations
and Health flag it; tests cannot initiate a connection. No new GDACS dataset is
downloaded by this adapter. Its bounded parser is tested with synthetic fixtures.
Enabling requires an explicit source-rights review in code, not adding an API key.
GDACS model categories are not national official warnings or verified impacts.
The legacy news feed is separately inherited and still needs the wider rights audit.

## Conflict reference honesty

The legacy conflict endpoint now reuses the central news reader. It no longer
assigns coordinate offsets around a named conflict area or fetch-time event dates
to headlines. Regional associations are news-text context, never verified incidents.
Only fresh, explicitly source-reported points published within 24 hours can enter
the legacy `liveEvents` field; that field's response documents its narrower meaning.
Fixed editorial reference areas are labelled REFERENCE, with unknown reference
date and null update time. No validated current warzone count is asserted.

Route/hazard maps explicitly disable conflict and private SDK overlays. Turning
the conflict layer off prevents its fetch, and a fetch failure clears points
instead of drawing undated fallback incidents. Other inherited layers still need
their own provenance/freshness audit.
