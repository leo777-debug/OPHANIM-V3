# Independent intelligence methods

No World Monitor code, assets, API, embeds or backend data were used for this work.

## Stories

Stories preserve all evidence articles. Canonical identity removes URL fragments,
common tracking parameters, www and trailing slashes, and sorts remaining query
parameters. Content selectors remain intact. HTTP and HTTPS variants share identity.
Titles use NFKC Unicode normalization, punctuation removal and a small English/Arabic
stopword list. Similarity is token Jaccard intersection/union (default 0.65).
Non-exact title matching needs at least four meaningful tokens on each side.
Default publication window is 36 hours, anchored to the first article rather than
allowing transitive chains to grow indefinitely. Undated articles match only by URL.
Future publications do not match dated stories as current evidence.
Separate article URLs from the same publisher remain separate. Different reported
locations more than 100 km apart also prevent title-only matches; generic hazard
titles must not merge unrelated events merely because their wording is identical.

Publisher count counts labels, not independent reporting. First-seen time records
this process's first observation, resets on restart and may reset after bounded
cache eviction; earliest publication is shown separately. No durable ingestion
history is claimed. Grouping is a discovery aid and can make false matches.

## Entities and trust

Dictionary entries are a small, version-controlled Ophanim reference list, not a
complete gazetteer. Unicode boundaries avoid substring matches; aliases support
English/Arabic. IMO extraction requires the check digit; MMSI needs an explicit
label and nine digits; aircraft extraction needs an explicit ICAO24/HEX label.
Identifiers are mentions, not proof of identity or location. People are extracted
only from an explicitly supplied dictionary containing a publicRole; no generic
person-name recognition or private-individual tracking is added.

Trust order is official > wire > established_media > aggregator > social.
The metadata is manually configured in analysis.ts; it is never inferred by AI.
Unknown sources are social/unreviewed and share an unreviewed independence key.
State affiliation here means government/public statutory governance or state
ownership/funding, not a finding of editorial control or propaganda. Propaganda
risk is a separate manually configured flag; no default positive flags are added.
These metadata are not truth guarantees. Global alert-rule persistence and trust
requirements outside this panel still need integration.

## Convergence

Default area radius: 50 km. Window: last 6 hours, excluding future/invalid dates.
Default minimum trust: established_media. Need at least three independent source
types and score 40. Score = min(100, sum of unique type weights): seismic 20,
fire 15, aviation 15, maritime 15, news 10, outage 20, GNSS 15.
Repeated signals of one type add no score. Each reviewed operator contributes at
most one type, conservatively selected in stable signal-ID order. Every contributing
observation is shown, together with the scored operator/type selections.
Distance is spherical haversine with Earth radius 6371.0088 km, including date-line
crossing. Candidates are centered on actual observations, not invented locations.
Overlapping candidate areas may remain; this is not a validated risk index.

The current desk wires reported news coordinates and USGS observations. Approximate
country centroids, stale news caches and undated reports are excluded. Fire,
aviation-disruption, maritime-disruption, outage and GNSS normalization still need
adapters. No actual alert is synthesized to demonstrate the UI. Proximity does not
establish causation, targeting intent, a closure or a strike prediction.

## Context and freshness

Why-it-matters text is labelled rule-based INFERENCE and lists mentioned route
assets without asserting an operational impact. AI is not used by these methods.

News checks use a five-minute process-local shared cache, eight-second attempt
timeout, one retry with 250 ms backoff and no immediate retries of 4xx responses.
Three consecutive failed refreshes open a five-minute circuit. Failed refreshes
retain last-good data; stale-since is its original cache expiry. Checks within the
poll interval retain the original checked timestamp. Empty feeds and undated
publications remain explicit gaps. Instances do not share health/cache state yet.
