# Job File progress

Branch `feat/job-file-core` in worktree `D:/OPHANIM/worktrees/job-file-core`,
from local commit `2a2b72e` (parity-and-reliability, unpushed). Read
`state.json` and `DESIGN.md` first when resuming.

## Rules kept

- Never edit, checkout, reset or pull in `C:\Users\Leonard\OneDrive\Documents\OPHANIM-V3 2`
  or `C:\Users\Leonard\.codex\worktrees\parity-default-alignment\OPHANIM-V3 2`.
- One prediction ledger: `ophanim_forecasts` extended (see DESIGN.md).
- Preserve licence gates (international METAR/TAF stays rights-gated), tenant
  isolation, central server credentials, Logistics and Presentation behaviour.
- Commit per task; open a PR; never merge or deploy.

## 00 — setup and baseline (done)

- Worktree created; PARITY state/report/progress, docs, migrations, forecasts,
  documents, storage, auth, imports, AI config, integrations and installed
  Next.js 16 docs read. No AGENTS.md in the repository (Next's own AGENTS.md read).
- Baseline in BASELINE.md.

## 01 — data model (done)

- `db/migrations/027_job_files.sql`: job files, key ring, legs, milestones,
  piece counts, flags, accepted differences, lessons, staff error events,
  Today items, sites, driver links, site events, invoices, counterparties,
  intake items, document types, rule packs, milestone templates, step
  durations, source report lags, paper templates/versions, City Pulse, airport weather.
- `supabase/migrations/20261021090000_job_files_security.sql`: documents
  extension, extracted fields, unified ledger (questions, snapshots,
  interactions, outcomes, scores, extended `ophanim_forecasts`), append-only
  trigger, forced RLS on every new table, self-only staff statistics.
- Tests: `src/lib/jobfile/rls.integration.test.ts` (PGlite, real migrations).

## 4.1 — job file core and intake (done)

- Generic tenant-scoped repository (`src/lib/jobfile/repo.ts`): Postgres with an
  organization predicate on every statement, or an in-process SYNTHETIC DEMO store
  when DATABASE_URL is absent. Feature `job_files` (logistics/full editions);
  new permission `jobfile:approve` for owner/operations manager.
- Key ring with ISO 6346 / IATA validation; invalid numbers stay on the ring and
  raise block (check digit) or warn (unknown airline prefix) flags.
- Intake: inbound-email webhook (signed per-organization address, JSON or raw
  MIME), IMAP poller for one dedicated mailbox (cron, JOBFILE_CRON_SECRET),
  WhatsApp Business webhook (signature verified; stub without keys), in-app
  photo/upload/forward. Matching with reasons; ambiguous/unmatched → review queue;
  unmatched pre-alert with a valid AWB/B/L/container creates the job.
- Private storage reuse (Supabase bucket or KNOWLEDGE_STORAGE_DIR; memory in demo),
  signed URLs (Supabase signed URL or HMAC + session organization re-check).
- Pages: /jobs, /jobs/[id], /jobs/review, /capture (phone, offline IndexedDB queue,
  idempotent retries). EN/AR with RTL. Audit trail via ophanim_audit_events.
- Acceptance (service.test.ts, memory + PGlite): pre-alert with AWB attachment
  creates the job; follow-up updates it; invalid container flagged block; ambiguous
  container → review; cross-tenant reads return nothing. Browser-checked in demo
  mode (EN and AR/RTL).

## 4.2 — Paper Desk (done)

- Document reader interface (`reader.ts`): OpenAI-compatible vision model via the
  central AI config (requires `classify_document` or an `extract_*` task enabled;
  optional JOBFILE_VISION_MODEL), local Tesseract OCR eng+ara via TESSERACT_PATH
  (TSV word boxes, labelled lower confidence, never auto-accepts), text reader, and
  a no-reader state that asks for typing. All return field, confidence, page, bbox.
- 13 document types (6 v1 + 7 configurable) with merge from ophanim_document_types.
- Intake reads documents before matching, then adopts printed references, runs checks.
- Auto-accept only at ≥0.92 confidence AND deterministic field checks AND no flag on
  the field. Crop view (FieldCrop) shows the photographed region of each value.
- Flag fix / accept-difference (remembered per client) / false alarm; block flags
  need a senior to accept or dismiss; fixing returns a 30-second EN/AR lesson.
- Senior review routing: block flag, new staff, high-value job, Tired-Hands
  (late shift in Asia/Dubai, ≥15 files/hour, last-minute consignee/weight change).
- Private streak; team totals by document type and step only. Search + version chain.
- Acceptance (paper-desk.test.ts): 9 kg invoice/packing-list gap → exactly one warn
  flag with EN/AR fix; crop page/bbox kept; fix returns lesson with the 9 kg example.

## Questions for the founder

1. What exactly are the "landing" and "takeoff" papers? Assumed: air import / export documents (AWB, cargo manifest, delivery order, export declaration).
2. Which software do they use today (CargoWise, Magaya, Zoho, Tally, spreadsheets)?
3. Is unloading in their own warehouse or at third-party terminals (dnata, DWC)?
4. Which papers do they create themselves vs receive?
5. Air/sea mix and main airports, ports and borders?
6. Pooling boundary (Panel §7): may one customer's resolved shipments train models used by another? Default: no.
