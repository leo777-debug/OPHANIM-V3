# Keyless basemap recovery

All OphanimMap consumers now select OpenFreeMap Dark by default, including the
standalone Route Explorer, Aviation and Hazard maps. The former CARTO hosted URL
is no longer selected. Tile requests stay in the browser, separate from backend
event fetching. Native maps expose source attribution.

During initial startup only, a remote error or four-second failure to load switches
the native renderer to the already bundled Natural Earth reference geography.
The map explicitly labels that fallback; it does not label events as current.
Once the map loads, the recovery watcher is removed and cannot reset operational
layers after later tile errors. Unmount cancels its timer/listeners.

OpenFreeMap and Natural Earth are registered in the existing reference-provider
catalogue and Admin → Integrations, with commercial rights, attribution, key
requirements and request policy. Their upstream publication dates are unknown;
the review date is separate. The local geography is SHA-256 pinned.

Primary source documentation reviewed 21 October 2026:

- [OpenFreeMap](https://openfreemap.org/) permits commercial map display without a
  key or a stated view/request quota. It provides no availability guarantee.
- [Service terms](https://openfreemap.org/tos/) restrict bulk collection and specify
  bounded offline downloads. No offline tile-package downloader is implemented.
- [Style licence](https://github.com/hyperknot/openfreemap-styles/blob/main/LICENSE.md)
  and [Dark upstream licence](https://github.com/openmaptiles/dark-matter-gl-style/blob/master/LICENSE.md)
  identify the style/design/font licences and original attribution.
- [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/) put
  its map geometry in the public domain, including commercial use.

Cluster text now requests Noto Sans Regular. The previous Open Sans Bold endpoint
returned 404; the selected font returned 200 during an HTTP header check.
See PARITY/map-source-audit.json. That observation does not prove tile freshness
or rendering on every GPU.

Fallback geography is reference data. This change does not supply offline event
data, offline font coverage or the remaining reference-layer import schedulers.
No World Monitor code, styles, assets or service was used.
