# GitHub / Claude clash audit — 21 October 2026

Audited **after push** of `8218ed3` on `codex/route-lens-panel`.
Fetched remote refs; audit timestamp: `2026-10-21T19:05:10.137764+00:00`.

The default target `feat/gdacs-weather-ai-overview` remains at `d22f6a0`: **no merge conflict**. Dry-run checks used `git merge-tree --write-tree`; no merge, reset, checkout or modification of another branch was performed.

## Current Claude work

[PR #26](https://github.com/leo777-debug/OPHANIM-V3/pull/26), `feat/job-file-core` at `2b3a4bb`: **17 conflicted files**. Claude attribution is explicit in the commits’ `Co-Authored-By` trailers. Particularly relevant: `32f0ee6` (Watchtower), `76bd1e0` / `2b3a4bb` (Deep Watch), `b712a1c` / `1e91340` (ledger/schema and mutation rules).

Eight conflicts are inherited from its `parity-and-reliability` dependency; nine additional files conflict on the job-file branch. This is branch-level attribution, not a claim that every conflicting line was written by Claude.

| File | Conflict | Source | Clash |
| --- | --- | --- | --- |
| `.env.example` | content | Parity dependency | Different worker, provider and job-file configuration blocks. Preserve blank secrets. |
| `.gitignore` | content | Parity dependency | Independent generated artifacts and local worker/runtime exclusions. |
| `docs/DEEP_WATCH.md` | add/add | Additional on job-file branch | Two descriptions of adapter configuration, scope and corridor contracts. |
| `docs/WATCHTOWER.md` | add/add | Additional on job-file branch | Two camera catalogues and different coverage/verification narratives. |
| `src/app/api/dark-web/corridor/route.ts` | add/add | Additional on job-file branch | Incompatible query parameters and response shape; details below. |
| `src/app/api/forecasts/route.ts` | add/add | Parity dependency | Independent shipment-worker and legacy analyst forecast APIs at the same URL. |
| `src/app/api/watchtower/route.ts` | add/add | Additional on job-file branch | Different search/detail response contracts at the same URL. |
| `src/app/globals.css` | content | Parity dependency | Independent map, Watchtower and forecast UI styles. |
| `src/components/DynamicProviderLayers.tsx` | content | Parity dependency | Different custom-layer lifecycle/style-reload handling. |
| `src/components/map/MapToolDock.tsx` | content | Parity dependency | Independent tool registration/panels/navigation. |
| `src/components/presentation/PresentationGlobe.tsx` | content | Parity dependency | Overlapping map/layer integration. |
| `src/lib/dark-web/entity-registry.ts` | content | Additional on job-file branch | Different active shipment/job-file sync and subject associations. |
| `src/lib/dark-web/index.ts` | content | Additional on job-file branch | Two HIBP adapters and different scoped-query context. |
| `src/lib/dark-web/provider-framework.ts` | content | Additional on job-file branch | Different provider scope, filtering and execution contracts. |
| `src/lib/intelligence/operations.ts` | content | Additional on job-file branch | Overlapping match explanation and forecast-alert handling. |
| `src/lib/providers/types.ts` | content | Additional on job-file branch | Overlapping camera provider category/type definitions. |
| `src/lib/route-intelligence/open-network.ts` | add/add | Parity dependency | Copied sea-network module uses different distance helper/import (lon vs lng). |

## Schema and integration clashes beyond text markers

1. **Forecast ledger definitions are incompatible.** Our `db/migrations/025_forecast_panel.sql` creates the ledger. Parity creates `public.ophanim_forecasts` in `20261020080311_parity_forecasts.sql`; Claude extends it in `20261021090000_job_files_security.sql`. Questions use our `question_text` versus Claude’s required `text_en`, `outcome_kind` and `subject_key`. Snapshots require Claude’s `inputs_hash`/optional job subject versus our required shipment/composite tenant keys. Forecasts use our `user_id`/JSONB `trigger` versus legacy `created_by`/text `trigger` plus required version/hash fields. `IF NOT EXISTS` cannot reconcile these column contracts.

2. **Outcomes, scoring and immutability disagree.** Our outcome columns are `outcome` / `actual_at`; Claude uses `outcome_bool` / `outcome_at` / `outcome_value`. Claude scores require `question_type` and support `excluded_reason`; our scores use an ID plus immutable outcome intervention metadata. Our trigger rejects all forecast updates/deletes; Claude preserves a legacy one-time outcome update and allows nested cascade deletes. Keeping both triggers would break legacy operations; dropping one without a migration would change ledger guarantees.

3. **Shared training/model tables have different types.** Claude `028_watchtower_panel.sql` defines shipment events with `created_at` and an event enum, while our worker needs `recorded_at`. Public history is numeric without `available_at` in Claude’s schema, versus JSONB with explicit availability here. Model `training_window` is JSONB there versus a PostgreSQL timestamp range here. Rollups use `model_version` text there versus `model_version_id`/`analyst_key` here. They cannot be used interchangeably by the worker.

4. **Parallel health/history/consent paths would survive a textual merge.** Camera state lives in `ophanim_camera_health` here versus `ophanim_camera_feed_status` in Claude’s work. Imports mark `historical` here versus `is_historical` there. Pooling/public-receipt consent uses our `ophanim_forecast_training_consent` versus Claude’s `ophanim_forecast_pooling_consent`. Our public `ophanim_public_receipts` uses consent/cohort suppression; Claude’s `ophanim_receipts` is an organisation-scoped invoker view. These need explicit mapping/consolidation.

5. **Migration numbering overlaps.** Our `025_forecast_panel.sql` and Claude/parity `025_knowledge.sql` reuse number 025. Filenames differ so Git does not mark a conflict; application order and the combined schema must be reconciled before deployment.

6. **Three HTTP contracts differ.** `/api/forecasts`: our GET requires `shipment`, POST requests a worker forecast; Claude’s GET lists analyst forecasts, POST creates a sourced human forecast, PATCH resolves legacy records. `/api/dark-web/corridor`: our `shipment` returns `mentions`; Claude’s `shipmentId`/`jobFileId` returns merged mentions, assessments and feature counts. `/api/watchtower`: our search response embeds `cameras`; Claude’s search lists ports and a separate `port` query returns `feeds`. Choosing one file without updating consumers breaks the other UI.

7. **Duplicate providers and subject matching need consolidation.** Our `catalogue.json`/`watchtower-provider` and Claude’s `catalog.json`/`camera-provider` can both register after Git auto-merges the registry index. Our tenant-bound `hibp-provider` and Claude’s `licensed-providers` differ in configuration, allowed-term handling and result IDs. Claude adds job-file terms; our route/worker matching relies on merged `shipmentIds` attributes on route entities. A simple text resolution can drop either job-file coverage or shipment associations, or double-query a subscription.

## Dependency branch

`parity-and-reliability` at `265f87b`: **8 conflicted files**, all marked “Parity dependency” in the table above. This is also the base of Claude’s PR #26. Its forecast ledger exists before the job-file extensions, so reconciling only the three recent Watchtower/Deep Watch commits is insufficient.

## Historical master branch

The all-remote scan also found a historical Claude-coauthored upstream Docker commit `2fe3b75` on `master` (`ba55c4d`). A whole-branch merge has 11 conflicts, but only **`README.md` and `docker-compose.yml`** overlap files touched by that Claude commit. The other nine arise from the older divergent branch, not that Docker commit. This is separate from current PR #26 and is not the default target.

Full dry-run paths, compared SHAs and identified Claude commit subjects are retained in `claude-clashes.json`. Conflicts are listed only; none were resolved or merged.
