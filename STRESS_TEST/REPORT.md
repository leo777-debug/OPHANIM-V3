# Stress Test Report (In Progress)

**Not fully competition-certified yet.** This is a checkpoint, not an exhaustive
security certification. The results immediately below supersede historical
checkpoints later in this document. Updated 15 October 2026, Asia/Dubai.

## Current Verified Results

Working revision after e274d16: Knowledge, SDK, signed webhooks, bootstrap,
production CSP, API error/log redaction and timestamped replay labels are built
and regression-tested. Final whole-suite run: **782 passed, seven opt-in skips**
(58.81 seconds). Six explicit database/RLS tests pass (14.47 seconds). This is
measured local coverage, not exhaustive security or live Supabase certification.
The final browser rerun passes all 45 checks after moving the offline-basemap
label clear of the mobile toolbar. No new focused lint findings were introduced:
changed-file baseline 204 errors/33 warnings, current 202/32 across 140 files.

| Check | Latest result | Scope / caveat |
| --- | --- | --- |
| Full unit/integration suite | 782 passed, 7 opt-in skipped | 109 passing files, 2 skipped; default one-worker run, 58.81 seconds |
| Build | Passed, Next 16.3.8 | Rebuilt `.next-stress-final`; five generated-standalone HTTP checks pass |
| TypeScript / focused lint | Passed on current source | Legacy lint deliberately retained; no new rule disabled |
| SQL/RLS | Six passing embedded PostgreSQL tests, 14.47 seconds | Own-link controls and foreign/shared Knowledge shipment-link denials included; native Windows PostgreSQL lacks pgvector |
| Tenant HTTP | 72 checks pass | Own positive controls and foreign reads/writes, private file download, Verify history and legacy sessions; not all 194 routes |
| Rescue workflow HTTP | 36 additional native checks pass | Own case/action/decision/evidence controls; foreign parent/child writes denied; database unchanged; viewer/anonymous approval denials |
| Cyber workflow boundaries | 72 native checks pass | Also covers client/member links and vendor dependencies; own positive controls, foreign denials, authenticated database-role controls and unchanged records |
| SDK tenant boundaries | Eight actual HTTP/SSE checks pass | Anonymous denied, configured service ownership, member-scoped counts/updates, no organization override; four unit lifecycle regressions |
| Extension / import aliases | Nine extension plus 12 import HTTP checks pass | Exact configured origin plus membership; foreign context excluded; foreign confirmations denied and own reviewed import persists exactly once |
| Native roles/alerts/bursts | 24 checks pass | Four roles; alert ownership; 100 notifications, not 100 generated alerts; Verify 10x200/20x429 |
| Generated intelligence alerts | Four additional checks pass | Four concurrent actual reconciliations: 100 alerts / 100 assessments / 100 tasks, no duplicates, tenant-isolated; 1,691 ms |
| Browser matrix | 45 pass / 0 fail on final package | Chromium/Firefox/WebKit x 390/820/1920px; map, page exceptions, overflow, offline/reconnect; login additionally verified in Chromium; pre-fix cold timeout retained |
| Map acceptance | Nonblank land/ocean pixels plus drag changes | All nine browser/viewport combinations; bundled real static geography, external tiles deliberately blocked |
| One-hour soak | PASS: 3,601 seconds / 120 samples | Health, shipments, worker all 200; 5,000 imported, zero failed/pending; private memory stable about 146-148 MB after warmup |
| AI failures | 16 expanded real HTTP checks pass | Owned mock only; oversized/chunked bodies, full 120,083 ms post-header timeout, malformed/empty JSON, 503, delay, unreachable; shipments survive. Earlier 12-check artifact retained |
| AI status/transport regressions | 19 focused checks pass | Six failures before fix; metadata uses pinned transport, bounded local bodies, caller cancellation/deadline and safe errors |
| Login boundary regressions | 13 focused plus seven actual HTTP/browser checks pass | Six failures before fix; explicit foreign-origin denial, 8 KiB actual body cap, account/IP budgets, cooldown, usable session and successful Chromium form login |
| Knowledge scale | Six checks pass, 1,000 added files/documents/chunks | 1,001 records reachable over 11 pages without duplication; actual 390/1920px next-page controls, exact download and lexical retrieval; not extraction-throughput testing |
| Registered provider failures | 32 mocked cases pass | Eight adapters x error/garbage/empty/timeout, healthy source survives; no live provider load and no claim covering every legacy adapter |
| Replay / headers / demo timings | 17 checks pass | Explicit synthetic creation time, no internet, no page exceptions/overflow, private paths 404; cold Verify HTML 2,019 ms misses target; replay interactions 144-388 ms |
| Dependency audit | Production zero; development five high/three moderate | Fresh 15 October audit completed; proposed breaking tool downgrades not applied |
| Demo reset | Real workflow check passes | Fresh disposable organization, login, DXB-291, destination-port advisory match; no production database |
| Extractor safety | Ten bounded synthetic checks pass | Text/Office/PDF/image guards, network blocked; bundled parsers differ from deployment pins; no OCR/resource sandbox certification |
| Video | Re-recorded and inspected | H.264 1080p/30fps, 139.8 seconds, real UI-entered operator note, dedicated caption bands, synthetic labels and verified D: copy; see VIDEO_REVIEW.md and artifacts/video.json |

### Changes Since The Last Pushed Checkpoint

- Shared authenticated-route guard rejects explicit cross-origin mutations before
  authentication or writes. Own-origin/browser and CLI positive controls retained.
- Remote embeddings now use pinned transport too. Existing safeFetch re-checks and
  pins each redirect, removes credentials across origins and preserves HEAD behavior.
- All central MapLibre popup HTML passes through DOMPurify. Inline handlers were
  replaced with explicit event binding, preserving deep-dive actions without eval.
- New CSV prefix, embedding transport, popup DOM and authentication regressions.
- Disabled documented eager route preloading. Fresh generated standalone now serves
  health, authorized/unauthorized shipment requests, Verify and Atlas without a
  generated-file patch. Cold health is still 7.8 seconds, not a speed-budget pass.
- Real private-file scale, role/alert/burst, safe demo-reset and final video artifacts.
- Model-status now uses the pinned HTTP helper, rather than validating DNS then
  issuing an unpinned fetch. Local responses are bounded even with dishonest length
  headers; caller cancellation and deadlines remain active while reading the body.
  Safe setup/checksum messages remain useful without echoing raw runtime errors.
- Sign-in now rejects explicit foreign browser origins, bounds JSON before parsing
  and shares an account attempt budget across forwarded-IP/organization changes.
  The account key is hashed, and no password/session is written to test artifacts.
- Import compatibility aliases now share the main preview budget and bound actual
  JSON/multipart bytes before parsing or persistence. Five failing regressions
  before the fix now pass, as do 12 actual import tenant/confirmation checks.
- The extension context endpoint allows only explicitly configured extension IDs,
  plus an authenticated membership, through a read-only exception. The global
  mutation guard stays strict. Eight route tests and nine actual HTTP checks pass.
- Verify's shared error formatter, import job errors and notification delivery
  logs no longer expose arbitrary exceptions. Typed safe validation messages,
  including refusal of private-person claims, remain visible. Three disclosure
  regressions reproduced the problem before the fix.

Detailed test-to-surface mapping and remaining gaps: [SECURITY_COVERAGE.md](SECURITY_COVERAGE.md).

DOMPurify 3.4.17 is a production dependency (Apache-2.0 option of its dual licence);
jsdom 30.1.2 is test-only. The runtime is Node 24.19. No new live data provider,
paid subscription, production migration, deployment or active scan was introduced.

### Still Open

- Exhaustive endpoint/child-link/role review, Supabase runtime sessions, full log,
  malicious-PDF and provider-specific failure matrices are not certified.
- Per-process abuse budgets are not distributed cost quotas. Production CSP now
  forbids eval and blanket HTTPS script sources; inline hydration/styles remain.
  Media/connect/frame allowances are not a strict nonce-based policy.
- Document pagination is fixed and browser-tested; concurrent extraction/OCR
  throughput and arbitrary hostile-parser CPU/memory isolation are not certified.
- Generated intelligence-alert burst is now separately tested; neither test contacts
  a real dark-web provider, AI model or email service.
- 200-connection p95 is 3.90 seconds; cold-start/one-second interaction goals are not
  met merely because the prewarmed video looks smooth. Latest standalone cold health
  is 7.85 seconds, Verify HTML 787 ms and Atlas HTML 254 ms (not rendered timings).
- Fresh Windows standalone passes five HTTP and all 45 browser checks. No
  Linux/Render deployment validation was attempted.
- Forecast-cone/ETA-window matching, Last Safe Move, document 50-vs-48 comparison,
  GPS-interference and confirmation/reply stories were not fabricated. The updated
  video now includes a genuine decision note, independently read back through the API.
- Historical FIRMS credentials still require founder rotation; no history rewrite.
- The refreshed 139.8-second video is copied and SHA256-verified on D:, with prior
  copies preserved. The authoritative current digest and media probe are in
  artifacts/video.json; video-copy.json records the historical 143-second copy.
- Earlier audit attempts failed with registry ECONNRESET. A fresh later 15 October
  audit succeeded: zero production and eight development advisories.
- Concurrent build/test attempt hit a 10-second PGlite setup timeout and a Vitest
  worker-start failure. Re-running alone with one worker passes all 571 tests
  without weakening assertions or increasing timeouts. Parallel-run reliability
  remains a limitation on this laptop, not an application test success.
- After adding migration regressions, one complete run reported 575 passes and
  one authorization-test timeout during dynamic route import (190 seconds of
  transform time). All 110 protected-handler checks pass alone in 7.74 seconds.
  The fresh whole-suite rerun passes all 576 tests in 129.42 seconds. Earlier
  transform/worker failures are retained here rather than erased.

### Checkpoint Hygiene

Gitleaks scanned the final compiled browser assets (9.20 MB) and the nonempty
staged patch (119.36 KB), fully redacted, with no findings. An earlier staging
attempt was blocked by a stale lock and scanned zero bytes; that zero-byte result
was not counted. The empty worktree index lock dated the previous evening was
removed only after confirming its exact Git path, age and an idle window with no
Git processes. No Git packs, history, branches or user source changes were removed.

The model-transport checkpoint scanned 46.02 KB of staged changes without findings.
After the login changes, the fresh compiled browser assets were scanned again:
9.20 MB, no findings. A detached/interrupted build result was not assumed to pass;
a fresh production rebuild completed successfully before actual HTTP/browser checks.
No deployment, production setting or upstream Auth configuration was changed.
The login checkpoint also scanned 43.03 KB of staged changes, with no findings.

## Historical Checkpoints

The following entries preserve earlier failures and measurements. Stale phrases
such as "soak running", "video draft" and "map validation pending" describe those
earlier checkpoints, not the current verified results above.

Latest source checkpoint: **547 tests passed, seven opt-in tests skipped**, typecheck
and focused new-file lint pass. Real queued-import SQL failed during the first soak;
the executable PostgreSQL regression and corrected worker now pass. The restarted
hour is still running. The 127-second H.264 video has title/closing cards, synthetic
labels, and inspected title, weather-match and share frames. Final-source build and
browser/HTTP reruns remain required.

## Baseline

See BASELINE.md. TypeScript and production build passed; 311 tests passed, five skipped. Legacy lint: 428 errors and 86 warnings. Embedded PostgreSQL RLS: two tests passed. Native PostgreSQL unavailable because Docker Desktop fails on a stale/inaccessible local ingest socket; no factory reset or infrastructure changes attempted.

## Findings

| ID | Severity | Area | Description | Status | Test / Evidence |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | P1 | AI | Anonymous model generation can consume configured server credentials; five AI endpoints lack a session gate, Verify optional AI has the same boundary | Fixed; full suite and actual model-failure HTTP checks pass | src/lib/ai/access.test.ts: five failing tests before fix, 13 passing after; actual providers remain mocked |
| SEC-002 | P1 | Secrets | Historical FIRMS credentials in two commits | Open: rotation required | Gitleaks 8.30.1 scanned 314 commits; paths below, values never published |
| DEP-001 | P1 | Dependencies | npm audit baseline: two critical, nine high, one moderate advisories | Patched runtime dependencies; latest registry audit blocked; dev advisories open | Prior production audit zero; eight development advisories retained; fresh audit ECONNRESET, no forced downgrade |
| OPS-001 | P2 | Local test environment | Docker Linux daemon fails at startup | Mitigated for tests, Docker not repaired | Embedded PostgreSQL/RLS and native PostgreSQL 18 load/restart/soak now pass; no reset performed |
| SEC-003 | P1 | Authentication | Configured Supabase rejecting a token/membership could fall back to a legacy session cookie | Fixed; three regression tests pass | src/lib/auth/actor.test.ts: two failures reproduced before fix; legacy-only configuration still works |
| OPS-002 | P1 | Test runtime / packaging | Isolated packaged standalone health request times out; Next production CLI succeeds with the same fixture database/guard | Fixed by documented preload setting; cold-start speed budget still open | Five fresh generated-standalone HTTP checks pass; previous UI checkpoint 45 browser checks pass |
| APP-001 | P1 | Imports | Malformed UUID regex rejects canonical import IDs, blocking review, confirmation and error reports; route intelligence has the same defect | Fixed; full suite/build pass | src/app/api/imports/import-id.test.ts; src/lib/route-intelligence/validation.test.ts |
| SEC-004 | P1 | Map popup | An untrusted HTTP URL containing quotes can inject HTML attributes into popup links | Fixed; regression reproduced before fix | src/lib/map-popup-safety.test.ts: seven cases, including actual HTML attribute parsing |
| SEC-005 | P1 | Legacy scanner | Configured scanner permits anonymous GET-triggered live-host contact without owned-target approval or audit | Fixed; eighteen mock regression tests pass | src/app/api/scanner/route.test.ts; owner permission, confirmed POST, workspace allowlist, literal IP, pre-call audit, redirect rejection, credential redaction |
| SEC-006 | P2 | Import abuse | Changing forwarded IP resets the same authenticated user's import-preview budget | Fixed; failing test reproduced before fix | src/app/api/imports/preview/abuse.test.ts |
| SEC-007 | P1 | Upload resource limits | Multipart upload is fully parsed before the file parser enforces its byte cap | Fixed for import preview; other upload surfaces pending | src/lib/http/limited-form-data.test.ts; actual stream limit, missing/dishonest length, cancellation and unchanged valid CSV bytes |
| SEC-008 | P0 | Tenant child links | An organization can POST evidence linked to a different private case; the other organization then sees the foreign evidence in case detail | Fixed; reproduced with actual sequential HTTP before fix | STRESS_TEST/tenant-http.mjs: four failed assertions before, all 42 pass after; nine unit tests; additive migration 027 and service-bypass DB regression |
| APP-002 | P1 | Verify / AI behind proxy | Same-origin checks reject legitimate requests when Next constructs an internal localhost URL | Fixed; positive HTTP replay controls now return PARTLY TRUE / CONFIRMED | request-origin.test.ts; verify-replay.mjs; shared guard trusts only request origin and administrator APP_URL |
| PERF-001 | P1 | Large shipment lists | Unbounded 10,000-record shipment API causes slow responses and load timeouts | Bounded pages, server filters and continuation controls added; zero load errors after fix | shipment-page.test.ts; load-native-before-fix.json versus load.json; paged retrieval retained for rescue/command consumers |
| SEC-009 | P1 | AI error disclosure | Raw provider failures can echo a credential in the response; Gemini failures also log raw exception data | Fixed; failure reproduced before fix | api/ai/generate/failure.test.ts; nine HTTP mock-model failure/isolation checks |
| UX-001 | P2 | Source status | Configured providers labelled online without a fetch-health check | Fixed wording to configured | LogisticsTopBar.tsx; provider catalog uses enabled/configured, not observed health |
| APP-003 | P1 | Background imports | UPDATE/FROM refers to the jobs alias inside an inaccessible JOIN condition; every queued import worker call fails | Fixed; executable SQL tests and real worker pass | jobs.test.ts; first failed soak retained; restarted import completes all 5,000 rows |
| SEC-010 | P1 | SSRF | Uncompressed reserved IPv6 and a second DNS lookup can bypass address checks for remote AI/extractor requests | Fixed; literal/DNS/pinned-lookup regressions pass | ssrf-guard.test.ts; pinned-public-fetch.test.ts; existing safeFetch callers now pin each redirect hop |
| SEC-011 | P1 | Webhook forwarding | Signed forwarding request has no timeout, byte cap or redirect/address restriction and logs raw failures | Fixed; seven mocked regressions pass | github-webhook/route.test.ts; bounded signed body, HTTPS-only pinned destination, no credential-bearing logs |
| APP-004 | P1 | Provider failure | A provider ignoring AbortSignal can hang the whole event ingestion batch | Fixed; mixed healthy/empty/malformed/hung-source regression passes | event-provider-registry.test.ts; enforced deadline and sanitized error diagnostics |
| MAP-001 | P1 | Map availability | Failure to load external basemap leaves initialization/overlays unavailable | Fixed; nonblank land/ocean pixels and drag changes at nine browser/viewport combinations | offline-basemap.test.ts; browser-matrix.json; Natural Earth country geometry, original online style retained |
| SEC-012 | P1 | Cross-origin writes | Shared authenticated endpoints did not consistently reject an explicit foreign Origin | Fixed on shared guard; four actual browser controls and eight auth tests pass | auth/actor.test.ts; artifacts/browser-security.json; own-origin POST remains 201 |
| SEC-013 | P1 | Raw feed popup HTML | String-built feed popup could retain executable markup beyond the previously fixed URL attribute case | Fixed at central DOMPurify boundary; seven DOM/action regressions | map-popup-html.test.ts; scripts/events/unsafe links removed, explicit deep-dive click retained |
| SEC-014 | P1 | Local AI status/transport | Model-status used plain fetch after validation and returned raw errors; explicitly allowlisted model responses ignored byte caps and caller cancellation | Fixed; six mocked pre-fix failures, 19 focused checks pass | local-model.test.ts; openai-compatible-provider.test.ts; full suite 592 pass; 16 actual loopback HTTP checks in ai-failure-bounded.json. No live SSRF attack or provider contact |
| SEC-015 | P1 | Sign-in abuse / browser origin | Forwarded-IP rotation bypassed sign-in budget; explicit cross-site attempts reached credential verification; oversized JSON unbounded and null JSON threw | Fixed; six pre-fix failures, 13 focused checks, full suite/build and seven actual HTTP/browser checks pass | api/auth/login/route.test.ts; login-security.json; account key hashes normalized email, excludes organization slug; IP budget retained. Per-process, not distributed |
| SEC-016 | P1 | Knowledge AI / error boundary | Knowledge Q&A bypassed the shared user budget with rotated forwarded IPs; source-only search still invoked embeddings; unknown failures echoed raw exception messages | Fixed; six focused checks, full suite, build and real lexical-search flow pass | api/knowledge/security.test.ts; known safe validation errors retained; unsupported model answers fail grounding and keep source access |
| SEC-017 | P1 | Resend webhook | Unsigned, modified and expired events could be stored and disable email subscriptions | Fixed; eight tests pass, including duplicate and connection failures | webhooks/resend/route.test.ts; existing SDK verifies raw bytes before atomic writes. RESEND_WEBHOOK_SECRET required; no real mail sent |
| SEC-018 | P0 | SDK tenant isolation | Anonymous/global SDK stream exposed all ingested entities and counts; disconnect retained timers | Fixed; four unit and eight actual two-tenant HTTP/SSE checks pass | api/sdk/security.test.ts; sdk-tenants.json; backend-configured owner, scoped reads and cancel/abort cleanup |
| SEC-019 | P1 | Bootstrap integrity | A thrown automatic sign-in after commit deleted the newly committed owner; null/unbounded setup bodies and connection errors escaped | Fixed; five failing regressions before fix now pass | auth/bootstrap/security.test.ts; no account deletion after commit, 32 KiB cap, origin gate, safe service errors |
| SEC-020 | P1 | API diagnostics | Generic exception responses and dynamic console payloads could disclose provider credentials, paths or personal data | Fixed on reviewed API surfaces; regression and AST audits pass | 60 console calls reviewed, 53 dynamic payloads removed; 64 generic raw-error branches removed; typed Shodan guidance retained. Dependency logs not certified |
| APP-006 | P1 | Cyber inventory creation | Missing environment defaults to unknown, rejected by the existing database constraint | Fixed; two actual HTTP failures before, all 72 cyber checks after | Three new validation regressions; missing environment uses other, invalid explicit values rejected; database constraints unchanged |
| APP-007 | P2 | Document access | Hard 500-row list cap made later records unreachable | Fixed; all 1,001 records reached, mobile/desktop pagination verified | documents-page.test.ts; knowledge-scale-paginated.json; stale range-label browser failure reproduced and fixed |
| SEC-021 | P1 | Import compatibility aliases | Legacy JSON and platform multipart preview routes bypassed the main uploader's user budget and transport byte cap | Fixed; five pre-fix failures, full suite/build and 12 import HTTP checks pass | aliases.test.ts; shared imports/intake.ts; actual body bounded before parse, cross-alias/rotated-IP budget retained |
| APP-008 | P2 | Extension context | CORS permitted a configured extension but the global mutation guard rejected its authenticated read-only request | Fixed; eight route and nine actual HTTP checks pass | Exact ID/origin validation, membership and scoped reads; no broad mutation exception, no anonymous access |
| APP-005 | P1 | Vessel identifiers | Legacy SQL double-escaped digit classes, rejecting seven-digit IMO and nine-digit MMSI values on shipments/routes | Corrective migration 028; five executable SQL regressions pass | Actual native HTTP POST failed before fix; vessel-identifiers.test.ts proves legacy rejection, corrected writes, malformed rejection, retained rows and RLS |
| DEMO-001 | P2 | Reset fixture | Demo reset used originPort/destinationPort instead of the persisted Name fields, silently omitting names | Fixed and verified | demo:reset -- --check now asserts both returned names and stores a genuine operator note |

P0 findings confirmed so far: two, both fixed in this branch. Exhaustive tenant
isolation is still pending; the recorded route/role and HTTP matrices are not a
formal certification of every possible endpoint, role, input and deployment.

## Secret Scan

Downloaded the official Gitleaks 8.30.1 Windows release and verified its archive SHA256 against the release checksums. Scanned all reachable Git history with full redaction and the staged source changes separately.

- Current staged changes: no leaks found.
- Historical candidate: src/app/api/fires/route.ts:42, commit 3ef1a226; FIRMS credential masked. Rotate/revoke the old NASA FIRMS key.
- Historical candidate: src/app/api/fires/route.ts:12, commit c1a11878; FIRMS credential masked. Rotate/revoke the old NASA FIRMS key.
- Third scanner candidate: Dockerfile.voidaccess-render:5, commit 4180cd07; ARG VOIDACCESS_REF is a source revision, not an API credential. Keep as a documented false positive; no broad scanner rule suppressed.
- No history rewrite performed. A rewrite would require separate founder approval and would not substitute for rotating exposed credentials.

## Security Coverage

AI guards now check login before parsing credentials or calling a model, reject explicit cross-site requests, and apply a shared per-user request budget across routes and addresses. Anonymous rule-based Verify remains available. Tests use mocked models, never live provider credentials. The limiter is currently per-process; multi-instance/distributed cost limits remain to assess.

The route inventory is static, not an authorization test result. Database-backed tenant attacks, role/session tests, SSRF pinning review and browser leakage checks are not finished.

Additional checkpoint: all 37 migrations applied in disposable embedded PostgreSQL; a loopback-only socket and synthetic demo organization were verified. The new raw-SQL core tenant test passed, but Knowledge and Verify hit their 30-second timeouts in a combined run and are being rerun. Do not treat this as native PostgreSQL concurrency or exhaustive HTTP tenant coverage.

The production build passes with Next 16.3.8, Sharp 0.35.5 and MapLibre 6.14.0. A version-checked worker-URL loader avoids Turbopack's dynamic asset-resolution failure; matching local worker assets preserve BSD-3-Clause attribution. Browser validation remains pending. Production-only npm audit reports zero vulnerabilities; full dev dependency audit still needs reconciliation.

Updated checks: 332 unit tests pass, six skip without a database. Expanded embedded RLS: three files/five tests pass in 22.71 seconds. Database construction now runs in a 120-second setup hook, not the 30-second isolation-assertion budget. Two previous runs exceeded the combined 30-second setup/assertion limit; these failures are not erased. Focused new-file lint passes; modified legacy files preserve their baseline lint counts.

Full dependency audit now reports zero critical, five high and three moderate (development tools). Production-only audit is clean. The remaining high chain is ESLint's glob-pattern tooling; npm proposes an incompatible downgrade to Next 14 tooling, which was not forced. Native browser rendering of MapLibre is still an acceptance gate.

Local smoke: health, anonymous shipment access rejection and authenticated synthetic demo shipment response pass. Chromium Verify screenshots at 1920x1080 and 390px have been inspected; no page exceptions or horizontal overflow. External browser requests were blocked, and server fetch/socket/DNS isolation tests pass. This is not the full Chromium/Firefox/WebKit matrix, offline demo acceptance or load testing. Packaged standalone health remains an open test failure.

Git recovery: OneDrive failed to read a reverse-index pack file. A branch push succeeded with optional multi-pack/reverse-index reads disabled for that command only. No files were removed, no repository was reset and no history was rewritten.

## Performance / Failure / Demo

## Latest Measured Checkpoint

- Full suite: 507 passed, seven opt-in tests skipped; TypeScript and production build pass. Focused changed-file lint passes. Existing legacy lint was not refactored.
- Embedded SQL/RLS: six tests pass. Native PostgreSQL 18 is now available using a pinned development-only embedded-postgres runtime, not an installed production service. Its Windows binaries lack pgvector; Knowledge still uses the embedded pgvector test engine and is not included in native concurrency certification.
- Large-data load: 10,000 synthetic shipments and 100,000 synthetic events. At 50 connections: 1,719 responses in 15.12s, p50 49.38ms, p95 1,443.45ms, zero errors/timeouts/non-2xx. At 200: 2,339 responses in 15.25s, p50 44.88ms, p95 3,896.68ms, zero errors/timeouts/non-2xx. These are mixed HTML/data endpoint workloads, not 200 concurrent rendered browsers. Latency budgets are not yet met.
- Original native run: 31 timeouts at 50 connections and 20 at 200, p95 6,821ms/9,068ms. That run also included a legacy redirect; retained as failed evidence, not a perfectly controlled latency comparison. The corrected workload and bounded data API have no redirects/errors.
- Twenty concurrent 5,000-row CSV previews: all 20 return 200, exactly 100,000 import rows persisted, zero shipments created before confirmation. Individual previews take roughly 15 seconds; the review gate remains intact. Full background processing is exercised separately by soak.
- Crash/restart: observed a real active import transaction, stopped the owned native database immediately, recovered it, verified zero imports/rows left from the interrupted transaction, then successfully retried all 5,000 rows. Artifact restart.json passes.
- Browsers: 45 checks pass across Chromium/Firefox/WebKit at 390/820/1920px, including offline error and recovery. Firefox's original cache failed Windows side-by-side activation; a fresh isolated download works. Basemap assets are blocked by isolation; canvas presence is NOT proof of a nonblank globe. Offline/map asset acceptance remains open.
- AI failure: nine HTTP checks pass using an owned loopback mock, including invalid JSON, empty result, 503, 1.2-second delay and unreachable model; deterministic shipments remain usable. This is not a complete 120-second timeout/SSRF-rebinding assessment.
- Demo recording: H.264, 1920x1080, approximately 121 seconds, burned-in captions and persistent synthetic label. Excel import, DXB-291 details, real destination-port weather matching, Verify evidence, shared result and history are recorded. Sample opening/evidence frames inspected; no blank opening, no secrets or real people. Copies are at STRESS_TEST/video/Ophanim-Demo-2026-10.mp4 and D:/OPHANIM/Documentation/Ophanim-Demo-2026-10.mp4. First draft's long blank opening/oversized captions were rejected. This is a working draft, not complete competition acceptance; forecast-window/cone, document discrepancy, Gulf signal, confirmation and decision-log scenes are not claimed.
- One-hour real background-import soak: running, not yet counted as passed. Other remaining security/tenant/asset/scale acceptance work is still open. No final PR or finished=true until required work is genuinely complete.

Expanded HTTP checkpoint: 72 checks pass against the production CLI and disposable SQL database. Added positive controls for private knowledge-document content and file downloads, foreign document reads/downloads/deletion, scoped Knowledge/Verify lists, foreign Verify recheck/share requests, legacy session expiration/revocation, viewer read plus mutation/admin denials, forged workspace cookie and token reuse after logout. Private files contain synthetic markers only under ignored runtime/, never public/. These additions change test fixtures/launcher only; previous production source checks remain 488 passed/seven skipped, six embedded RLS assertions and build pass. Focused script lint passes. Complete manager/analyst, Supabase-runtime, alerts and other file/child-link coverage is not claimed.

Latest tenant checkpoint: 488 unit tests pass, seven opt-in tests skip; six embedded database/RLS tests pass. TypeScript (including production build) and focused lint pass. An actual local HTTP test seeded two synthetic owner organizations and checked positive controls, foreign shipments/imports/entities/cases, scoped event/evidence lists, import confirmation, shipment updates/deletes and evidence child-link injection. The initial core matrix passed 38 checks, then the added child-link attack produced four failures (POST 201 and foreign marker visible in both directions). After the fix all 42 pass. The failing artifact is retained as tenant-http-before-fix.json; final results are tenant-http.json. No production/provider traffic or real customer data was used.

Migration 027_platform_child_tenant_guards.sql adds evidence-target and workflow-template ownership triggers; existing tables/RLS are retained and no production migration was run. Service-bypass insert/update tests fail closed with SQLSTATE 42501. Application checks validate links before writes, restrict workflow templates/assignees, and scope case child reads to the owning organization (or explicitly global entities/events). Existing inconsistent rows are not deleted; read guards exclude foreign private child data. Native PostgreSQL, complete HTTP Knowledge/Verify/alerts/files coverage and other child-link surfaces remain to test.

Latest source checkpoint: 454 tests pass, six skip; production build passes on Next 16.3.8. A sweep of 108 protected handler methods rejects anonymous mocked principals before any provider fetch. This is not an exhaustive HTTP session/role or tenant matrix. Import UUID regressions and popup attribute injection were reproduced before fixes. Focused new-file lint passes; modified legacy lint counts remain unchanged. The disruption-map route now returns 401, rather than 400, for missing authentication.

Scanner/import follow-up: 23 focused tests pass. Scanner submissions now require owner permission, explicit confirmation, one approved literal public IP and a successful audit insert before backend contact. GET cannot scan. Provider redirects are rejected; raw credential-bearing failures are hidden. A backend DNS-pinning contract is required before re-enabling hostname targets. No real active scans were performed. Import previews now share one per-user budget and cap the actual request stream before multipart parsing. Full suite: 479 passed, six skipped; TypeScript and production build pass. Focused route/helper/test lint passes. OsintPanel lint baseline remains 27 errors and seven warnings, unchanged by the focused UI wiring.

The earlier checkpoints above are chronological, not the final status. Measured load and a recorded draft video now exist. No real customer/personal data or external-provider load traffic was used; no production deployment, infrastructure or billing was changed.

## Founder Actions

1. Rotate/revoke any old FIRMS keys corresponding to the historical locations above.
2. Do not merge this branch as competition-ready until the remaining acceptance work and final checks are complete.
3. Enable the scheduled resume manually only using RESUME_SETUP.md; no scheduled task was registered by the agent.
4. Before enabling optional ingestion/webhooks, configure SDK_INGEST_ORGANIZATION_ID
   with SDK_INGEST_KEY and configure RESEND_WEBHOOK_SECRET. Unconfigured services
   fail closed. No production configuration was changed by these tests.
5. Configure explicit OPHANIM_EXTENSION_IDS when using the optional extension,
   including development. A real installed-extension browser session has not
   been certified by the loopback HTTP tests.

## Handoff Status

The verified fixes, source checks, measured load/failure evidence and refreshed
video are delivered on stress-test/competition. Remaining full endpoint/role/
parent-link permutations, live Supabase session behavior, legacy provider URL/
failure coverage and speed goals are explicitly unfinished in state.json.
Any review PR must remain draft until those gates are resolved or the founder
explicitly narrows the acceptance scope. No overall completion or production
readiness claim is made merely because the local regression suite passes.

## Vessel Constraint Correction

`028_vessel_identifier_constraints.sql` is a new forward migration, not an edit
of applied history. It replaces four broken checks on existing shipment/route
columns with explicit ASCII digit classes. No table, row, column or RLS policy is
removed. Checks are NOT VALID to avoid scanning or rewriting historical rows;
new writes are checked. Operators should review any historical malformed IDs
before separately validating the constraints. No production migration was run.
The SQL semantics were checked against the [PostgreSQL pattern-matching documentation](https://www.postgresql.org/docs/current/functions-matching.html).
The Supabase Markdown changelog could not be fetched by the documentation tool;
this change uses ordinary PostgreSQL constraints, not a changed Supabase API.

## Bundled Map Source

Natural Earth 1:110m country geometry was downloaded from the project's dataset,
not World Monitor. It is a low-detail static fallback, not current/live intelligence.
Licence: public domain; commercial use: yes; credentials: none; runtime upstream
rate limit: not applicable (bundled snapshot). Attribution: Made with Natural Earth.
Source metadata is exported in src/lib/offline-basemap.ts. [Official terms](https://www.naturalearthdata.com/about/terms-of-use/).

## Advisory Sources

- [Next.js image SSRF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4)
- [Sharp bundled-image-library advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)
- [MapLibre attribution sanitizer advisory](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579)
