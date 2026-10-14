# Isolated Local Testing

Use this dedicated stress branch, not the developer's credential-bearing checkout.
Node 24 is required for the optional native TypeScript test bootstrap. The regular Next build does not depend on that bootstrap.

```powershell
npm ci --ignore-scripts
npm run build
node STRESS_TEST/local-db.mjs --check
node db/test-isolated-rls.mjs
node STRESS_TEST/smoke.mjs
```

The smoke runner starts an in-memory database on loopback port 55432, seeds a labelled synthetic organization, starts the production CLI on loopback port 3100, checks actual HTTP authorization and screenshots Verify at desktop/mobile sizes, then stops its own processes. Occupied ports are not taken over. No customer data or developer credentials are copied. Chromium installation: `npx playwright install chromium`; Firefox/WebKit are also installed for later matrix tests.

The embedded PostgreSQL socket multiplexer is not native multi-process PostgreSQL. Native concurrency, import-restart, sustained large-data and 200-user performance certification remain pending. Raw RLS tests use the embedded engine directly, not the multiplexer, because protocol error/savepoint behavior differs.

`start-test.mjs` strips inherited secrets, refuses local/production environment files and preloads the server fetch/socket/DNS guard. Browser tests block all non-local requests. Only explicit synthetic empty USGS/EONET fixtures are supplied; other external sources fail closed. Do not disable this guard for load tests. Full provider replay fixtures are still to be built.

An open packaging/guard problem is reproducible with `node STRESS_TEST/smoke.mjs --standalone`: health times out. The default CLI runner passes but warns that standalone output should normally use its generated server. Neither result is hidden; resolve OPS-002 before declaring production packaging ready.

Artifacts contain synthetic screenshots and measured check results. Runtime context and logs are ignored. No video has been recorded yet. Do not present screenshots of test fixtures as live intelligence.

## Tenant HTTP Regression

After building, run `node STRESS_TEST/tenant-http.mjs`. It owns and stops its
loopback app/database processes, seeds two synthetic owner organizations, and
checks 72 positive-control, foreign-read/write, child-link and session assertions. The
final artifact is `STRESS_TEST/artifacts/tenant-http.json`; the original four
child-link failures are retained in `tenant-http-before-fix.json`. Runtime
session tokens are synthetic, local-only and ignored. Coverage includes private
knowledge-document downloads/deletion, Verify history/recheck/share ownership,
expired/revoked sessions, viewer denials and logout token reuse. Alerts, remaining
file/child-link surfaces, complete role coverage and Supabase runtime sessions
still need further testing. Local private files stay under ignored runtime/,
never public/, and contain only synthetic tenant markers.

Migration `027_platform_child_tenant_guards.sql` adds database ownership guards
without deleting existing data or changing production. Run
`node db/test-isolated-rls.mjs` for six embedded database/RLS assertions,
including service-bypass child-link attempts. DATABASE_URL suites remain
optional outside this disposable runner.

For OneDrive Git index failures, a command-local workaround succeeded:

```powershell
git -c core.multiPackIndex=false -c pack.readReverseIndex=false push origin stress-test/competition
```

Do not delete packs, factory-reset Docker, force-push history or move the original dirty checkout as a workaround.
