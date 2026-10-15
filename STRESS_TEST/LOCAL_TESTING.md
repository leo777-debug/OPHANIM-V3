# Isolated Local Testing

## Disposable presentation reset

`npm run demo:reset` starts a new, in-memory labelled demo at http://127.0.0.1:3100.
It refuses occupied test ports instead of deleting or replacing an existing database.
No configured production database or provider credentials are inherited.
Stop with Ctrl+C; a later run creates a fresh demo. `npm run demo:reset -- --check`
seeds and verifies the real workflow, then stops its owned services.

Demo-only login: presenter@example.test / Synthetic-Demo-Only-2026.
Organization slug: competition-demo.
These are publicly labelled fixture credentials, never production credentials.
The initial scenario is DXB-291 with persisted port names, a synthetic weather
destination-port match and a rescue-case operator note.
It is not live news, a carrier schedule or a validated forecast-cone calculation.
Verify's replay buttons work without an AI model or external providers.

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

The embedded PostgreSQL socket multiplexer is not native multi-process PostgreSQL.
Native PostgreSQL 18 now runs core load, restart and one-hour soak tests via
`native-db.mjs`; its Windows binaries lack pgvector. Raw RLS and Knowledge tests
use the embedded engine directly. Do not treat the multiplexer as a native
concurrency benchmark or the core native tests as pgvector throughput evidence.

`start-test.mjs` strips inherited secrets, refuses local/production environment files and preloads the server fetch/socket/DNS guard. Browser tests block all non-local requests. Only explicit synthetic empty USGS/EONET fixtures are supplied; other external sources fail closed. Do not disable this guard for load tests. Full provider replay fixtures are still to be built.

Historical standalone startup timeouts were reproduced with the default eager
route preload. The documented `preloadEntriesOnStart: false` source setting now
passes five real HTTP checks on a fresh generated package:
`node STRESS_TEST/packaging.mjs`. The browser matrix accepts `--standalone` too.
This is isolated Windows packaging verification, not a production deployment.
Cold health still takes about 7.8 seconds; do not claim the two-second budget.

Artifacts contain synthetic screenshots and measured check results. Runtime context
and logs are ignored. `npm run demo:video` records the actual demo workflow; the
143.17-second MP4 and review are documented in VIDEO_REVIEW.md. Do not present
screenshots or the recorded fixture video as live intelligence.

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

## Additional Security Probes

`node STRESS_TEST/cyber-tenants.mjs` runs 54 native HTTP/database-role checks for
private assets, roll calls, assessment child links, remediation and task updates.
It verifies the database identity using own/foreign shipment reads before testing
restricted table writes. A permission denial before the positive control does not
count as tenant isolation. No Data API grants are added to make the test pass.

`node STRESS_TEST/workflow-tenants.mjs` runs 36 actual native PostgreSQL/HTTP
rescue-case/action/decision/evidence checks. It refuses occupied loopback ports
and stops only its own test services. Evidence URLs are stored, never fetched.

`python STRESS_TEST/extraction-safety.py` requires pypdf and Pillow and runs ten
bounded in-memory synthetic probes, with network connections blocked. The recorded
run used the bundled Python 3.12.14, pypdf 6.10.0 and Pillow 12.3.0, not the older
pins in ml/requirements.txt. It is not deployment-runtime, OCR or arbitrary hostile
PDF memory/CPU isolation certification. No unbounded decompression probe is run.
