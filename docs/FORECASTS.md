# Sourced probability records

Open **Sourced forecasts** in the platform navigation. Sign-in is required. An
organization member with intelligence write permission can record a public
operational question, probability, future horizon, HTTPS evidence link and analyst
rationale. Viewers can read. The server derives organization/user IDs from the
session; a request cannot select a different tenant.

This is an analyst probability register, not an automated prediction model or a
validated risk index. Evidence links provide context; the application does not
claim the linked publisher supplied the entered probability. No AI-generated
probability, targeting or strike prediction is implemented. Source pages are not
fetched or scraped by this feature.

The initial probability, question, rationale, source and horizon are immutable.
Horizons must be prospective and within two years. After the horizon passes, an
authorized analyst may record one yes/no outcome and its source link. The database
update requires the same organization, an unresolved record and a passed horizon.
No outcome can be overwritten through the API.

Binary Brier score is `(p − o)²`, with `p` between 0 and 1 and `o` equal to 1 for
yes, 0 for no. Lower is better. An unresolved forecast has no score, including
after its horizon has passed. Scoring does not independently validate outcome
evidence or establish calibration from a small sample. No aggregate accuracy
claim is displayed. The panel lists the most recent 200 organization records.

Storage: since the reconciliation with The Panel (PR #27), these records live in
the single prediction ledger from `db/migrations/025_forecast_panel.sql`. A public
question is an `ophanim_forecast_questions` row of type `public_question` with no
shipment; the analyst's probability is a `human` forecast (append-only); the sourced
yes/no answer is an immutable `ophanim_forecast_outcomes` row with the evidence link;
the Brier score is an `ophanim_forecast_scores` row. Migration
`supabase/migrations/20261022120000_analyst_forecasts_on_panel_ledger.sql` replaces
parity's never-applied `20261020080311_parity_forecasts.sql`, which created a second,
incompatible `ophanim_forecasts` table. The API moved to `/api/forecasts/analyst`
(GET list, POST create, PATCH resolve); `/api/forecasts` is The Panel's shipment
forecast endpoint. Tenant RLS comes from The Panel's forecast RLS migration; there are
no browser write grants. Missing storage reports an unavailable state, not invented
forecast records. All API responses are no-store; the public offline snapshot excludes
these records.

Tests execute create/list/resolve and RLS against PostgreSQL-compatible PGlite,
including a second tenant, future-horizon rejection, immutable probabilities,
repeat-resolution rejection and denied browser-role writes. API tests verify
authentication, server-derived tenant reads, cross-origin mutation rejection and
private response headers. No authenticated production session is assumed from
these fixture tests.
