# Ophanim: Stress Test, Fix and Competition-Ready Prompt

For Codex. Prepared 13 Oct 2026. The competition is on 17 Oct 2026. Code freeze: end of 16 Oct.

## 0. Your mission

You are working on OPHANIM-V3 (https://github.com/leo777-debug/OPHANIM-V3). It is a Next.js 16 / React 19 / TypeScript app with PostgreSQL, organization-scoped data with row-level security (RLS), imports, intelligence providers, a map, AI with local/OpenAI-compatible models, and (if already built) Ophanim Verify and the RAG/knowledge features.

Your job:

- Stress-test Ophanim. Find bugs, crashes, slow parts, data leaks, security holes and anything that would embarrass us during a live demo.
- Fix them, most important first.
- Make it competition- and presentation-ready.
- Record a short, detailed demo video at the end.
- Work so that you can stop at any moment (for example when credits run out) and continue exactly where you left off next time.

## 1. Resume system (read this first, every time you start)

You may be stopped at any point. Everything must be resumable.

### 1.1 The progress file

Keep all progress in STRESS_TEST/PROGRESS.md plus a machine-readable STRESS_TEST/state.json, both committed to the branch.
state.json holds:

- current_phase
- current_task
- the status of each task (todo / doing / done / blocked)
- the last commit hash
- started_at, updated_at
- finished: true/false

PROGRESS.md is the human-readable version: a checklist, findings so far, what is next.

### 1.2 Start-up routine (do this every session)

git fetch and check out the branch stress-test/competition. Create it from the default branch if it doesn't exist. Never work on or push to main/master or the default branch directly.
If STRESS_TEST/state.json exists, read it and PROGRESS.md. Continue from the first task that is not done.
A task marked doing was interrupted: check its partial work (git status, git diff), then finish or redo it.
If it doesn't exist, create it with the full task list from sections 3-7, then start at Phase 1.
If finished is true, print the final summary and stop. Do nothing else.

### 1.3 Working rhythm

Small tasks, each finishable in a short time.
After every task:

- update state.json and PROGRESS.md
- run the relevant tests
- commit with a clear message, e.g. stress-test: fix tenant leak in /api/imports

Never leave the repo broken between commits. If a fix is half-done when you must stop, commit it behind a clearly named work-in-progress commit and mark the task doing with notes.
Push the branch (stress-test/competition only) after each phase, so progress survives on GitHub.

### 1.4 Automatic resume when credits come back

Build a small resume helper the founder can switch on.

STRESS_TEST/resume.ps1 (Windows PowerShell):

- checks state.json
- if finished is false, runs the Codex CLI in non-interactive mode (codex exec) with the resume prompt in section 9, inside the repo folder, on the stress-test/competition branch, with workspace-write permissions only (no full-access mode)
- writes a log to STRESS_TEST/logs/<date-time>.log
- if it fails (for example no credits), it just logs the failure and exits; the next scheduled run tries again

STRESS_TEST/RESUME_SETUP.md: step-by-step instructions to register resume.ps1 in Windows Task Scheduler to run every 2 hours, and how to turn it off.
Do not register the scheduled task yourself. The founder does this manually.
Write the resume prompt to STRESS_TEST/RESUME_PROMPT.txt.

## 2. Rules (non-negotiable)

### Safety and legality

Only test Ophanim itself, running locally or on a test deployment the founder owns. Never load-test, scan or attack third-party services: data providers, World Monitor, carrier or airline sites, Supabase, Render, Vercel or anyone else.
For load tests, mock all external providers (recorded fixtures). Load tests must never send traffic to real external APIs.
No real customer data or real personal data in tests, fixtures, screenshots or the video. Use the labelled demo organization.

### Secrets

Never print, log, commit or show secrets in reports, screenshots or the video.
If you find a secret in the code or git history:

- report its location (masked) and recommend rotating it
- do not rewrite git history without the founder's approval

### Code

Migrations are additive only. Every organization-owned table keeps RLS.
Don't delete features to make tests pass. Fix them, or hide them behind configuration and report it.
No deploys. Don't change production infrastructure. Don't touch billing.
Priorities: fix P0 and P1 issues; list P2/P3 issues in the report unless they're quick and safe.
After 16 Oct (code freeze): only P0 fixes, demo polish and the video.

## 3. Phase 1: baseline and map of the app

Install and baseline. Install dependencies and record a baseline:

- typecheck (npx tsc --noEmit)
- tests (npm test)
- lint, focused on changed files; the repo has old lint errors, so record the count but don't fix them all
- production build (npm run build)
- RLS tests if a database is available; if not, record "not available" and continue, and don't stop

Start the app locally with a local PostgreSQL (Docker is fine) and the labelled demo organization seeded.
Write STRESS_TEST/APP_MAP.md: every page, every API route, which routes need login, which are public, which call external providers, and which use AI.

## 4. Phase 2: security and data-leak testing

For each item, write a test that proves the problem (or proves it's safe), then fix it. Record every finding with: severity, location, how to reproduce, the fix, and the test that proves the fix.

Tenant isolation: create organizations A and B. As a user of A, try to read, change or delete B's shipments, imports, events, cases, evidence, alerts, files, knowledge documents and Verify history, through every API route, including by guessing or changing IDs in URLs and request bodies. Any cross-tenant access is P0.

Authentication and permissions:

- every protected route rejects requests without a login
- role checks work (for example a viewer can't change admin settings)
- sessions expire and log out properly
- the old/legacy session paths don't bypass the newer auth

Secrets and leaks:

- Code and git history: scan for API keys, passwords and tokens (use a standard secret scanner).
- Browser: check that no secret reaches the browser. Look at NEXT_PUBLIC_ variables, client bundles, API responses and error messages.
- Logs: check logs don't contain secrets or personal data.

Injection and input safety:

- SQL injection: every query must use parameters
- cross-site scripting (XSS) in any field that displays user or feed content (news titles, imported spreadsheet cells, document text, AI output)
- spreadsheet formula injection in CSV exports
- path traversal in file uploads and downloads
- malicious files: huge files, zip bombs, wrong file types renamed, broken PDFs and Excel files
- Server-side request forgery (SSRF): any feature that fetches a URL (Verify link checking, webhooks, providers, AI base URL) must block private, loopback and link-local addresses, including after DNS lookups and redirects.

AI and prompt injection: documents, news or claims containing instructions ("ignore previous instructions...") must not change Ophanim's behaviour or leak the system prompt, other tenants' data or secrets.

Rate limits and abuse:

- login, Verify, imports and AI endpoints have rate limits
- a single user can't run up unlimited AI or provider costs

Security headers and settings: content security policy, cookie flags (Secure, HttpOnly, SameSite), CORS limited to what's needed, and no debug pages exposed in production mode.

Dependencies: run npm audit (or similar). Fix critical/high issues where an update is safe; report the rest.

## 5. Phase 3: stress, load and failure testing

Load test the app locally with a standard load-testing tool and all providers mocked. Scenarios:

- 50 and then 200 simultaneous users browsing the dashboard, map and shipment pages
- 20 simultaneous imports of a 5,000-row spreadsheet
- bursts of Verify checks
- many alerts being created at once

Record response times (median and 95th percentile), error rates and memory use. Find and fix the slowest parts: missing database indexes, repeated queries, huge responses, no caching.

Large data: 10,000 shipments, 100,000 events and 1,000 documents in the demo organization. Pages must stay usable. Use pagination and limits.

Failure tests (chaos):

- External providers: each provider times out, returns errors, returns garbage, or returns an empty list. Other providers and pages must keep working.
- AI: AI model unreachable; very slow; returns broken JSON. Deterministic features must still work, and the screen must say "AI unavailable".
- Database: restarts during an import. No half-imported or corrupted data.
- Network: the browser goes offline and comes back.
- Long-running stability: run the app with background jobs for at least 1 hour (or as long as possible) and watch for memory leaks, stuck jobs and growing queues.
- Mobile and browsers: the main screens on a 390 px mobile view, a tablet view and a desktop view, in Chromium, Firefox and WebKit (Playwright). No broken layouts, no horizontal scrolling and no blank map areas.

## 6. Phase 4: competition and presentation readiness

Demo mode:

- one command seeds a clean, clearly labelled demo organization: npm run demo:reset
- include the DXB-291 story (Jebel Ali -> Mumbai/Nhava Sheva, a severe-weather warning overlapping the arrival window), a document mistake (invoice 50 boxes vs packing list 48), a Gulf GPS-interference / vessel-signal example, an "Ask to confirm" example and a decision-log entry, only for features that actually exist in the code
- never fake a feature that isn't built; list missing ones in the report

Offline demo safety: the demo must work with no internet. Recorded fixtures replace live feeds, and a visible label says "Replay of data recorded at [time]". Never present a replay as live.

No embarrassing screens:

- no blank or loading-forever maps
- no raw error messages or stack traces
- no "undefined"/"NaN"/"null" on screen
- no lorem ipsum, no broken images
- no console errors on the demo path
- counters and lists agree
- no third-party branding as the main view

Speed on the demo path:

- first screen visible in under 2 seconds locally
- each demo step responds in under 1 second, or shows a clear progress state

Polish: consistent wording (logistics language, plain English), readable font sizes on a projector, good contrast, sensible empty states.

Presenter materials:

- STRESS_TEST/DEMO_SCRIPT.md: a 3-minute click-by-click script with what to say at each step
- STRESS_TEST/DEMO_CHECKLIST.md: what to check 1 hour and 5 minutes before presenting (laptop charged, demo reset, offline mode tested, AI model loaded, browser zoom, notifications off)
- a "Plan B" section: what to do if the internet, the AI or the projector fails

## 7. Phase 5: the demo video (last step)

Record one proper, detailed but short video of Ophanim using automated browser recording (Playwright). Use the demo organization only.

Length: 2-3 minutes. Resolution: 1920x1080. Smooth pacing: no frantic clicking and no dead time. No blank or loading screens longer than 1 second.
Story order (skip any step whose feature doesn't exist):

- Title card: "Ophanim: watches the world for your freight" (3 s)
- Today view / overview: what needs attention
- Import shipments from Excel through the review gate
- A weather or port event linked to DXB-291: why it matched, the impact, the evidence and the Last Safe Move deadline
- Document check catching a mistake (50 vs 48 boxes)
- Gulf GPS-interference / vessel signal warning
- Ask to confirm -> reply saved as evidence
- Decision log entry
- Verify: "Is this true?" with a verdict and proof (if built)
- Closing card with the one-line pitch (3 s)

Captions: short on-screen captions explaining each step in plain words, readable at presentation size. No voice-over is needed; leave room for an optional music track. Do not add copyrighted music.

Safety: no secrets, API keys, real names, emails or personal data visible. The browser address bar shows localhost or nothing.

Tools: use ffmpeg to join clips, add captions and title cards, and export MP4 (H.264).
Save to:

- STRESS_TEST/video/Ophanim-Demo-2026-10.mp4 (not committed if larger than 50 MB; mention the location)
- also copy it to D:\OPHANIM\Documentation\ if that folder exists

Re-recording: make the recording script re-runnable (npm run demo:video), so the video can be recorded again after any fix.

## 8. Final report and finishing

STRESS_TEST/REPORT.md:

- Summary: what was tested, how many issues were found by severity, and how many were fixed.
- Findings table: ID, severity (P0-P3), area, short description, status (fixed / open / accepted), commit, test.
- Security: tenant-isolation results, secrets found (masked) with rotation advice, dependency audit.
- Performance: before vs after numbers, plus load-test results.
- Failure tests: what broke and what now degrades gracefully.
- Demo readiness: a checklist with pass/fail.
- Not built / not fixed: honest list.
- Founder actions: for example rotate a key, approve a history rewrite, enable the scheduled resume, merge the branch.
- Final checks: typecheck, tests, build and (if available) RLS tests all pass on the final commit. Compare with the baseline.

Finish: set "finished": true in state.json, commit, push the stress-test/competition branch, and open a pull request (don't merge it) titled "Stress test + competition readiness", with the report summary in the description.

## 9. Resume prompt (also save to STRESS_TEST/RESUME_PROMPT.txt)

Continue the Ophanim stress test. Check out branch stress-test/competition, read STRESS_TEST/state.json and STRESS_TEST/PROGRESS.md, and continue from the first task that is not done, following the rules in STRESS_TEST/PROMPT.md. If finished is true, print the final summary and stop.

On your first run, also save this whole prompt as STRESS_TEST/PROMPT.md, so later sessions can read the full instructions.
