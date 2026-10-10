# Model selection — 10 October 2026

Provisional main: **Qwen/Qwen3-4B-Instruct-2507**. Backup:
**microsoft/Phi-4-mini-instruct**. Optional helper: Qwen/Qwen3-1.7B,
non-thinking mode. No production adapter has been accepted. Continued pretraining
is now the founder's selected objective; CPU smoke artifacts are pipeline tests.

Skills are trained; facts come from retrieved sources. Selection is provisional
until the 16 GB GPU memory/time trial and outstanding quality/hardware gates pass.
The completed CPU test failed the speed gate. Unknown measurements below are
deliberately not fabricated scores; only Qwen3 was run locally.

| Candidate | Commercial fine-tuning licence | English / Arabic evidence | Native context | Strict JSON | CPU tok/s, 8-core | 50-case score |
| --- | --- | --- | --- | --- | --- | --- |
| [Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) | Apache-2.0; retain licence, notices, identify changes | Extraction field exact EN/AR 100% in tiny sample; wider quality unproven | 262,144 | JSON 100%; see corrected nested schema score in REPORT | 4.51 on founder's 4-core CPU; 8-core unmeasured | Extraction 99.3%; grounded QA 0/5 supported; see REPORT |
| [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B) | Apache-2.0 | 201 languages/dialects advertised; unmeasured locally | 262,144 | Unmeasured | Unmeasured | Unmeasured |
| [Phi-4-mini-instruct](https://huggingface.co/microsoft/Phi-4-mini-instruct) | MIT; retain copyright/licence | Multilingual including Arabic; unmeasured locally | 131,072 | Function-calling training; unmeasured | Unmeasured | Unmeasured |
| [Llama-3.2-3B-Instruct](https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct) | Llama 3.2 Community Licence + AUP; attribution, naming, large-user restrictions | English supported; Arabic outside eight officially supported languages | 131,072 | Unmeasured | Unmeasured | Unmeasured |
| [Gemma-3-4b-it](https://huggingface.co/google/gemma-3-4b-it) | Gemma terms + prohibited use policy; redistribution duties, gated | 140+ languages advertised; Arabic unmeasured | 131,072 | Unmeasured | Unmeasured | Unmeasured |
| [Gemma 4 E4B](https://ai.google.dev/gemma/docs/core/model_card_4) | Apache-2.0; newer permissive generation | Multilingual advertised; unmeasured locally | 131,072 | Unmeasured | Unmeasured | Excluded: 4.5B effective, **8B total** including embeddings |

Qwen3.5 is newer, but its hybrid multimodal architecture adds training and export
compatibility work. The text-only Qwen3 main has a straightforward QLoRA / GGUF
path and permissive terms. Phi provides a different architecture under MIT if
Qwen fails. No model is claimed to meet the speed or training constraints yet.
Gemma 4 was checked on 11 October: E4B is not a 4B-total model; E2B likewise has
5.1B total parameters. Both exceed this request's total-parameter cap despite
their effective-compute names. They were not downloaded or selected.
Main continued pretraining starts at 512 tokens (optional SFT at 1,024), rank 8,
batch 1, accumulation 16, fp16,
NF4 double quantisation and checkpointing; serving context is independently 8k.

The actual founder CPU is i5-8350U: **4 physical cores / 8 logical threads**,
Intel UHD 620. Benchmark both 4 and 8 threads and Vulkan offload; this is not a
typical eight-core CPU. A Vulkan build alone does not prove driver/device support.
Use `ml/scripts/benchmark.py`; report cold load separately from generation.
The existing external-drive models are user-owned and are not silently adopted.
Measured Qwen3 Q4_K_M with llama.cpp b11541: CPU 4 threads 4.51 tok/s,
CPU 8 threads 4.45 tok/s; Vulkan full offload 3.90 tok/s (about 13.5% slower
than CPU 4 threads). 64-token generation, two repeats, short context. UHD 620
is detected by Vulkan, but **the main model fails the >=8 tok/s gate** on this
machine. This provisional choice is not an accepted hardware-qualified model.
Raw benchmark files are in D:\models\eval. Long RAG prompts also add prefill
latency. Rebenchmark after thermal/power changes and with realistic 8k context.

Embedding: [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B),
Apache-2.0, 100+ languages, 32k context, up to 1,024 dimensions. The index uses
1,024 dimensions and keeps embedding model identity to prevent mixed spaces.

Sources checked on 10 October 2026: linked publisher model cards and licences;
[Kaggle notebook specifications](https://www.kaggle.com/docs/notebooks) document
12-hour CPU/GPU sessions, 20 GB saved output, P100 or dual T4 options. Weekly GPU
allocation is account-dependent: check the account's accelerator quota display.
The design uses one 16 GB GPU, never assumes both T4s or bf16. Training time and
memory remain an acceptance gate requiring a real Kaggle run after 17 October.
