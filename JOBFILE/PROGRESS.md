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

## 4.3 — papers from the job file (done)

- Dependency-free PDF writer (`pdf.ts`: text, boxes, JPEG logo). Drafts of house
  AWB, delivery note and client invoice from `jobFacts` (confirmed fields → key
  ring → header → piece counts; chargeable weight computed). Per-organization
  templates (title, company, footer, logo) in ophanim_paper_templates.
- Every draft is a new version in private storage; approval needs
  jobfile:approve and no missing required fields. Limit: PDFs print Latin text only.
- Acceptance (papers.test.ts): house AWB draft has every required field filled
  from the job file, no retyping; second draft = v2; analyst cannot approve.

## 4.4 — milestones, unloaded items and time gaps (done)

- Templates (air export, air import, sea, Gulf overland via Khor Fakkan/Fujairah;
  multimodal combines) with p10/p50/p90 step durations; organization overrides in
  ophanim_milestone_templates; `learnStepDurations` refines from own history (≥5).
- Milestones from email/WhatsApp: deterministic patterns, plus optional AI
  (`understand_email` task, central config). <0.8 confidence → one-tap confirmation.
- Floor taps and warehouse tally phone page (/floor?job=…), optional photo.
- Piece chain: short-landed (block, "11 of 12 … 1 likely on the next flight"),
  increase, weight change beyond max(2 kg, 0.5%).
- Time gaps: past p90 + grace → "expected but missing" Today item + drafted
  email/WhatsApp chaser to the right counterparty; skipped where the source does not
  normally report the milestone.
- Ghost Position: P(happened | unreported) from duration × learned per-source report
  lags; logged to the ledger (`ghost-position@1`) and scored per forecast when the
  confirmation arrives; report lag learned from each confirmation.
- Shared ledger module (`ledger.ts`): record (snapshot + sha256 of canonical
  inputs, new row only when inputs change), shown/acted interactions, resolve,
  Brier/log loss, interval coverage, intervention exclusion.
- Acceptance (milestones.test.ts): landed + no terminal receipt after the window →
  Today item, ghost ~0.6–1, chaser; 11 of 12 → short-landed flag.

## 4.5 — connecting their software (done)

- Tracking-sheet sync reuses the existing parser and ophanim_import_mapping_profiles
  (one profile per source, `jobfile-sync:<source>`). Renamed columns detected by
  name similarity + value shape (AWB/B/L/container/number patterns) and re-mapped.
- Scheduled imports: sheets emailed by a sender with a remembered profile
  (`email:<domain>`) are synced on intake; watched folder cron (JOBFILE_WATCH_DIR).
- Exports: CSV (formula-safe) and multi-sheet .xlsx (fflate, no new dependency)
  for job files, milestones, documents, flags, invoices: /api/jobfiles/export.
- ForwardingConnector interface + example CSV-export connector. No real
  CargoWise/Magaya/Zoho/Tally connectors (no access).
- Daily digest (Today list) via Resend (RESEND_API_KEY/RESEND_FROM) and WhatsApp
  (WHATSAPP_PHONE_NUMBER_ID, 24-hour window limit); stub returns text only.
- Today ranking + alert budget module (`today-list.ts`) written here for the digest.
- Acceptance (sync.test.ts): sheet imported twice with renamed AWB column is
  detected and re-mapped; job exports to xlsx and reads back through the importer.

## 4.6 — congestion and delays (done)

- Airport weather: TAF parser (base/FM/TEMPO/BECMG/PROB) + rules (fog, low
  visibility, wind ≥25 kt or gusts ≥35, dust/sand) over the job's arrival/departure
  morning (±3 h). Reads ophanim_airport_weather (shared or customer-private rows).
  **Licence gate preserved**: no new international METAR/TAF fetch; UAE stations need
  a rights-reviewed feed or customer data. Weather-impact prediction (`weather-rules@1`)
  resolves from the actual arrival (≥60 min late).
- City Pulse: admin-editable calendar (weekly windows in Gulf time or dated) per
  emirate, applied to truck legs/delivery times. API /api/jobfiles/settings.
- Gate Pulse: driver links (token carries the organization; sha256 stored; expires),
  /d/[token] page with Arrived/Loaded/Left; location only if link opt-in AND driver
  consent per tap. Waiting time per site by hour of week (median).
  Presentation policy: `/d/` exempt from the presentation redirect (only change).
- Notices: provider-registry events (ophanim_events, org + global) matched by the
  job's places and date window. Impact-first lines labelled FACT / ESTIMATE.
- Acceptance (congestion.test.ts): seeded fog TAF at DXB flags an air import
  arriving that morning; three driver trips give "~2h40" wait for the site.

## 4.7 — Today list (done)

- One prioritised list per person (/jobs/today, "Mine") and per team ("Team"):
  flags, expected-but-missing milestones, documents to confirm, senior review
  requests, intake to review, chasers. Priority = probability × cost, boosted when due.
- Phone: swipe right = done, swipe left = snooze (mirrored in RTL); buttons for
  done / snooze / escalate / not a problem. Acting on a time-gap warning records an
  "acted"/"dismissed" interaction on its prediction (intervention handling).
- Alert budget: at most JOBFILE_ALERT_BUDGET (default 5) interruptions per person
  per Gulf day; the rest wait in the list. Re-raised items keep people's decisions.
- Tests: today.test.ts.

## 4.8 — Invoice Desk (done)

- Draft outgoing invoices from the job file: freight on checked chargeable weight,
  pass-through of incoming carrier/terminal charges with evidence, VAT per line
  (default: international freight zero-rated, local charges 5% — **needs tax-adviser
  confirmation**). Optional bill-to override.
- Pre-send checks: >10% above quote, chargeable weight changed, storage paid but
  not billed, wrong client (block), VAT arithmetic/rates.
- Incoming invoices matched to jobs by references; margin per job; storage /
  demurrage / detention tagged as the job's actual cost of delay and stored as a
  labelled outcome (`delay_cost_invoice`) for later delay-cost predictions.
- E-invoice adapter: stub by default; generic HTTPS ASP adapter only when
  EINVOICE_ASP_URL + EINVOICE_ASP_TOKEN + EINVOICE_ASP_VALIDATED=true. PINT AE-shaped
  UBL 2.1 export, marked NOT VALIDATED (CustomizationID/ProfileID TO-VALIDATE against
  the UAE MoF specification). Ophanim is not an e-invoicing provider.
- Predictions: payment date (p10/p50/p90 from client history ≥5 → org prior ≥5 →
  default prior 21/40/75 days) and dispute odds (rules + logistic). Both resolve on
  paid/disputed.
- Acceptance (invoices.test.ts): seeded job → invoice passes checks, PINT AE stub
  export, payment-date range recorded and later scored "called".

## 4.9 — prediction ledger and Receipts (done)

- Every prediction type writes to the one ledger when made: Ghost Position,
  time-gap risk, weather impact, payment date, dispute odds, Paper Risk (inputs
  snapshot + sha256, model/rule version, shown/acted interactions).
- Automatic resolution: milestone confirmed (ghost, gap), arrival (weather),
  invoice paid/disputed (payment, dispute), delivered without query or a recorded
  customs query/amendment/rejection/dispute (Paper Risk).
- Scoring: Brier + log loss for yes/no; interval coverage + absolute error for
  ranges; acted-on warnings whose problem did not happen are excluded.
- Paper Risk v1 (`paper-risk@1`): rules + logistic, top 3 reasons ("1 in 4" for a
  weight mismatch alone).
- Receipts strip on each job ("Called it" / "Missed" / "Pending"); internal
  /jobs/receipts "Checking our work": calibration chart + table, Brier vs base-rate
  baseline, coverage, resolved/excluded counts.
- Tests: receipts.test.ts.

## Questions for the founder

1. What exactly are the "landing" and "takeoff" papers? Assumed: air import / export documents (AWB, cargo manifest, delivery order, export declaration).
2. Which software do they use today (CargoWise, Magaya, Zoho, Tally, spreadsheets)?
3. Is unloading in their own warehouse or at third-party terminals (dnata, DWC)?
4. Which papers do they create themselves vs receive?
5. Air/sea mix and main airports, ports and borders?
6. Pooling boundary (Panel §7): may one customer's resolved shipments train models used by another? Default: no.
