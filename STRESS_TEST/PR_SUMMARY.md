## Status

Draft. No merge or deployment. Real Supabase Auth remains blocked by the local
Docker Desktop failure, not passed through mocks. Detailed report and resumable
state are committed under STRESS_TEST/.

## 16 October Results

- 932 tests passed, 12 opt-in skips; six additional SQL/RLS tests pass.
- Production build and TypeScript pass; focused lint adds no findings.
- All 187 exported API methods inventoried and checked through actual HTTP.
- 224 two-way member-handler probes pass; foreign-row digests across 60 tables
  remain unchanged. Seeded core IDs and optional missing IDs are distinguished.
- 140 legacy-provider failure cases across 35 routes, plus 32 registry cases.
  Missing deadlines, cancellation and unsafe upstream errors fixed. Missing
  geomagnetic observations show Unknown, not Quiet/zero.
- Session checks require a current auth.sessions row belonging to the signed
  subject and fresh membership. PostgreSQL expiry/revocation tests pass.
- Native 10k-shipment/100k-event load p95: 242ms at 50 connections, 927ms at 200,
  zero errors/timeouts; historical p95 was 1443/3897ms. Identical reads share
  in-flight work only, never authorization or completed results.
- Three independent local demo launches pass all 33 timing and 51 functional
  checks. First HTTP 1758/357/345ms; replay interactions <=258ms. OS cache not
  flushed; the earlier contended timing failure is retained.
- Redacted Gitleaks clean: staged 259.66KB and client assets 9.20MB.

Existing delivered work includes isolation fixes, bounded imports, signed
webhooks, scoped SDK streams, safer model transport, labelled replay, 45 browser/
layout/map checks and the inspected 139.8-second 1080p demo video.

## Still Open

Five real local Supabase lifecycle tests need a working disposable Auth service.
Docker's sailor-ingest.sock is inaccessible; no factory reset or WSL deletion was
performed. Remaining valid-payload/role/child-link permutations, hostile-parser
worker isolation, distributed quotas and founder credential rotation are not
certified by the targeted passes. No real provider load, active scan, production
credential or customer data was used.

See [REPORT.md](https://github.com/leo777-debug/OPHANIM-V3/blob/stress-test/competition/STRESS_TEST/REPORT.md),
[SECURITY_COVERAGE.md](https://github.com/leo777-debug/OPHANIM-V3/blob/stress-test/competition/STRESS_TEST/SECURITY_COVERAGE.md)
and [LIVE_SUPABASE.md](https://github.com/leo777-debug/OPHANIM-V3/blob/stress-test/competition/STRESS_TEST/LIVE_SUPABASE.md).
