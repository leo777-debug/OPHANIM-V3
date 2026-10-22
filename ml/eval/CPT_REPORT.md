# Continued-pretraining evaluation — Kaggle version 3

**Not accepted for release.** Real continued pretraining completed on 13 October 2026; outputs were downloaded and verified on 14 October. This is causal next-token training of existing Qwen weights through a QLoRA adapter, not supervised task training or training from scratch.

Adapter: `D:\models\adapters\cpt-20261013-172004\adapter_model.safetensors` (23,631,240 bytes). Requires the verified base `D:\models\base\Qwen--Qwen3-4B-Instruct-2507`. No merged model, trained GGUF or Ollama release was created.

Adapter SHA-256: `37200a07946ff63b5445446da1c82879ae471f7e50d5499b55ae0dae4d7ff87f`. All 35 imported files match the disk manifest; all producer checksums, evaluation IDs, saved scores, corpus hashes and local test-set hash were checked.

[Private training notebook](https://www.kaggle.com/code/leonardvk/ophanim-continued-pretraining) version 3; adapter version `cpt-20261013-172004`. Base revision `cdbee75f17c01a7cc42f958dc650907174af0554`. Task test SHA-256 `54daa223cb9e2bafb73f69cdaf94566bc2821bc1361947dbe9171015b7c36a99`.

## Training and data

Tesla T4, one 16 GB GPU, fp16/NF4, seed 42, rank-8 adapter (5,898,240 trainable parameters). One epoch, 18 optimizer steps, 144,876 tokens; 385.93 seconds including loading/validation after download, 346.84 seconds training loop, 5.11 GiB peak allocated CUDA memory. Training loss 2.464561; validation loss 2.303625 → 2.280127. Adapter update L2 0.170264.

Free Kaggle GPU; no paid instance rented. The output records cost_usd=null, not a billed-cost measurement. Account quota after the job showed 1.43 hours used / 28.57 remaining; this includes setup and evaluation, and the earlier failed setup run. Training alone took about 6 minutes 26 seconds.

CPT corpus: 1,440 synthetic MIT passages (1,200 train / 120 validation / 120 test), 400 training passages per English/Arabic/mixed language and 600 per mode. Only six templates per mode/language: a small procedural starter corpus with overlapping subjects, not a diverse production corpus. No teacher outputs, customer files or changing real-world facts. Separate task fixtures: 2,880 MIT examples; 2,400 train / 240 validation / 240 test. Task training/validation fixtures were not used for CPT. Test: 86 English, 85 Arabic, 69 mixed, 120 per mode; no test example was used for training or tuning.

## Release decision

Extraction field exact match tied at 99.38%; valid JSON regressed 94.17% → 93.33% (226/240 → 224/240); NOT FOUND tied at 8/8. General Arabic JSON fell 90.48% → 88.10%, and general mixed JSON fell 97.22% → 94.44%. The required strict improvements were not achieved. The unchanged unsupported-answer proxy was 23/31 (74.19%). Keep base + RAG. Lower held-out perplexity is evidence of language-loss improvement, not task acceptance. The held-out set must not be used to tune another run. The export preflight was exercised against this comparison and refused it before model loading or merging.

## Task metrics

Every paired cell is **base / continued-pretrained**. N/A means no eligible cases. Larger configured model: unavailable / not run for every metric. Extraction F1 is calculated only on extraction tasks; all-task field scores include mechanical targets for open-ended text.

| Group | Rows | JSON | Schema | Extraction exact | Extraction F1 | All-task field exact | All-task field F1 | Exact output | Classification |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| all | 240 | 94.17% / 93.33% | 86.67% / 85.83% | 99.38% / 99.38% | 99.38% / 99.38% | 52.77% / 52.11% | 52.37% / 51.70% | 30.42% / 30.42% | 45.45% / 45.45% |
| logistics/en | 44 | 93.18% / 93.18% | 93.18% / 93.18% | 100.00% / 100.00% | 100.00% / 100.00% | 69.32% / 69.32% | 68.84% / 68.84% | 63.64% / 63.64% | 0.00% / 0.00% |
| logistics/ar | 43 | 93.02% / 93.02% | 93.02% / 93.02% | 99.64% / 99.64% | 99.64% / 99.64% | 70.70% / 70.70% | 71.17% / 71.17% | 62.79% / 62.79% | 50.00% / 50.00% |
| logistics/mixed | 33 | 93.94% / 93.94% | 93.94% / 93.94% | 98.20% / 98.20% | 98.20% / 98.20% | 72.79% / 72.79% | 72.46% / 72.46% | 54.55% / 54.55% | 100.00% / 100.00% |
| general/en | 42 | 97.62% / 97.62% | 90.48% / 90.48% | N/A / N/A | N/A / N/A | 35.40% / 35.40% | 34.51% / 34.51% | 0.00% / 0.00% | N/A / N/A |
| general/ar | 42 | 90.48% / 88.10% | 59.52% / 57.14% | N/A / N/A | N/A / N/A | 25.67% / 23.65% | 25.17% / 23.13% | 0.00% / 0.00% | N/A / N/A |
| general/mixed | 36 | 97.22% / 94.44% | 91.67% / 88.89% | N/A / N/A | N/A / N/A | 44.67% / 42.59% | 43.94% / 41.85% | 0.00% / 0.00% | N/A / N/A |

## Grounded QA and speed

QA answer accuracy is exact target matching on answerable questions and NOT FOUND detection on unanswerable questions. Citation correctness requires known chunk IDs and a verbatim quote with text=quote. The hallucination column is a **contract/unsupported-answer proxy**, including malformed JSON and missing quotes; it is not a human-assessed rate of fabricated facts. Neither model passed an answerable QA citation case (0/23); unanswerable detection was 8/8. One inspected Arabic output had an empty quote and a trailing JSON quotation mark. Semantic summaries, forecasts and Arabic fluency require independent human review.

GPU throughput is generated tokens / generation-call elapsed time including prefill, measured sequentially with eager attention/NF4 and an unmerged adapter. It is not CPU speed, an optimized-server benchmark, or evidence that merging would have the same overhead.

| Group | QA cases | Unanswerable | Answer | Citations | NOT FOUND | Unsupported proxy | GPU latency seconds | GPU tokens/s |
| --- | ---: | ---: | --- | --- | --- | --- | --- | --- |
| all | 31 | 8 | 25.81% / 25.81% | 0.00% / 0.00% | 100.00% / 100.00% | 74.19% / 74.19% | 6.88 / 10.06 | 12.82 / 8.76 |
| logistics/en | 4 | 1 | 25.00% / 25.00% | 0.00% / 0.00% | 100.00% / 100.00% | 75.00% / 75.00% | 6.49 / 9.52 | 12.80 / 8.74 |
| logistics/ar | 4 | 1 | 25.00% / 25.00% | 0.00% / 0.00% | 100.00% / 100.00% | 75.00% / 75.00% | 6.65 / 9.79 | 12.82 / 8.73 |
| logistics/mixed | 3 | 1 | 33.33% / 33.33% | 0.00% / 0.00% | 100.00% / 100.00% | 66.67% / 66.67% | 6.66 / 9.87 | 12.89 / 8.70 |
| general/en | 7 | 2 | 28.57% / 28.57% | 0.00% / 0.00% | 100.00% / 100.00% | 71.43% / 71.43% | 7.16 / 10.37 | 12.82 / 8.81 |
| general/ar | 7 | 2 | 28.57% / 28.57% | 0.00% / 0.00% | 100.00% / 100.00% | 71.43% / 71.43% | 6.85 / 9.98 | 12.79 / 8.80 |
| general/mixed | 6 | 1 | 16.67% / 16.67% | 0.00% / 0.00% | 100.00% / 100.00% | 83.33% / 83.33% | 7.55 / 10.96 | 12.80 / 8.81 |

CPU Q4_K_M base: 4.51 tokens/s (4 threads), 4.45 (8 threads). UHD 620 Vulkan: 3.90 tokens/s, about 13.5% slower. The founder's i5-8350U has four physical cores/eight threads and 40 GB RAM. The ≥8 tokens/s main-model target remains unmet. Adapted CPU speed is not measured because the failed release gate blocks merging/export.

## Held-out corpus loss

| Language | Predicted tokens | Base loss | CPT loss | Base perplexity | CPT perplexity |
| --- | ---: | ---: | ---: | ---: | ---: |
| en | 3574 | 2.279118 | 2.255178 | 9.7681 | 9.5370 |
| ar | 4981 | 2.118496 | 2.102199 | 8.3186 | 8.1841 |
| mixed | 5780 | 2.315111 | 2.292691 | 10.1261 | 9.9015 |

## Per-task and language metrics

| Task | Language | Rows | JSON | Schema | Field exact | Field F1 | Exact output |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| classify_document | ar | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 25.00% / 25.00% | 25.00% / 25.00% | 0.00% / 0.00% |
| classify_document | en | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 0.00% / 0.00% | 0.00% / 0.00% | 0.00% / 0.00% |
| classify_document | mixed | 3 | 100.00% / 100.00% | 100.00% / 100.00% | 50.00% / 50.00% | 50.00% / 50.00% | 0.00% / 0.00% |
| explain_mistake | ar | 3 | 100.00% / 100.00% | 100.00% / 100.00% | 0.00% / 0.00% | 0.00% / 0.00% | 0.00% / 0.00% |
| explain_mistake | en | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 0.00% / 0.00% | 0.00% / 0.00% | 0.00% / 0.00% |
| explain_mistake | mixed | 3 | 100.00% / 100.00% | 100.00% / 100.00% | 0.00% / 0.00% | 0.00% / 0.00% | 0.00% / 0.00% |
| extract_arrival_notice | ar | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_arrival_notice | en | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_arrival_notice | mixed | 3 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_awb | ar | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_awb | en | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_awb | mixed | 3 | 100.00% / 100.00% | 100.00% / 100.00% | 96.30% / 96.30% | 96.30% / 96.30% | 66.67% / 66.67% |
| extract_bill_of_lading | ar | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 97.50% / 97.50% | 97.50% / 97.50% | 75.00% / 75.00% |
| extract_bill_of_lading | en | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_bill_of_lading | mixed | 3 | 100.00% / 100.00% | 100.00% / 100.00% | 96.67% / 96.67% | 96.67% / 96.67% | 66.67% / 66.67% |
| extract_booking_confirmation | ar | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_booking_confirmation | en | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_booking_confirmation | mixed | 3 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_delivery_order | ar | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_delivery_order | en | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_delivery_order | mixed | 3 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_invoice | ar | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_invoice | en | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_invoice | mixed | 3 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_packing_list | ar | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_packing_list | en | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% | 100.00% / 100.00% |
| extract_packing_list | mixed | 3 | 100.00% / 100.00% | 100.00% / 100.00% | 94.44% / 94.44% | 94.44% / 94.44% | 66.67% / 66.67% |
| flag_incident | ar | 7 | 100.00% / 100.00% | 100.00% / 100.00% | 19.05% / 19.05% | 16.05% / 16.05% | 0.00% / 0.00% |
| flag_incident | en | 7 | 100.00% / 100.00% | 100.00% / 100.00% | 0.00% / 0.00% | 0.00% / 0.00% | 0.00% / 0.00% |
| flag_incident | mixed | 6 | 100.00% / 100.00% | 100.00% / 100.00% | 50.00% / 50.00% | 50.00% / 50.00% | 0.00% / 0.00% |
| forecast | ar | 7 | 100.00% / 100.00% | 100.00% / 100.00% | 11.43% / 10.00% | 12.03% / 10.53% | 0.00% / 0.00% |
| forecast | en | 7 | 100.00% / 100.00% | 100.00% / 100.00% | 10.00% / 10.00% | 10.53% / 10.53% | 0.00% / 0.00% |
| forecast | mixed | 6 | 100.00% / 100.00% | 100.00% / 100.00% | 10.00% / 10.00% | 10.53% / 10.53% | 0.00% / 0.00% |
| grounded_qa | ar | 11 | 36.36% / 27.27% | 36.36% / 27.27% | 20.45% / 13.64% | 17.73% / 10.91% | 0.00% / 0.00% |
| grounded_qa | en | 11 | 63.64% / 63.64% | 63.64% / 63.64% | 40.91% / 40.91% | 38.18% / 38.18% | 0.00% / 0.00% |
| grounded_qa | mixed | 9 | 66.67% / 55.56% | 66.67% / 55.56% | 44.44% / 36.11% | 42.22% / 33.89% | 0.00% / 0.00% |
| parse_claim | ar | 7 | 100.00% / 100.00% | 0.00% / 0.00% | 20.00% / 20.00% | 20.00% / 20.00% | 0.00% / 0.00% |
| parse_claim | en | 7 | 100.00% / 100.00% | 100.00% / 100.00% | 57.14% / 57.14% | 51.95% / 51.95% | 0.00% / 0.00% |
| parse_claim | mixed | 6 | 100.00% / 100.00% | 100.00% / 100.00% | 60.00% / 60.00% | 54.55% / 54.55% | 0.00% / 0.00% |
| parse_watch | ar | 7 | 100.00% / 100.00% | 14.29% / 14.29% | 50.00% / 50.00% | 50.00% / 50.00% | 0.00% / 0.00% |
| parse_watch | en | 7 | 100.00% / 100.00% | 57.14% / 57.14% | 59.52% / 59.52% | 59.52% / 59.52% | 0.00% / 0.00% |
| parse_watch | mixed | 6 | 100.00% / 100.00% | 66.67% / 66.67% | 61.11% / 61.11% | 61.11% / 61.11% | 0.00% / 0.00% |
| summarise_event | ar | 7 | 100.00% / 100.00% | 100.00% / 100.00% | 28.57% / 28.57% | 30.77% / 30.77% | 0.00% / 0.00% |
| summarise_event | en | 7 | 100.00% / 100.00% | 100.00% / 100.00% | 28.57% / 28.57% | 30.77% / 30.77% | 0.00% / 0.00% |
| summarise_event | mixed | 6 | 100.00% / 100.00% | 100.00% / 100.00% | 28.57% / 28.57% | 30.77% / 30.77% | 0.00% / 0.00% |
| understand_email | ar | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 25.00% / 25.00% | 32.54% / 32.54% | 0.00% / 0.00% |
| understand_email | en | 4 | 100.00% / 100.00% | 100.00% / 100.00% | 50.00% / 50.00% | 47.22% / 47.22% | 0.00% / 0.00% |
| understand_email | mixed | 3 | 100.00% / 100.00% | 100.00% / 100.00% | 46.67% / 46.67% | 46.30% / 46.30% | 0.00% / 0.00% |

## Classification confusion matrices

Labels are compared exactly against fixed schema enums; uppercase prose labels are failures. Both models produced the same matrix. Small class counts limit conclusions.

| Group | Gold → predicted | Count, base / CPT |
| --- | --- | ---: |
| all | awb -> None | 3 / 3 |
| all | bill_of_lading -> BILL OF LADING | 3 / 3 |
| all | delivery_order -> delivery_order | 1 / 1 |
| all | invoice -> invoice | 1 / 1 |
| all | packing_list -> packing_list | 3 / 3 |
| logistics/en | awb -> None | 2 / 2 |
| logistics/en | bill_of_lading -> BILL OF LADING | 2 / 2 |
| logistics/ar | awb -> None | 1 / 1 |
| logistics/ar | bill_of_lading -> BILL OF LADING | 1 / 1 |
| logistics/ar | packing_list -> packing_list | 2 / 2 |
| logistics/mixed | delivery_order -> delivery_order | 1 / 1 |
| logistics/mixed | invoice -> invoice | 1 / 1 |
| logistics/mixed | packing_list -> packing_list | 1 / 1 |

Raw predictions, producer checksums, training logs and comparison: `D:\models\adapters\cpt-20261013-172004`. The weights and fixture datasets are external-drive artifacts, never committed.

Rebuild this report without another model run:

```powershell
& D:\models\tools\ophanim-venv\Scripts\python.exe ml/scripts/report_cpt.py `
  --version cpt-20261013-172004 `
  --dataset "D:\models\datasets\v3-2026-10-10" `
  --corpus "D:\models\corpora\cpt-v1-2026-10-10"
```
