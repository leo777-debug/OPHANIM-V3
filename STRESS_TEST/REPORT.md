# Stress Test Report (In Progress)

**Not competition-ready yet.** This is a checkpoint, not a final certification. Full tenant/API, browser, load, chaos, demo and video acceptance work remains.

## Baseline

See BASELINE.md. TypeScript and production build passed; 311 tests passed, five skipped. Legacy lint: 428 errors and 86 warnings. Embedded PostgreSQL RLS: two tests passed. Native PostgreSQL unavailable because Docker Desktop fails on a stale/inaccessible local ingest socket; no factory reset or infrastructure changes attempted.

## Findings

| ID | Severity | Area | Description | Status | Test / Evidence |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | P1 | AI | Anonymous model generation can consume configured server credentials; five AI endpoints lack a session gate, Verify optional AI has the same boundary | Fixed in working tree; validation in progress | src/lib/ai/access.test.ts: five failing tests before fix, 13 passing after; plus four existing Verify HTTP tests |
| SEC-002 | P1 | Secrets | Historical FIRMS credentials in two commits | Open: rotation required | Gitleaks 8.30.1 scanned 314 commits; paths below, values never published |
| DEP-001 | P1 | Dependencies | npm audit baseline: two critical, nine high, one moderate advisories | Patch upgrades and MapLibre security update under validation | audit baseline; final audit pending |
| OPS-001 | P2 | Local test environment | Docker Linux daemon fails at startup | Open; embedded PostgreSQL fallback being prepared | Docker startup log: inaccessible sailor-ingest.sock; no reset performed |
| SEC-003 | P1 | Authentication | Configured Supabase rejecting a token/membership could fall back to a legacy session cookie | Fixed; three regression tests pass | src/lib/auth/actor.test.ts: two failures reproduced before fix; legacy-only configuration still works |
| OPS-002 | P1 | Test runtime / packaging | Isolated packaged standalone health request times out; Next production CLI succeeds with the same fixture database/guard | Open; root cause unconfirmed | node STRESS_TEST/smoke.mjs --standalone vs node STRESS_TEST/smoke.mjs |
| APP-001 | P1 | Imports | Malformed UUID regex rejects canonical import IDs, blocking review, confirmation and error reports; route intelligence has the same defect | Fixed; full suite/build pass | src/app/api/imports/import-id.test.ts; src/lib/route-intelligence/validation.test.ts |
| SEC-004 | P1 | Map popup | An untrusted HTTP URL containing quotes can inject HTML attributes into popup links | Fixed; regression reproduced before fix | src/lib/map-popup-safety.test.ts: seven cases, including actual HTML attribute parsing |

P0 findings confirmed so far: none. This does not mean tenant isolation has passed; exhaustive coverage is pending.

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

Latest source checkpoint: 454 tests pass, six skip; production build passes on Next 16.3.8. A sweep of 108 protected handler methods rejects anonymous mocked principals before any provider fetch. This is not an exhaustive HTTP session/role or tenant matrix. Import UUID regressions and popup attribute injection were reproduced before fixes. Focused new-file lint passes; modified legacy lint counts remain unchanged. The disruption-map route now returns 401, rather than 400, for missing authentication.

Not measured yet. No load traffic sent to any provider. No demo video recorded yet. No real customer or personal data used. No production deploy, infrastructure or billing change performed.

## Founder Actions

1. Rotate/revoke any old FIRMS keys corresponding to the historical locations above.
2. Do not merge this branch as competition-ready until the remaining acceptance work and final checks are complete.
3. Enable the scheduled resume manually only using RESUME_SETUP.md; no scheduled task was registered by the agent.

## Advisory Sources

- [Next.js image SSRF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4)
- [Sharp bundled-image-library advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)
- [MapLibre attribution sanitizer advisory](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579)
