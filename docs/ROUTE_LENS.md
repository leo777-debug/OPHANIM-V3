# Route Lens

Open a shipment's **Route Lens + forecast** link. It opens the existing operational
globe and dock at `/logistics/map?tool=route-lens&shipment=UUID`; it does not create
another mapping application. Signed-in shipment access is required.

The route API reads existing shipments and ready `ophanim_routes` geometry. When
geometry is absent, it resolves unambiguous recorded port names/codes against the
priority catalogue and the parity branch's pinned maritime reference dataset,
then computes paths through each transshipment stop. Ambiguous/unresolved stops
produce gaps rather than guessed locations. The dataset and original Apache-2.0
licence are retained in `public/reference/`, with attribution/hash/version in
`route-intelligence/reference.ts`. This is an indicative planning network, not
navigation, live traffic, vessel suitability or a confirmed viable alternative.
Suez-avoiding alternatives appear grey where a distinct connected path exists.

The primary sea path is green; amber endpoint connectors are explicitly unrouted.
Truck legs use a configurable local Valhalla adapter and are drawn pale blue.
Vehicle telemetry is not inferred. A 50 km corridor is drawn using sampled buffer polygons;
spherical point-to-segment distance is the authoritative evidence filter, including
date-line handling. Source updates refresh the route view every minute.

Six toggles show counts and **why this is here**:

| Layer | Existing source path | Missing-data behaviour |
| --- | --- | --- |
| Cameras | Watchtower catalogue at route ports | Unverified/offline coverage, not all clear |
| Deep Watch | Entity matches + signal assessments | Source/confidence/review labels; association-only marker |
| News | Existing normalized events + observation provenance | Only reported coordinates inside corridor |
| Markets | Normalized rate/fuel/demurrage events | No invented local market values |
| Weather | Normalized weather/sea events | Unknown when no matching observations are loaded |
| Screening | Existing GUR + OpenSanctions adapters | Disabled until terms reviewed; no clearance inference |

No second GDACS/news/weather ingest is introduced. Undated and resolved/cancelled
events are excluded from current pins. The current query examines the newest
1,000 normalized events in seven days; this bounded coverage is not exhaustive.
Market/sea-state coverage depends on the deployment's reviewed existing providers.

Set `ROUTE_SCREENING_TERMS_REVIEWED=true` only after reviewing source access,
robots and commercial-use rights. The GUR match requires exact IMO; OpenSanctions
matches from the existing dataset are labelled name-only and need identity review.
Each marker retains provider provenance and a source link. GUR is one public
screening source, not ground truth. These markers are associated with the route,
not live locations of sanctioned vessels. Do not use the view to track or target
anyone. [OpenSanctions commercial licensing](https://www.opensanctions.org/licensing/)
must be settled separately from technical reachability.

The evidence view renders before the operator requests a forecast. The Forecast
Card reads the append-only ledger and calls the internal local Python worker.
New high-delay ensemble calls can enter the existing intelligence alert/delivery
path through intelligence cron; they do not masquerade as dark-web mentions.
See [Forecast Engine](FORECAST_ENGINE.md) for activation gates and limitations.

## Truck and address routing

Open **Depot and truck legs** in Route Lens, choose the origin or destination end,
and explicitly select a depot and an accessible public port gate. Address search
reuses the existing registry geocoder, with manual submit and a process-local
one-second throttle; it does not autocomplete. Enter latitude,longitude to avoid
sending an address to that public source. Distributed deployments must enforce
the provider's total rate limit at the egress boundary. No ambiguous address is
silently selected. Gate candidates must be within 30 km of the shipment port.

Declare height/width/length (metres), gross weight (metric tonnes) and hazardous
cargo status. The adapter requests Valhalla `truck` costing, preserving these
restrictions. It validates returned geometry and rejects snapping over 1 km.
The general hazmat flag does not replace ADR-class, permit or gate-access review.
It reports planning distance/duration, not live traffic or customs clearance.

Set `ROAD_ROUTER_URL` to a reviewed internal Valhalla service that has a suitable
OSM road extract. No API key is needed for a local service. Follow the official
[Valhalla deployment](https://github.com/valhalla/valhalla) and
[truck routing API](https://valhalla.github.io/valhalla/api/route/api-reference/)
guides; load/update maps and verify local truck restrictions before operation.
The variable remains blank by default. No public demo endpoint receives tenant
routes. A missing router or disconnected road produces an explicit error.

`POST /api/route-lens/road` checks same-origin, route-write role and tenant shipment
membership, then atomically saves each leg under `ophanim_routes.metadata.road_legs`.
It does not create another route/watchlist store. GET on that endpoint returns
explicit address candidates through the existing provider registry. Route Lens
adds each road geometry to the evidence filter as a separate corridor, avoiding
invented lines between sea and depot segments. Plans older than seven days are
flagged. Worker snapshots label router duration as **planned_truck_hours**, never
as an observed trucking duration or outcome.

The browser integration exercises actual API/storage/map wiring against a
synthetic Valhalla response, including viewer, cross-tenant and foreign-origin
denials. A real local router/map deployment was not supplied, so road accuracy,
regional map coverage and actual restriction handling remain deployment checks.
