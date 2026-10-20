# Provider point clustering

Ophanim uses the existing MapLibre worker clustering API for provider point layers
with at least 100 points. Below that threshold, individual circles retain their
existing style and interactions. Lines and polygons are unchanged.

Cluster radius is 48 screen pixels and clustering ends above zoom 14. Each dense
point layer uses one GeoJSON source, individual circles, cluster circles and count
labels. Original source records remain in the source and evidence lists; visual
aggregation is not event deduplication, independent corroboration or live status.
Counts refer to plotted source points, whose meaning depends on their layer.

Selecting a cluster requests its expansion zoom from the worker. Responses from a
removed/replaced binding are discarded. Style replacement restores every owned
layer; cleanup removes handlers and sources. No per-point DOM marker is created.
MapLibre documentation: https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/
The installed 5.x API was checked against its packaged TypeScript/source contract.
No World Monitor source, styling, assets or services were accessed or used.

Route Explorer optionally loads all 3,962 packaged Apache-2.0 Marnet port reference
points, with dataset/import dates and attribution. It defaults off. Point fields
are limited to supplied coordinates, name, code and country; no current operating
condition is inferred. The pinned ports hash is tested. Reference provenance and
limitations are in ROUTE_SCENARIO_METHODS.md.

Validation includes a 10,000-point binding fixture (one source, three draw layers),
worker-response cleanup and style restoration, plus production-browser rendering,
cluster expansion and coexistence with calculated sea routes for the actual
packaged reference points. These checks are not a measured frame-rate benchmark,
mobile/GPU hardware matrix or proof that all legacy bespoke map layers cluster.
Those legacy layers still need separate review and load validation.
