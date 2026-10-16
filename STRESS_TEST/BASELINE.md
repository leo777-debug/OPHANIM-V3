# Baseline (13 October 2026)

Isolated checkout: stress-test/competition, foundation merge 2e23c90 plus preserved Shodan/freshness source changes. No production environment file copied.

| Check | Command | Result |
| --- | --- | --- |
| Dependencies | npm ci --ignore-scripts --no-audit --no-fund | 542 packages installed |
| TypeScript | npx tsc --noEmit | Pass |
| Tests | npm test | 68 files passed, 1 skipped; 311 tests passed, 5 skipped; 33.78 seconds |
| Production build | npm run build | Pass; compile 72 seconds, TypeScript 52 seconds; no provider credentials |
| Full legacy lint | npx eslint . --format json --output-file STRESS_TEST/lint-baseline.json | Exit 1; 428 errors, 86 warnings across 573 files |
| Isolated RLS | node db/test-isolated-rls.mjs | 2 tests passed, 13.25 seconds; embedded PostgreSQL, not a concurrent server |
| Running local PostgreSQL | docker info | Not available: Docker Linux pipe missing; continue without treating unavailable coverage as passing |
| Resume helper | powershell -NoProfile -File STRESS_TEST/resume.ps1 -CheckOnly | Pass; no Codex process or scheduled task created |
| Route inventory | node STRESS_TEST/inventory.mjs | 194 pages/routes; static markers only |

Five skipped tests are not counted as passing. A clean build does not prove browser, tenant, load or demo readiness. Full legacy lint is not a release gate for this task; focused changed-file lint is.
