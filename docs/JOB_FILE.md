# Job files

One job file per shipment. Everything about the shipment already exists on paper,
in email, in WhatsApp or in other software; Ophanim pulls it into the job file,
checks it, tracks it milestone by milestone and piece by piece, and predicts what
happens next. Staff photograph the paper and forward the email — never retype.

Ophanim connects, checks, tracks and predicts. It does **not** take bookings, run
accounting, file customs declarations or act as an e-invoicing provider.

Pages: `/jobs` (list), `/jobs/[id]` (job file), `/jobs/today`, `/jobs/review`,
`/jobs/desk` (Paper Desk), `/jobs/receipts` (Checking our work). Phone pages, no
install: `/capture` (photograph paper, offline queue), `/floor?job=…` (floor taps,
warehouse tally), `/d/<token>` (driver trip link). English and Arabic (RTL) from
`src/lib/i18n/messages/*.json`; add Hindi or Urdu by adding a file and a locale.

Feature flag `job_files` (on in `logistics` and `full` editions). Permissions reuse
`shipment:read/write` and `import:read/write`; `jobfile:approve` (owner, operations
manager) approves papers, accepts or dismisses block flags and edits settings.

## Demo / stub mode

Without `DATABASE_URL` every job-file screen runs on a **SYNTHETIC DEMO** in-memory
store, seeded by `src/lib/jobfile/story.ts` (the full story below) and labelled on
every page. Without a key, each integration reports stub mode and sends nothing.
Integration status is shown in Admin → Integrations ("Job files" area).

## Data model

Migrations: `db/migrations/027_job_files.sql` (tables) and
`supabase/migrations/20261021090000_job_files_security.sql` (documents extension,
extracted fields, prediction ledger, RLS). Every tenant table has
`organization_id`, RLS enabled **and forced**, a member-read policy and no browser
grants; server routes write with an organization predicate on every statement
(`src/lib/jobfile/repo.ts`). Shared reference rows (`organization_id null`) exist for
sites, lessons, document types, rule packs, milestone templates, City Pulse and
airport weather. Staff error events are readable only by the person
(`current_ophanim_user_id()`); managers see team totals by document type and step,
never a ranking. Audit trail: `ophanim_audit_events`.

| Table | Purpose |
| --- | --- |
| `ophanim_job_files` | org, job number, mode, status, client, origin/destination, planned dates, created_from, `is_synthetic`, optional `shipment_id` |
| `ophanim_job_references` | the key ring: AWB/HAWB/B/L/HBL/container/booking/invoice/customs/DO/client refs, validated flag, source |
| `ophanim_job_legs`, `ophanim_job_milestones` | legs; milestones with planned/expected/actual, source, confidence, evidence, needs_confirmation |
| `ophanim_job_piece_counts` | pieces and weight per handoff (booked → delivered) |
| `ophanim_documents` (extended) | existing private documents + job, intake, type code, pages, channel, version chain, reader |
| `ophanim_extracted_fields` | value, confidence, page, bounding box (crop view), status, confirmed by/at |
| `ophanim_job_checks` | flags: code, severity, EN/AR message/why/fix, status, resolution |
| `ophanim_accepted_differences`, `ophanim_lessons`, `ophanim_staff_error_events` | remembered differences, 30-second lessons, private streaks |
| `ophanim_today_items` | Today list with probability, cost, priority, interrupt |
| `ophanim_sites`, `ophanim_driver_links`, `ophanim_site_events` | Gate Pulse |
| `ophanim_invoices`, `ophanim_counterparties` | Invoice Desk |
| `ophanim_intake_items` | email / WhatsApp / photo / upload inbox before matching |
| configuration | document types, rule packs, milestone templates, step durations, source report lags, paper templates and versions, City Pulse, airport weather |

## Intake setup

* **Email webhook** (`POST /api/jobfiles/intake/email`): set `INBOUND_EMAIL_SECRET`
  and `INBOUND_EMAIL_DOMAIN`. Each organization's address is
  `jobs+<organization id>.<signature>@<domain>` (`inboundAddress()`); the HMAC
  signature stops guessing another tenant's address. Point your inbound-email
  provider at the route with `Authorization: Bearer <INBOUND_EMAIL_SECRET>`. Accepts
  Postmark-style JSON or `{ "raw": <base64 MIME>, "encoding": "base64" }`.
* **IMAP** (`POST /api/jobfiles/intake/imap`, cron with `JOBFILE_CRON_SECRET`): one
  dedicated mailbox for `IMAP_ORGANIZATION_ID` (`IMAP_HOST`, `IMAP_PORT`, `IMAP_TLS`,
  `IMAP_USER`, `IMAP_PASSWORD`, `IMAP_MAILBOX`). Unseen messages are stored, then marked seen.
* **WhatsApp Business** (`/api/jobfiles/intake/whatsapp`): `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_APP_SECRET` (signature check), `WHATSAPP_VERIFY_TOKEN` (webhook
  verification) and `WHATSAPP_ORGANIZATION_ID`. Without keys: stub — staff use `/capture`.
* **Phone capture** (`/capture?job=<id>`): multi-page, queued in IndexedDB and
  retried when back online; `clientId` makes retries idempotent.
* **Matching**: reference numbers are found in the subject, body, attachment text
  and what the reader extracted; a single strong match attaches, ambiguous or
  unmatched items go to `/jobs/review` with the reasons; an unmatched pre-alert with
  a valid AWB / B/L / container creates the job.
* **Driver links**: from a job (`POST /api/jobfiles/[id]/driver-links`), expires
  after the trip. Location is saved only if the link allows it **and** the driver
  ticks consent for that tap; there is no background tracking. Presentation mode
  leaves `/d/` reachable.

## Paper Desk: document types and rule packs

Readers (`src/lib/jobfile/reader.ts`): OpenAI-compatible vision model through the
central AI settings (enable `classify_document` or an `extract_*` task; optional
`JOBFILE_VISION_MODEL`), local Tesseract (`TESSERACT_PATH`, eng+ara, lower
confidence, never auto-accepts), a text reader, or typing. Fields auto-accept only
at ≥ `JOBFILE_AUTO_ACCEPT_CONFIDENCE` (0.92) **and** after passing deterministic
checks **and** with no flag on them.

Add a document type without code: insert into `ophanim_document_types`
(`code`, `label_en`, `label_ar`, `fields` from `FIELD_DEFINITIONS`, `keywords` for
classification; `active=false` hides a default). Add a rule pack: insert into
`ophanim_rule_packs` with `mode`, `destination_pattern` / `goods_pattern`
(regular expressions) and `required_documents` (type codes). The built-in GCC
certificate-of-origin pack is an **example**; confirm route requirements first.

Checks (`checks.ts`): pieces, gross weight (tolerance max(2 kg, 0.5%), block >5%),
shipper and consignee after normalisation, HS plausibility (soft), invoice lines,
currency, VAT, air chargeable weight (1 m³ = 166.67 kg), dimensions vs volume,
date order and plausibility, AWB/container check digits, Incoterms, missing route
documents. Plus piece chain, weather, City Pulse and invoice checks elsewhere.

## Papers

`POST /api/jobfiles/[id]/papers` drafts house AWB, delivery note or client invoice
PDFs from the job file (`papers.ts`, dependency-free PDF writer, Latin text only).
Templates per organization in `ophanim_paper_templates` (title, company, footer,
JPEG logo). Each draft is a new version; approval needs `jobfile:approve`.

## Connecting their software

Tracking sheets: `POST /api/jobfiles/sync` (source + file). Mapping remembered per
source in the existing `ophanim_import_mapping_profiles`; renamed columns are
detected by name and value shape and re-mapped. Scheduled: sheets emailed by a
sender whose `email:<domain>` mapping exists, or the watched folder
(`JOBFILE_WATCH_DIR`, `JOBFILE_WATCH_ORGANIZATION_ID`, cron). Exports:
`/api/jobfiles/export?format=xlsx|csv&entity=…`. Connector interface
`ForwardingConnector` with an example CSV-export connector; no real CargoWise,
Magaya, Zoho or Tally connectors without vendor access. Daily digest:
`POST /api/jobfiles/digest` (cron) via Resend and optionally WhatsApp.

## E-invoice adapter

`src/lib/jobfile/einvoice.ts`. Default **stub**: generates a PINT AE-shaped UBL 2.1
XML marked *NOT VALIDATED* and sends nothing. The generic HTTPS ASP adapter is
used only with `EINVOICE_ASP_URL`, `EINVOICE_ASP_TOKEN` and
`EINVOICE_ASP_VALIDATED=true`. Identifiers marked TO-VALIDATE (CustomizationID,
ProfileID) and the VAT treatment (international freight zero-rated, local charges
5%) must be validated against the official UAE Ministry of Finance PINT AE
specification and by a tax adviser before production. Smaller UAE businesses must
appoint an accredited service provider by 31 Mar 2027 and go live on 1 Jul 2027.

## Prediction ledger

One ledger shared with the forecast engine: the existing `ophanim_forecasts` table
is extended, never duplicated (`JOBFILE/DESIGN.md`). A prediction is a row in
`ophanim_forecasts` linked to a question in `ophanim_forecast_questions`, with an
inputs snapshot (`ophanim_feature_snapshots`, sha256 of canonical JSON), source
type and model/rule version. Rows are append-only (trigger); a changed prediction
is a new row, written only when inputs change. Shown / acted / dismissed go to
`ophanim_forecast_interactions`; outcomes to `ophanim_forecast_outcomes`; scores to
`ophanim_forecast_scores` (Brier, log loss, interval hit, absolute error,
`excluded_reason = intervention` when a heeded warning's problem did not happen).
Legacy analyst forecasts keep working unchanged.

| Prediction | Version | Resolved by |
| --- | --- | --- |
| Ghost Position: P(milestone happened, not yet reported) | `ghost-position@1` | the confirmation (judged against the forecast time) |
| Time-gap risk | `time-gap@1` | the milestone being confirmed |
| Weather impact (arrival ≥ 60 min late) | `weather-rules@1` | the actual arrival |
| Payment date (p10/p50/p90) | `payment-date@1` | invoice paid |
| Dispute odds | `dispute-rules@1` | disputed, or paid without dispute |
| Paper Risk (query, amendment, rejection, dispute) | `paper-risk@1` | recorded outcome, or delivery without one |

The Receipts strip on each job shows "Called it / Missed / Pending"; `/jobs/receipts`
shows calibration, Brier vs a base-rate baseline, coverage and counts per type.

## Licence gates and limits

* No new international METAR/TAF fetch: the existing rights gate stays. UAE
  station weather comes from a rights-reviewed feed or customer-provided rows in
  `ophanim_airport_weather`.
* OCR accuracy on handwriting and poor photos is limited; values below threshold
  wait for a person. PDFs print Latin text only.
* Seed data is synthetic and labelled SYNTHETIC DEMO; City Pulse demo entries are
  examples, not real road rules.
