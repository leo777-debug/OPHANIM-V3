# The Panel

This is an initial local forecasting and accountability implementation, not a claim
to match a room of veteran analysts. **No production model is active and no
real-world accuracy is established.** The checked-in
[`backtest-report.json`](../forecast-worker/backtest-report.json) reports zero
supplied historical rows and a blocked launch. No Hormuz shock result is invented.

The design reuses the founder research's Forecast Card, immutable Receipts ledger,
automatic pre-mortem, factual Silence Clock and tariff-based Demurrage Meter scenario. The current forecast target is
**arrives by the frozen carrier promise**, with nominal P10/P50/P90 ETA bounds.
Other question types have storage contracts but do not yet have validated analysts.
The Demurrage Meter prices the analog arrival distribution against an explicitly entered last-free timestamp and daily AED tariff. It is a conditional scenario: arrival is not gate-out, and no intervention saving is claimed without observed evidence.

## Storage and tenancy

Numbered migration `025_forecast_panel.sql` adds timestamped shipment facts,
milestone actual times/source, historical import markers, public history,
immutable feature snapshots, questions, append-only forecasts, outcomes, scores,
rollups, model registry and opt-in consent. Existing rule-based 0–100 assessments
remain separate. Matching tenant FKs reject cross-organization parent references.
The matching Supabase migration forces tenant RLS, denies browser writes, grants
tenant reads, and creates a private `ophanim-models` bucket. SQL regression tests
execute the **entire existing migration chain** and test tenant reads, denied
browser mutation, mismatched parents, anonymous denial, immutable records and
failed model promotion. No production migration was applied by this work.

Forecast definitions, snapshots, issued probabilities and outcomes cannot be
rewritten. Updates issue new rows with trigger/model/input references. Carrier ETA
(on-time certainty) and the historical base rate are stored and scored alongside
ensemble, component, analog and human forecasts. Outcomes retain provenance;
intervention-labelled outcomes are excluded from scoring.

Training is per organization and exact reference class (lane, carrier, cargo,
recorded regime), with a conditional quarter/season base rate when at least thirty matching cases exist and an explicitly labelled broader reference otherwise. Cross-customer pooling is disabled. Consent
defaults false; the worker never reads another tenant's training shipments.
Public data is shared and must carry source, observed/available times and licence. `python forecast-worker/import_public_history.py history.csv` validates numerical public records and stamps availability at import time, preventing retrospective availability claims. It never crawls a source or infers reuse permission.
Receipts expose aggregate rollups only, require explicit publication consent,
at least five organizations and 100 scored forecasts per public cell, and contain
no tenant, lane, model or shipment identifiers. Small cohorts stay private.

## Models and honest uncertainty

Eight feature groups define port operations, chokepoint/security, customs/paperwork,
weather/sea, freight/bunker, sanctions screening, trucking and carrier behaviour.
A specialist is omitted unless its feature group has actual training observations.
The initial candidates alternate regularized logistic regression and small
gradient-boosted trees, with Platt calibration on a separate chronological set.
Missingness is explicit; unknown inputs are not safety evidence.

Analogs use standardized nearest neighbours, then bounded dynamic-time-warping
comparison of event tokens. Up to 25 cases display outcomes and delay hours.
Supported empirical threshold rules have minimum sample support and observed delay
rates. Event precursor likelihood ratios use smoothed resolved-history counts;
only the strongest precursor adjusts the pooled odds, once per frozen state,
to avoid repeatedly multiplying the same observation. Every update is stamped.
These are initial one-step precursors, not a complete sequential mining engine.

Specialists and analogs combine through log-odds pooling, weighted by Brier loss
on a separate chronological weighting set. Correlated agreement is not blindly
extremised. An isolation forest flags out-of-distribution shipments and withholds
their forecast. The card shows the strongest dissent and missing inputs. A conservative recent-versus-reference sentinel changes the reference regime when public queue/rate/transit history shifts by at least three standardized units, requiring at least fourteen observations; a regime without sufficient resolved history withholds forecasts.
Approximate permutation SHAP on the combined prediction supplies three drivers,
with source evidence references. The numerical background is organization-private.

ETA starts with regularized delay regression and split-conformal residual bounds.
The nominal 80% interval requires exchangeability and is **not guaranteed across
regime shifts**. Joint-row Monte Carlo bootstrap is available for observed journey
components, retaining shared shocks; it refuses fewer than 30 complete cases.
It is not substituted for missing customs/truck histories. Survival/AFT, Bayesian
causal-network and time-series specialists, full sequential mining and richer
regime segmentation remain analyst extensions requiring suitable data/backtests.

## Training, backtests and promotion

Only frozen snapshots preceding the actual outcome and original promise enter
training. One shipment contributes one example. Train/calibration/weight/test
partitions are chronological, with unresolved labels purged at each boundary.
Historical imports are never retroactively reconstructed from today's live tables.
Actual arrival/departure and all milestone deadline/completion columns can enter
the existing import preview/confirm gate; historical rows are marked delivered.
They preserve labels/provenance but cannot fabricate past as-of feature snapshots.
An audited historical snapshot dataset is still needed for retrospective replay.

At least 150 distinct usable cases are required for training, with at least 30
untouched holdout cases. A candidate must beat both base-rate and carrier ETA
baselines. Replacement models must also beat the current model on later untouched
cases. Initial automatic activation additionally requires a real Feb–Mar 2026
Hormuz shock sample; fixture tests never authorize production activation.
Artifacts are private worker-written joblib files with registry SHA-256 checks
before deserialization. Never load customer-uploaded serialized models.

Run `python forecast-worker/backtest.py --input snapshots.json --output report.json`
for an offline chronological replay. No input produces an explicit blocked report.
The synthetic Python test history validates software behaviour only, not real
forecast accuracy. The baseline backtest can be reproduced with the fully pinned Python
`requirements.lock` dependencies; later analyst families must beat the same holdout gates.

## Runtime and scoring

`forecast-worker/` is Python 3.12 with pinned NumPy, scikit-learn, SciPy, SHAP,
joblib and psycopg. It has **no LLM agents, AI API clients or AI API keys**.
Compose adds a private worker and persistent model volume; `render.yaml` adds a
private service/disk. The app receives its internal host and shared bearer token.
For local installs set `DATABASE_URL`, `FORECAST_WORKER_URL`,
`FORECAST_WORKER_TOKEN`; the container uses `/models`. Remote/internal access must
be restricted to the application network. Model bucket writes have no browser
policy; mounted-volume operation is the implemented artifact backend.

The worker snapshots active shipments, attempts forecasts and resolves actual
arrivals every five minutes. It attempts chronological retraining/backtesting once
per UTC day. The existing intelligence cron also resolves/scores and queues forecast
alerts. Missing actuals never become automatic negative outcomes. Brier, log loss,
median ETA absolute error and interval hit are stored per issued record. Rollups
carry organization, source, model, lane, question and month. Human calls use the same immutable ledger and scoring; operator reasoning is retained. Later snapshots include the latest operator probabilities, weighting forecasters by their prior scored Brier loss after ten outcomes. Calibration bins and per-analyst rollups power the card plot. Thirty recent resolved comparisons can retire a panel that is worse than its base rate or has absolute probability bias above 0.15; daily retraining attempts a replacement. Timestamped customs-release events resolve customs questions; a same-origin reviewed outcome API supports other question types and intervention exclusions. No continuous-learning accuracy claim is made.

## Verification

On 21 October 2026: production Next.js build passed; 348 TypeScript tests passed
(one existing live test skipped); ten Python tests passed (including the actual SHAP explanation path and regime sentinel). A real HTTP/Python/
Postgres-wire integration check passed for authentication, tenant parent rejection,
cold-start withholding, immutable snapshot persistence, outcome resolution,
known-answer Brier/log-loss and repeat scoring. The authenticated browser check also traverses shipment creation, route/corridor drawing, Iranian camera gaps, worker withholding and a stamped human forecast, with no browser runtime exceptions. See `tools/forecast/browser-report.json` and screenshots. All browser/test shipments are synthetic; no real customer data or keys are used. Docker/Render deployment and
live managed-source credentials require deployment-specific verification.
