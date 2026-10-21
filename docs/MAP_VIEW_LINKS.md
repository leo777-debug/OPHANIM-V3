# Public map settings links

The unified map share control encodes map centre, zoom, projection, basemap and
selected public display layers at `/logistics/map?view=full`, or
`/presentation?view=map` for the public Presentation surface. Legacy `/atlas`
links forward the map parameters. The settings version uses `mapVersion`, so it
does not overwrite Presentation's `view` choice. Explicit coordinates take priority
over saved browser workspaces. `lng` is canonical; old `lon` links are
accepted. Missing/invalid coordinates do not become zero. Real zero coordinates
and zoom zero are parsed correctly; the current map renderer still clamps zoom
to its configured 1.5–18 range. Generated links use the actual displayed zoom.

An explicit empty layer list turns all public layers off, including the formerly
implicit conflict reference layer. Public layer selection is restored exactly;
flights/cables are not silently re-enabled. The S shortcut and the command palette
open sharing. Search remains available through its controls and Ctrl/Cmd+K.

The public serializer uses an allowlist. SDK/private/unknown layers block sharing,
and no credential, organization/entity identifier, shipment or private record is
serialized. Existing private APIs still require authorization. Protected private
snapshot sharing is not implemented: use a signed-in organization workflow rather
than treating a settings link as a private-data share.

These links load current source data. They do not save event data, capture a
historical instant, restore News Desk filters or provide replay. The panel states
this explicitly. The separate saved public advisory offline snapshot retains its
own timestamp and limited scope. Full map/data/time/filter snapshots remain work.

The unified map reports source responses, observation counts and replay/reference
states separately. These describe the loaded payloads; use each source's time and
health evidence to assess freshness.

Unit checks cover URL round trips, empty/all-off states, coordinate validation,
legacy longitude, Presentation parameter separation and private/unreviewed-layer
rejection. Earlier browser evidence covers the former Atlas surface; the unified
map integration requires renewed browser verification before completion.

Unified-map regression now checks restored appearance/layers in a fresh signed-out
browser and sharing inside fullscreen. The share dialog portals into the active
fullscreen element when present. These checks use synthetic replay fixtures; they
do not establish live upstream availability.
