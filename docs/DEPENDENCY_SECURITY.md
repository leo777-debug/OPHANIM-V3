# Dependency security checkpoint

20 October 2026. No World Monitor code or services were used.

The baseline audit identified critical advisories affecting Next.js 16.3.1 and
MapLibre GL JS 5.24.0, plus Sharp and transitive dependency findings. Updated and
pinned Next.js/eslint-config-next 16.4.2, MapLibre GL JS 6.15.0 and Sharp 0.35.5.
Compatible transitive fixes were applied without forced downgrades.

MapLibre integration follows its
[v5–v6 migration guide](https://github.com/maplibre/maplibre-gl-js/blob/main/docs/guides/v5-to-v6-migration-guide.md)
and [bundler documentation](https://maplibre.org/maplibre-gl-js/docs/):
namespace imports, a same-origin hashed worker emitted by Next, native nested
GeoJSON properties with legacy cache compatibility, and public projection APIs
instead of the removed internal transform. The pinned Next/MapLibre combination
fails in Turbopack's dynamic URL analysis, so dev/build explicitly use Next's
supported Webpack path. No dependency source patch is applied. WebGL2 is required by MapLibre 6.
Browser/device rendering validation remains required.

`PARITY/dependency-production-audit.json` records zero production findings.
`PARITY/dependency-current-audit.json` retains five high findings in the
development-only eslint-config-next → fast-glob → micromatch → braces chain.
The registry reports no compatible patched chain; its suggested forced downgrade
to eslint-config-next 14 is incompatible with the selected framework. No such
downgrade or unverified replacement was applied. The affected tool processes
repository lint patterns, not public request input. This is a remaining toolchain
exposure, not a zero-vulnerability claim about the full dependency tree.

Raw pre-update findings remain in `PARITY/dependency-audit.json`.
Audit snapshots are dated observations, not a guarantee against later advisories.
