# Clash resolution and feature preservation — 22 October 2026

This integration starts from default branch `feat/gdacs-weather-ai-overview` at
`a70b622`, including PRs [27](https://github.com/leo777-debug/OPHANIM-V3/pull/27),
[28](https://github.com/leo777-debug/OPHANIM-V3/pull/28),
[29](https://github.com/leo777-debug/OPHANIM-V3/pull/29) and
[30](https://github.com/leo777-debug/OPHANIM-V3/pull/30). The original dirty
checkout was left intact. Changes are isolated on `codex/preserve-feature-integration`.
No production database migrations, model activation or deployment were performed.

The [earlier 17-file audit](CLAUDE_CLASHES.md) is a historical snapshot: it compared
the then-open job-file branch `2b3a4bb` with the Panel branch. PR 26 was superseded
by PR 28's port onto the Panel ledger; PR 25 was superseded by PR 29's parity
reconciliation. Merging those old branches again would revive competing schemas.
This repair retains their useful capabilities on the already merged default.

## Resolution of the audited clashes

| Clash area | Retained implementation / repair |
| --- | --- |
| Competing forecast schemas, outcomes, scoring and mutation rules | One Panel ledger from `025_forecast_panel.sql`; merged job-file and analyst migrations extend it. Shipment, analyst and job-file predictions share immutable forecasts, outcomes, scores and rollups. No duplicate ledger or probability-update exception. |
| History, model files, consent and receipts | Panel availability timestamps, tenant models, artifact integrity, consent and public aggregate suppression retained. Job-file receipts and intervention handling remain available. No training/consent tables replaced. |
| Migration numbering/order | Existing merged filenames retained, including the distinct `025_forecast_panel.sql` and `025_knowledge.sql`. Full deterministic migration order executes in tests. Only an additive health counter and matching RLS migration are introduced. |
| `/api/forecasts` | Without a shipment parameter GET lists analyst questions; POST without `shipmentId` creates one; PATCH resolves it. Shipment GET and POST retain the worker path. Named `/api/forecasts/analyst` remains. Ambiguous and oversized requests are rejected. |
| `/api/watchtower` | `q` search keeps `ports[].cameras`; earlier `port` detail keeps `feeds`, `live`, `warnings`, `policy` and `dead=1`. `/watchtower` bookmarks open the shared globe tool. |
| `/api/dark-web/corridor` | Accepts `shipment`, `shipmentId` or tenant-owned `jobFileId`; retains normalized evidence and adds assessments, legacy source/match explanations and `dw_*` features. Rejected/duplicate/closed mentions and fixtures do not inflate forecast features. |
| Camera providers/catalogues/health stores | One Watchtower catalogue and registry provider. Optional Windy discovery is restored through search and Route Lens. Health stays in `ophanim_camera_health`; three failures mark offline, recovery stays unverified. No second status store. |
| Duplicate HIBP and missing vendor adapters | One tenant-bound HIBP adapter, preserving affected-account counts without storing aliases. Generic contracted defensive feed restored in the same framework. All hits use existing mentions/deduplication/reviews/alerts. |
| Shipment/job-file matching | Active non-synthetic job key rings, including AWB/HAWB and references added after booking, join the linked shipment entity. Declared customer domains and port identifiers are restored. Shared `shipmentIds` survive updates. No separate watchlist. |
| Missing health/exposure job entry points | Authenticated POST health and exposure routes restored. Exposure scans only credential-bound organizations in bounded graph-derived batches; existing intelligence delivery handles notifications. |
| Configuration/inventory | Regenerated from the single integration catalogue. Optional Windy/vendor variables added; all example values remain blank. Existing job, worker, provider and platform identifiers retained. |
| Map layers, tool dock, globe, CSS and sea-network geometry | Implementations already combined by PRs 28–30 retained, including served fonts, tool registration, layer lifecycle, road corridors and distance conventions. Browser tests exercise Watchtower, Route Lens, viewer, truck legs and human forecasts together. |

Prior port aliases (including Arabic aliases and JAFZA) are retained. The earlier
Bushehr code is a lookup alias. Two incorrect associations are not revived:
Shuaiba is not Shuwaikh, and Doha's old port is not Hamad. Unknown coverage stays
explicit instead of silently moving a camera pin to a different port.

## Verification

- Baseline: **675 TypeScript tests passed**, six opt-in tests skipped.
- Final: **692 TypeScript tests passed**, six opt-in tests skipped; no tests removed.
- **16 Python tests passed**: local analysts, calibration, analogs, censoring,
  patterns, SHAP, artifact integrity and activation gates.
- Production Next.js build (including TypeScript checking) and targeted ESLint pass.
- Complete merged migration chain executes; tenant-isolation, append-only,
  model-promotion and browser health-write denial SQL checks pass.
- HTTP → Python → PostgreSQL-wire test passes auth, tenant rejection, cold-start
  withholding, snapshots, actual-arrival resolution, known-answer Brier/log loss
  and repeated scoring. The same cycle scores shipment-less analyst questions
  and job-file rules while excluding interventions.
- Authenticated production browser/API test passes both forecast contracts,
  job key ring → graph → all corridor contracts, false-positive exclusion,
  Watchtower bookmarks/detail, protected cron routes, Iranian coverage gaps,
  reviewed coastal player, truck-leg storage/permissions and a stamped human
  forecast. No browser runtime exceptions.

Reproduce with `npm test`, `npm run build`, Python unittest discovery under
`forecast-worker`, `node tools/forecast/check-worker.mjs` and
`node tools/forecast/check-browser.mjs`. Point `FORECAST_TEST_PYTHON` at a local
Python environment. Browser evidence: `tools/forecast/browser-report.json` and
`docs/screenshots/route-lens/`. Fixtures/router responses are synthetic, and
external APIs are blocked in the app test. These tests verify integration,
not forecasting accuracy, current camera uptime or real truck restrictions.

## Deployment and remaining evidence boundaries

Apply `db/migrations/027_camera_health_retry.sql`, followed by
`supabase/migrations/20261022134820_camera_health_retry.sql`, before deploying
the retry-aware checker. These add a counter and retain server-only writes;
they do not drop, rename or repurpose data. Passing tests are not a guarantee
of zero production risk; use the normal staging and backup process.

Keys remain blank as requested. Windy needs its own key and reviewed API/publisher
terms. The vendor feed needs a tenant-bound contract/token, provenance and an
upstream safe-metadata guarantee. HIBP needs verified customer domains. No private
CCTV, credential bypass, illicit-market interaction or raw dump ingestion is added.

No customer history or frozen historical snapshots were supplied, so real shipment
backtests and production model activation remain withheld. Advanced models and
truck routing are retained. Real router/map deployment, source rights and live
managed-provider credentials still require deployment-specific checks. See
[FORECAST_ENGINE](../FORECAST_ENGINE.md), [ROUTE_LENS](../ROUTE_LENS.md),
[WATCHTOWER](../WATCHTOWER.md) and [DEEP_WATCH](../DEEP_WATCH.md).

The divergent historical `master` branch is not merged. Its old Docker/README
conflicts remain a historical comparison, not a conflict in this integration.
