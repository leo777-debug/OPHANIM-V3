# Optional isolated research service

Ophanim's web process does not run a browser research sandbox. Until a separately
deployed authorized service is ready, leave `AI_SANDBOX_RESEARCH_URL` and
`AI_SANDBOX_RESEARCH_TOKEN` empty. Public feed and deterministic analysis features
remain available without research.

1. Ask your administrator to deploy the research worker in an isolated VM or
   container with restricted egress, read-only credentials and no access to
   production database secrets. A bundled worker/image is not supplied yet.
2. Use the service's documented contract, including `POST /v1/research`, and require
   the dedicated bearer credential. Preserve publisher URLs and observation times
   in returned evidence. Do not bypass access restrictions or scrape prohibited sites.
3. Set the service URL and dedicated token in the web server's private environment,
   then restart. Keep the URL reachable only by the backend. An example of the
   variable *names*, with deliberately empty values, is in `.env.example`.
4. Admin → Integrations lists whether these settings are present. The current test
   is configuration-only and says so; it cannot certify sandbox isolation or source
   permissions. Do not enable production use on that check alone.

VoidAccess has a separate existing contract and separate variables:
`VOIDACCESS_API_URL`, then either `VOIDACCESS_API_TOKEN` or the service account's
`VOIDACCESS_API_EMAIL` and `VOIDACCESS_API_PASSWORD`. It is not interchangeable
with the sandbox protocol. Recon also needs its own `SCANNER_URL` and `SCANNER_KEY`.

Missing pieces are recorded openly: deployable optional Compose profiles for these
external services, protocol-specific health probes, the setup wizard and successful
test gating. No stand-in service or fake successful research result is bundled.
