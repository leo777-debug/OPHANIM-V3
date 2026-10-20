# Optional isolated research service

Ophanim's web process does not run a browser research sandbox. Until a separately
deployed authorized service is ready, leave `AI_SANDBOX_RESEARCH_URL` and
`AI_SANDBOX_RESEARCH_TOKEN` empty. Public feed and deterministic analysis features
remain available without research.

1. Ask your administrator to deploy the research worker in an isolated VM or
   container with restricted egress, read-only credentials and no access to
   production database secrets. A bundled worker/image is not supplied yet.
2. Implement authenticated `GET /health` (HTTP 2xx with nonempty JSON) and
   `POST /v1/research`, requiring the dedicated bearer credential on both.
   Preserve publisher URLs and observation times
   in returned evidence. Do not bypass access restrictions or scrape prohibited sites.
3. Set the service URL and dedicated token in the web server's private environment,
   then restart. Keep the URL reachable only by the backend. An example of the
   variable *names*, with deliberately empty values, is in `.env.example`.
4. Open Admin → Integrations → Optional service setup. Select Isolated research
   sandbox, follow the three steps and select **Test research connection**. This
   sends a read-only authenticated health request with the server's configuration.
   It cannot certify sandbox isolation or source permissions. No key is accepted
   by the wizard or sent back to the browser. Configuration is never saved there.
5. Each actual research request checks health again before sending context. An
   unavailable worker receives no context. Transport uses pinned DNS, no redirects,
   a total 8-second health deadline and 45-second research deadline, and a 2 MB
   response bound. Publication/collection time stays unknown when the worker does
   not supply it; retrieval time is recorded separately.

For an internal HTTP worker, put its exact scheme/host/port in
`INTEGRATION_ALLOWED_ORIGINS` on the server. Do not include a path, credentials or
wildcard. Public workers must use HTTPS. Metadata/link-local targets stay blocked,
including when a trusted hostname resolves to them. Do not expose the worker port
publicly; use a dedicated secret and network restrictions.

Request contract (illustrative, no credential included):

```json
{"subject":"Port disruption reports","purpose":"confirm","context":"Only authorized operational context","policy":{"browserExecution":"sandbox_only","allowOperationalActions":false,"requireSourceAttribution":true,"riskAssessmentOnly":false}}
```

Allowed purposes are `confirm` and `assess_risk`. Return JSON with `summary`,
`riskIndicator` (`unknown`, `low`, `moderate` or `high`), `uncertainty`, `sources`
(each title, public URL and optional publishedAt/excerpt), `collectedAt` if known,
and `limitations`. Use source attribution and explicit uncertainty. These labels
do not establish a validated forecast. No operational actions are allowed.

VoidAccess has a separate existing contract and separate variables:
`VOIDACCESS_API_URL`, then either `VOIDACCESS_API_TOKEN` or the service account's
`VOIDACCESS_API_EMAIL` and `VOIDACCESS_API_PASSWORD`. It is not interchangeable
with the sandbox protocol. Recon also needs its own `SCANNER_URL` and `SCANNER_KEY`.

Deployable optional Compose profiles for these external services remain pending.
No stand-in service or fake successful research result is bundled. If there is no
worker, leave its environment values empty; the UI reports not configured and
public/deterministic functionality remains available.
