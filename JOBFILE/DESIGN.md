# Job File + Panel: one compatible design

Scope: the Job File prompt (sections 4.1–4.10) first, then Watchtower, Deep Watch,
Route Lens and The Panel, built on the same job-file foundation. Branch
`feat/job-file-core`, cut from local commit `2a2b72e` on `parity-and-reliability`.

## What already exists and is reused

| Existing | Reused for |
| --- | --- |
| `ophanim_organizations`, memberships, `app_private.is_organization_member` | Tenant scope and RLS read policies on every new table |
| `ophanim_documents` (private bucket `ophanim-private`, `<org>/...` paths) | Job-file documents. Extended with `job_file_id`, page count, intake channel, version chain; type check widened |
| `src/lib/knowledge/storage.ts` (Supabase Storage or `KNOWLEDGE_STORAGE_DIR`) | Private photo/document bytes. Signed URLs added beside it |
| `ophanim_audit_events` | Audit trail for job files, fields, flags and invoices |
| `ophanim_shipments` | Optional `shipment_id` link from a job file, so the map, exposure and Panel labels keep working |
| `ophanim_import_mapping_profiles` + import pipeline | Remembered spreadsheet mappings, scheduled/emailed sheets, renamed-column detection |
| Provider registry / normalized events | Port and carrier notices; weather providers. International METAR/TAF stays behind the existing rights-reviewed connector gate |
| `ophanim_intelligence_alerts` / Resend | Alert budget and daily digest delivery |
| AI config (`AI_BASE_URL`/`AI_MODEL`/`AI_API_KEY`, local model) | Vision document reader and email milestone extraction |
| `/admin/integrations` catalog + status | "Setup status": new integrations are catalog entries, environment-only |
| Feature flags / editions | New `job_files` feature, on in `logistics` and `full` editions |
| `ophanim_forecasts` + Brier scoring | **The single prediction ledger** (below) |

## One prediction ledger

The PARITY note is correct: `ophanim_forecasts` already exists (analyst-entered
probabilities, immutable inputs, Brier score, forced RLS). The Panel prompt's
statement that no forecast store exists is outdated. Neither prompt gets its own
ledger. `ophanim_forecasts` is extended, never replaced:

- `ophanim_forecast_questions` — a concrete checkable question about a job file
  and/or shipment: `question_type` (`ghost_position`, `time_gap_risk`,
  `weather_impact`, `payment_date`, `dispute_odds`, `paper_risk`, and the Panel's
  `arrives_by`, `clears_customs_by`, `delay_over_days`, `eta_distribution`,
  `sanctions_exposure`), `outcome_kind` (`binary` | `interval` | `timestamp`),
  `threshold`, `resolve_by`, `status`.
- `ophanim_forecasts` gains: `question_id`, `job_file_id`, `shipment_id`,
  `source_type` (`human` for every existing row, plus `rule`, `logistic`,
  `ensemble`, `component_model`, `analog`, `base_rate`, `carrier_eta`),
  `prediction_type`, `prediction jsonb` (probability or quantiles),
  `p10_at/p50_at/p90_at`, `base_rate`, `drivers`, `rules_fired`, `analogs`,
  `inputs_hash`, `feature_snapshot_id`, `model_version`, `trigger`, `issued_at`.
  `created_by` becomes nullable only for non-human sources; human rows still
  need a source URL and a question. Legacy rows keep their inline outcome.
- **Append-only**: a trigger forbids delete and any update, except the legacy
  one-time outcome resolution on human rows that have no `question_id` (so the
  existing Sourced forecasts API keeps working). An update is a new row.
- `ophanim_feature_snapshots` — inputs snapshot as known at `as_of`
  (`inputs_hash` = sha256 of canonical JSON). Job-file "inputs_snapshot" and the
  Panel's feature snapshots are the same table.
- `ophanim_forecast_interactions` — append-only `shown` / `acted` / `dismissed`
  events. The job-file `shown_to_user`, `user_action` and `intervention`
  fields are derived from it, keeping the forecast row immutable.
- `ophanim_forecast_outcomes` — one per question: boolean, timestamp or numeric
  outcome, `resolution_source`, evidence.
- `ophanim_forecast_scores` — per forecast: `brier`, `log_loss`, `interval_hit`,
  `abs_error_hours`, and `excluded_reason` (`intervention`) so acted-on warnings
  never enter calibration.
- `ophanim_model_versions` and `ophanim_forecast_score_rollups` arrive with The
  Panel. Until then `model_version` is a text tag such as `ghost-position@1`.

## Job-file data model (prefix `ophanim_`)

`job_files`, `job_references` (key ring), `job_legs`, `job_milestones`,
`job_piece_counts`, `extracted_fields`, `job_checks` (flags),
`today_items`, `sites`, `site_events`, `driver_links`, `invoices`,
`counterparties`, `lessons`, `intake_items` (email/WhatsApp/photo inbox),
`accepted_differences`, `milestone_templates`, `step_durations`,
`source_report_lags`, `document_types`, `rule_packs`, `paper_templates`,
`generated_papers`, `city_pulse_events`, `staff_document_stats`.

Every tenant row has `organization_id`; every table has RLS enabled and forced,
a member-read policy, and no browser write grants. Writes go through
authenticated server routes with organization predicates, matching the existing
forecasts pattern. `sites` and `lessons` may be shared (`organization_id null`).

## Demo / stub mode

No DATABASE_URL, no AI key, no email/WhatsApp/ASP key → the feature runs on the
**SYNTHETIC DEMO** job (air import, 12 pieces, DXB) computed in memory through
the same pure functions, and every screen says so. Nothing crashes.

## Panel phases (after Job File)

The Panel's Python `forecast-worker` writes into the same ledger tables with
`source_type` = `component_model`/`ensemble`/`analog`/`base_rate`/`carrier_eta`.
Job milestones and piece counts are labels it can learn from; Panel's requested
`actual_at` on `ophanim_shipment_milestones` and `ophanim_shipment_events` are
added then, linked to job files through `shipment_id`.
