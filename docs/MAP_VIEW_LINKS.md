# Public map settings links

The Atlas share control encodes map centre, zoom, projection, basemap and selected
public display layers at `/atlas`. Explicit coordinates take priority over IP
geolocation and saved browser workspaces. `lng` is canonical; old `lon` links are
accepted. Missing/invalid coordinates do not become zero. Real zero coordinates
and zoom zero are parsed correctly; the current map renderer still clamps zoom
to its configured 1.5–18 range. Generated links use the actual displayed zoom.

An explicit empty layer list turns all public layers off, including the formerly
implicit conflict reference layer. Public layer selection is restored exactly;
flights/cables are not silently re-enabled. URL updates are debounced and cancelled
on unmount. The S shortcut opens sharing on desktop, with no conflicting search
action. Search remains available through its controls and Ctrl/Cmd+F.

The public serializer uses an allowlist. SDK/private/unknown layers block sharing,
and no credential, organization/entity identifier, shipment or private record is
serialized. Existing private APIs still require authorization. Protected private
snapshot sharing is not implemented: use a signed-in organization workflow rather
than treating a settings link as a private-data share.

These links load current source data. They do not save event data, capture a
historical instant, restore News Desk filters or provide replay. The panel states
this explicitly. The separate saved public advisory offline snapshot retains its
own timestamp and limited scope. Full map/data/time/filter snapshots remain work.

The Atlas status count is labelled **LAYERS**, since it counts selected display
flags. **LAST FETCH** describes the last completed application API request; it is
not a feed-health or coverage assertion. Use source health/freshness evidence.

Unit checks cover URL round trips, empty/all-off states, coordinate validation,
legacy longitude and private/unreviewed-layer rejection. Browser verification
opened the generated public link in a fresh tab and checked its camera, 2D/night
settings, all-off selection and persistence beyond the geolocation timer.
