# Public map and licensed AIS

The public map uses a fixed public-feed projector. Maritime requests explicitly
select the public branch: Digitraffic plus, when AIS_API_KEY is set, AISStream
(shown publicly for now, no sign-in; restoring the sign-in rule is a pending task in
JOBFILE/PROGRESS.md). That branch never calls customer/MarineTraffic endpoints or uses
the licensed response cache. Ports and chokepoints remain reference locations, not assessed closures.

The combined endpoint requires a valid session and a matching AIS_ORGANIZATION_ID
when a customer or MarineTraffic feed is configured. Set that organization UUID alongside the relevant AIS
credentials in the uncommitted environment or hosting dashboard. Missing scope
keeps the licensed feed unavailable; another organization receives 403. Licensed
responses use private, no-store. Customer/MarineTraffic requests use the existing
bounded, DNS-pinned transport with no redirects and no raw upstream errors.

Older maritime/port/chokepoint replay snapshots lack public-only provenance and
are withheld. An owner can record new public-only snapshots through Presentation
administration. Other public replay sources retain their source and recording
times. A replay never grants organization access.

News projections retain validated first-observation storage/time, fetch freshness,
staleness, region and coordinate precision. Source error details are reduced to a
public-safe message. Missing observation metadata stays unknown. Replay disables
current convergence detection while retaining the recorded stories.

Tests use synthetic local fixtures only. No production credentials or personal
records are included. No World Monitor code, assets, API or data were used.
