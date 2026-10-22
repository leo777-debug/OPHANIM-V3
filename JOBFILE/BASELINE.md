# Baseline before Job File work

Commit `2a2b72e` (parity-and-reliability), fresh worktree, `npm ci`, 2026-10-21.

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | passed |
| Tests | `npx vitest run` | 133 files passed, 1 skipped; 599 tests passed, 5 skipped |
| Lint | `npx eslint` | **failed before any change**: 461 problems (395 errors, 66 warnings) in 96 files, listed in `baseline-lint-files.txt` |
| Build | `npm run build` (Next 16.4.2, webpack) | passed; 118 static pages generated |

## After the Job File phases (commit 47214ed + finish)

| Check | Result |
| --- | --- |
| Typecheck | passed |
| Tests | 148 files passed, 1 skipped; **655 passed**, 5 skipped (baseline 599) — 56 new job-file tests, all existing tests still pass |
| Lint | 461 problems (395 errors, 66 warnings) — **identical to baseline**; no new files with problems; all job-file files lint clean |
| Build | passed (Next 16.4.2, webpack) |
| Browser (demo mode) | /jobs, /jobs/[id] EN + AR/RTL, crop view, ghost, receipts, Paper Desk checked |

Pre-existing lint failures are not counted as Job File regressions. New and
touched Job File files must lint clean, and the baseline count must not grow.
