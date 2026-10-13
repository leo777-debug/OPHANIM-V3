# Model evaluation report

Evaluation rows: 50. No missing model is assigned a score. Compact task prompts: True. Request concurrency: 4; latency includes queue/prefill/generation, not standalone generation speed.

Raw base predictions were generated from v2 compact prompts, which omitted nested array descriptors. Metrics below are rescored against corrected v3 schemas. This is not a new model run; improved prompts still require evaluation.

## base: ophanim-logistics:base

### all (50 rows)

```json
{
  "valid_json": 1.0,
  "schema_valid": 0.68,
  "exact_match": 0.4,
  "field_exact": 0.5108095238095238,
  "field_f1": 0.5192119693172325,
  "answer_correct": 0.0,
  "citation_correct": 0.0,
  "not_found_correct": 0.0,
  "hallucination": 1.0,
  "classification_correct": 0.6666666666666666,
  "latency_s": 117.76106997001217,
  "tokens_s": 0.7148365938519744,
  "confusion_matrix": {
    "packing_list -> packing_list": 1,
    "invoice -> invoice": 1,
    "awb -> null": 1
  },
  "extraction_field_exact": 0.9931972789115646
}
```

### logistics/en (11 rows)

```json
{
  "valid_json": 1.0,
  "schema_valid": 0.8181818181818182,
  "exact_match": 0.6363636363636364,
  "field_exact": 0.6818181818181818,
  "field_f1": 0.6818181818181818,
  "answer_correct": 0.0,
  "citation_correct": 0.0,
  "not_found_correct": 0.0,
  "hallucination": 1.0,
  "classification_correct": 1.0,
  "latency_s": 163.5887495000127,
  "tokens_s": 0.4579778911909415,
  "confusion_matrix": {
    "packing_list -> packing_list": 1
  },
  "extraction_field_exact": 1.0
}
```

### logistics/ar (11 rows)

```json
{
  "valid_json": 1.0,
  "schema_valid": 0.8181818181818182,
  "exact_match": 0.6363636363636364,
  "field_exact": 0.740909090909091,
  "field_f1": 0.7575757575757577,
  "answer_correct": 0.0,
  "citation_correct": 0.0,
  "not_found_correct": null,
  "hallucination": 1.0,
  "classification_correct": 1.0,
  "latency_s": 107.17241260908882,
  "tokens_s": 0.7234529020912699,
  "confusion_matrix": {
    "invoice -> invoice": 1
  },
  "extraction_field_exact": 1.0
}
```

### logistics/mixed (11 rows)

```json
{
  "valid_json": 1.0,
  "schema_valid": 0.8181818181818182,
  "exact_match": 0.5454545454545454,
  "field_exact": 0.6461038961038961,
  "field_f1": 0.6536796536796537,
  "answer_correct": 0.0,
  "citation_correct": 0.0,
  "not_found_correct": null,
  "hallucination": 1.0,
  "classification_correct": 0.0,
  "latency_s": 102.83043512727387,
  "tokens_s": 0.712205420846823,
  "confusion_matrix": {
    "awb -> null": 1
  },
  "extraction_field_exact": 0.9795918367346939
}
```

### general/en (6 rows)

```json
{
  "valid_json": 1.0,
  "schema_valid": 0.3333333333333333,
  "exact_match": 0.0,
  "field_exact": 0.12222222222222223,
  "field_f1": 0.1259259259259259,
  "answer_correct": 0.0,
  "citation_correct": 0.0,
  "not_found_correct": 0.0,
  "hallucination": 1.0,
  "classification_correct": null,
  "latency_s": 133.61804321670206,
  "tokens_s": 0.5401089788728486,
  "confusion_matrix": {},
  "extraction_field_exact": null
}
```

### general/ar (6 rows)

```json
{
  "valid_json": 1.0,
  "schema_valid": 0.5,
  "exact_match": 0.0,
  "field_exact": 0.1361111111111111,
  "field_f1": 0.1542796384901648,
  "answer_correct": 0.0,
  "citation_correct": 0.0,
  "not_found_correct": null,
  "hallucination": 1.0,
  "classification_correct": null,
  "latency_s": 101.9641415833612,
  "tokens_s": 0.8992834562358886,
  "confusion_matrix": {},
  "extraction_field_exact": null
}
```

### general/mixed (5 rows)

```json
{
  "valid_json": 1.0,
  "schema_valid": 0.4,
  "exact_match": 0.0,
  "field_exact": 0.24666666666666667,
  "field_f1": 0.2511111111111111,
  "answer_correct": null,
  "citation_correct": null,
  "not_found_correct": null,
  "hallucination": null,
  "classification_correct": null,
  "latency_s": 73.01056402001996,
  "tokens_s": 1.2550953453053837,
  "confusion_matrix": {},
  "extraction_field_exact": null
}
```

## fine-tuned
Not available / not run.

## larger
Not available / not run.

## Acceptance
Fine-tuned adapter accepted: False. Full held-out results and human citation/summary review are required.

Exact structured matching is intentionally conservative. Free-form summary/forecast/mistake correctness requires human review; exact-match is not a semantic quality score. CPU/GPU hardware must be recorded separately.
