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

Storage requires DATABASE_URL and the additive migration
supabase/migrations/20261020080311_parity_forecasts.sql after the existing tenant
schema. It has forced RLS, tenant-select policy defense, no browser table grants
and no browser write policies. Server queries contain organization predicates.
No live migration was applied by the implementation. Missing storage reports an
unavailable state, not invented forecast records. All API responses are no-store;
the public offline snapshot excludes these records and this provider.

Tests execute create/list/resolve and RLS against PostgreSQL-compatible PGlite,
including a second tenant, future-horizon rejection, immutable probabilities,
repeat-resolution rejection and denied browser-role writes. API tests verify
authentication, server-derived tenant reads, cross-origin mutation rejection and
private response headers. No authenticated production session is assumed from
these fixture tests.
