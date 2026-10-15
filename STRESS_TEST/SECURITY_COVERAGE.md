# Security Coverage Ledger

This is evidence of the checks actually run, not a blanket security certificate.
All runtime attacks target owned loopback fixtures. No live provider, customer,
production Auth deployment, active scan or production database is used.

## Authentication And Permissions

- 112 actual route-handler methods reject mocked anonymous principals before
  provider access. Indirect extension authorization is explicitly retained in
  this sweep after its narrowly scoped CORS fix.
- 87 restricted handler/role combinations use the real permission matrix to
  reject a role that lacks the handler's first declared permission.
- Actual native HTTP tests provide permitted and denied controls for owner,
  operations manager, analyst and viewer, including shipment writes and admin
  configuration. A mocked denial alone is not counted as tenant isolation.
- Legacy sessions: expired, revoked, forged organization selection and reuse
  after logout are rejected through actual HTTP. Sign-in is tested in Chromium.
- Configured Supabase cannot fall back to legacy authentication. Live Supabase
  Auth logout, revocation and cookie interoperability are NOT runtime-certified.

## Data Isolation

| Surface | Evidence | Important scope limit |
| --- | --- | --- |
| Shipments, imports, entities, events, cases, evidence | tenant-http.mjs: 72 checks | Own reads/lists and foreign writes/read denials; not every possible role/input |
| Rescue actions, decisions and evidence | workflow-tenants.mjs: 36 checks | Parent/child links, viewer/anonymous denials and unchanged DB records |
| Cyber clients, assets, dependencies, roll calls, remediation/tasks | cyber-tenants.mjs: 72 checks | Own positive controls, foreign links and authenticated database-role control |
| Alerts, notifications, organization administration | extended-security.mjs --native: 24 checks | Actual alert ownership, four roles and notification/Verify bursts |
| SDK status and SSE | sdk-tenants.mjs: 8 checks | Configured service owner, no body override, own/foreign updates; timer cancellation has unit coverage |
| Extension context | extension-tenants.mjs: 9 checks | Configured origin plus login; own match and no foreign private results; not an installed-browser-extension certification |
| Import compatibility aliases | import-tenants.mjs: 12 checks | No pre-confirmation writes, foreign alias denial, exact own confirmed row |
| Knowledge files and Verify history/shares | tenant-http.mjs plus RLS tests | Private download/delete and foreign recheck/share denial; public share fixtures exclude organization records |

Six explicit embedded PostgreSQL/RLS tests pass. The existing Knowledge composite
shipment FK and shared-document guard have both denial and valid-own-link controls.
No duplicate migration was added. Native Windows PostgreSQL covers core load,
restart and soak; the supplied native package does not include pgvector.

The P0 evidence-child-link and global SDK stream findings are fixed. Remaining
full per-endpoint, permitted-role and parent-link permutations are still tracked
as unfinished in state.json. Do not infer exhaustive coverage from test counts.

## Injection And Transport

- Reviewed 24 direct interpolated SQL query templates in non-test TypeScript.
  Interpolations were fixed SQL fragments/column constants, parameter-number
  construction or allowlisted identifiers. For example the intelligence review
  table choice is a fixed tuple; shipment sort selection is allowlisted; search
  filters append placeholders rather than values. HTTP SQL metacharacter probes
  and database-own/foreign controls pass. This is not a whole-program SQL proof.
- Raw React HTML sinks reviewed: AI markdown escapes HTML before adding fixed
  markup; layout script/JSON-LD are application-owned; map popup strings pass
  through DOMPurify. Actual stored shipment markup renders as text; seven popup
  DOM/action regressions preserve safe functionality while stripping scripts,
  event handlers and unsafe URLs.
- CSV formula-prefix and quoting regressions pass. No spreadsheet code is run.
- Private storage traversal and escaping Windows junction tests pass, with valid
  own-file write/read/delete controls.
- Verify articles, remote AI/embeddings, extractor URLs and webhook forwarding
  have private/reserved address, redirect, DNS-pinning, size and deadline tests.
  Explicit administrator-approved local model origins are intentional exceptions.
  Remaining legacy provider URL-construction review is not certified complete.

## Resource And Disclosure Boundaries

- All three import preview interfaces share a user/IP budget. JSON and multipart
  compatibility aliases are bounded before parsing/persistence. Five alias
  regressions failed before the fix; valid inputs and cross-alias limits pass.
- Knowledge Q&A uses the shared authenticated AI budget. Source-only retrieval
  makes no embedding/generation call. Invalid model answers cannot introduce
  unsupported claims/citations into grounded output; this is not a proof that an
  arbitrary model will never repeat untrusted document instructions.
- API and server-library console review: 61 calls, no unreviewed dynamic payload.
  The exact required Shodan scan audit is retained: opaque actor/workspace/audit
  identifiers, scan ID and authorized targets, never credentials. Framework,
  dependency and old production logs are not scanned or rewritten here.
- Generic API failures and persisted Knowledge/import/notification job failures
  no longer expose arbitrary exceptions. Typed safe input guidance remains,
  including the public-events-not-people refusal. Regression fixtures contain
  synthetic credential/path markers and prove those markers are absent.
- Resend signatures are verified over bounded raw bytes before atomic writes;
  duplicate events have no second suppression effect. Missing configuration and
  connection failure fail safely. No real message is sent.
- Ten actual Python extractor probes cover bounded malformed/text/Office/PDF/image
  cases. Deployment-pinned parsers, OCR and hostile-parser process isolation are
  NOT certified. Do not run arbitrary hostile PDFs on an unsandboxed production
  worker on the strength of these tests.

## Browser, Dependencies And Sources

Production CSP has no eval or blanket HTTPS script source, plus object/base/form/
frame restrictions. Inline hydration/styles and broader connect/media/frame
allowances remain; it is not a strict nonce-based CSP. Private environment,
runtime-context and debug paths return 404. CORS is not globally permissive.

The final UI checkpoint passes 45 Chromium/Firefox/WebKit checks at three widths,
including real nonblank globe pixels and dragging. Recorded fixture flows work
without internet and carry a prominent synthetic creation timestamp. The local
app and database are still needed: this is not a cached service-worker PWA.

32 mocked failure cases cover all eight registered event/Verify adapters, with
healthy-source controls and real normalizers. Legacy non-registry provider
adapters are not all covered. No actual upstream is load-tested.

Fresh npm audit: zero production vulnerabilities; five high and three moderate
development-tool advisories remain. Forced incompatible downgrades were rejected.
Gitleaks history findings still require founder rotation of historical FIRMS
credentials; a clean new patch cannot revoke an old exposed credential.

## Remaining Gates

1. Full endpoint/role/child-link permutations and remaining legacy adapters/URLs.
2. Runtime Supabase Auth revocation/logout in a disposable representative setup.
3. Deployment-pinned OCR/PDF worker CPU/memory isolation and extraction throughput.
4. Distributed cost quotas; current limits are per process.
5. Cold-start and loaded latency targets; measured failures remain in REPORT.md.
6. Founder-owned credential rotation and explicit optional-service configuration.

These limitations are not hidden by passing mocked tests, a warm video or a clean
new secret scan. No production deployment or readiness certification is implied.
