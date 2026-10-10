# Synthetic dataset v3 — 10 October 2026

Source: this repository's synthetic templates, MIT. No teacher API/model was
used. No customer documents, personal data or shared-source text was used. All
company/vessel/carrier names are explicitly synthetic. UN/LOCODE examples AEDXB
and INKOC and airport examples DXB/COK are a tiny hand-curated code fixture, not a
redistributed commercial codes database. Container owner prefix OPHU is synthetic;
ISO 6346 check digits and AWB check digits are generated, not ownership claims.

2,880 examples: train 2,400; validation 240; held-out test 240. Every split is
balanced by mode. Train languages: English 809, Arabic 799, mixed 792. Validation
and test each: English 86, Arabic 85, mixed 69. Task/language counts are in the
external dataset's summary.json and the table generated in FINAL_REPORT.md.

QA unanswerables are checked to be >=20% in every split. Split-specific references
and dates and content-hash deduplication prevent identical prompts leaking across
splits. The v1 generator had an unanswerable sampling correlation; v2 corrects
this. v3 adds strict nested-array schemas and a single QA schema independent of
answerability. v3 is the training candidate; v1/v2 remain for provenance.
The historical 50-case base run used v2 prompts and is rescored against v3 schemas;
corrected prompts still need a fresh development evaluation. v1 remains on disk,
is not used for training, and has no accepted model. Never overwrite held-out data.

The 50-case model-selection sample comes from validation, not held-out test. It
measures prompt-only structured behavior. A small synthetic evaluation is not
evidence of production reliability. Hold out real formatting/OCR variation and
human-reviewed Arabic before commercial release. Whitespace/layout noise is
included; semantic OCR corruption and handwriting remain limitations.

Schema-valid and exact matches are mechanical metrics. Event-summary, forecast
and mistake-explanation quality requires a separate human review of meaning,
uncertainty and citations. The dataset is intentionally a starter corpus with
limited event and route diversity, not a finished competition/production benchmark.

Redaction: not applicable to the synthetic corpus. Real customer data requires
written consent recorded in data/CONSENT_REGISTER.md and a separately approved
redaction pipeline. Training entry point rejects any non-synthetic source.

Rebuild: ml/scripts/generate_dataset.py --version NEW_VERSION. Artifacts are in
D:\models\datasets\VERSION, not Git or C:. Random seed 42. Do not use the held-out
test to change prompts, model selection, training settings or hyperparameters.
