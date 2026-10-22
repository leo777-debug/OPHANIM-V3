# Route and scenario methods

Ophanim's path solver is independently implemented. No World Monitor code or data
is used. Only the original open Marnet/ports GeoJSON data and its licence are
packaged; no searoute Python implementation was copied or translated.

Source: searoute-py 1.6.0, commit dde461382a60ff75f4577f6e06c411bc48cd7efc,
2026-05-17. The Apache-2.0 licence is retained in
public/reference/MARNET-LICENSE.txt. Dataset imported 2026-10-19.
Marnet SHA-256: 111a82d949bb949c396a69a08828781314d3afe779c07e9754c3b2834dfca415.
Ports SHA-256: 8398cb9554a19cf37f53f932f3842f58fbd94fce4c8e2704c3f5a4205ea5977e.
Original attribution is retained in MARITIME_NETWORK and the provider registry's
reference catalog. Commercial use: yes under Apache-2.0; key needed: no.

The undirected graph splits source LineStrings at their supplied vertices. Edge
weight is spherical great-circle distance with Earth radius 6371.0088 km. A binary
heap Dijkstra solver finds the shortest permitted path. Tagged passages can be
removed for hypothetical closures. ±180° nodes are unified. Northwest/Bering
passages are excluded by default; this is an assumption, not a live closure claim.

Endpoints snap to the nearest network vertex. Snap distances are displayed as
**unrouted connectors**, excluded from transit time. They may cross land or water;
they are not actual road/rail legs or surveyed harbour approaches. Maritime routes
remain schematic estimates. No draft, ice class, tides, currents, fuel, security
clearance or canal operating constraints are modeled.

Sea days = distance km / (speed knots × 1.852 × 24). Default speed is 14 knots.
A Suez closure recalculates the path with Suez edges removed, often yielding a
Cape alternative. Extra days and km are differences from the baseline. No usable
path is reported explicitly when the graph is disconnected.

Public hazard context uses USGS and NASA EONET observations, with their original
publication/fetch times. Spherical cross-track distance to modeled segments finds
observations within 100 km, including date-line crossings. Proximity never proves
operational impact or common cause. Source failure remains in diagnostics.

Organization scenarios require authenticated shipment:read permission. Tenancy
comes from the session; no client organization selector is accepted. Exact port
codes/names resolve recorded origin, transshipment and destination legs. Country
display names are normalized from UN/LOCODE country prefixes using ICU; the source
country string remains available separately. Unresolved ports remain unknown.

Templates: hypothetical chokepoint closure, port closure, country sanctions and
severe weather over a user-selected circular area. Chokepoint matches use graph
tags; port matches use recorded visits; country matches use resolved port country;
weather matches intersect route segments with the hypothetical radius. For a
chokepoint, delay = min(closure days, sum of positive alternative-path extra days),
or closure days when no alternative exists. Other templates use closure days as
an explicit waiting assumption. These are not validated ETA forecasts or legal
sanctions determinations. Dates, capacity, queues, contracts, customs and land legs
are not modeled. Up to 200 organization records are assessed; remainder counted.

CSV exports escape spreadsheet formulas. PDF export uses the browser's Print /
Save PDF flow so the analyst reviews the document before saving. Exports include
model inputs and caveats. Public route calculations never read private shipments.
