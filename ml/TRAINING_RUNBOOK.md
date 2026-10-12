# Founder runbook

The competition on **17 October 2026** uses a base model + RAG + prompts until an
accepted trained release is available. The founder selected **continued pretraining of an existing
model**: unlabelled domain text, next-token prediction, QLoRA to fit 16 GB. This
differs from the original supervised task training plan. No trained model is
released until held-out gates pass. The original SFT scripts remain optional.

The private [Kaggle notebook](https://www.kaggle.com/code/leonardvk/ophanim-continued-pretraining)
already has [synthetic inputs v3](https://www.kaggle.com/datasets/leonardvk/ophanim-cpt-synthetic-inputs-v3-20261011)
attached. Kaggle automatically expands the uploaded ZIP; the corrected setup cell
supports expanded folders and an intact ZIP, verifies all hashes, and refuses unsafe
paths or replacement of different staged files. On 12 October phone verification
was confirmed, T4 ×2 and Internet were enabled, and the UI showed 30 GPU hours
remaining. The editor failed with `Firebase: Error (auth/internal-error)`; its
Save & Run All attempt did not create a GPU run. No full training job has started.
The official CLI is installed at `D:\models\tools\kaggle-venv`. Authentication
still reports missing local credentials; the founder confirmed none had been saved.
The official CLI OAuth approval page is open, awaiting the founder's approval of
the Kaggle SDK's `resources.admin` access. Use the API procedure below after approval.

1. Connect Leonard External Drive (D:), ideally USB 3. Existing files are preserved.
   Loading over USB is slower at startup; generation uses RAM after loading.
2. In PowerShell from the repository, configure the model root:

```powershell
$env:OPHANIM_MODELS_DIR='D:\models'
$env:HF_HOME=Join-Path $env:OPHANIM_MODELS_DIR 'hf-cache'
$env:OLLAMA_MODELS=Join-Path $env:OPHANIM_MODELS_DIR 'ollama'
[Environment]::SetEnvironmentVariable('OPHANIM_MODELS_DIR',$env:OPHANIM_MODELS_DIR,'User')
[Environment]::SetEnvironmentVariable('HF_HOME',$env:HF_HOME,'User')
[Environment]::SetEnvironmentVariable('OLLAMA_MODELS',$env:OLLAMA_MODELS,'User')
python -m venv D:\models\tools\ophanim-venv
$env:OPHANIM_PYTHON='D:\models\tools\ophanim-venv\Scripts\python.exe'
$env:PIP_CACHE_DIR='D:\models\tools\pip-cache'
& $env:OPHANIM_PYTHON -m pip install -r ml/requirements-cpu.txt
& $env:OPHANIM_PYTHON ml/scripts/download_base_models.py
```

The uncommitted .env may override OPHANIM_MODELS_DIR. Download scripts load that
setting only. No missing-drive fallback or model download to C: is allowed.
Use Python 3.11/3.12 for the full Kaggle stack. Windows CPU smoke can use a
supported CPU PyTorch wheel (the development run used Python 3.14 / torch 2.9.1).

3. Generate the unlabelled corpus and private CPT input bundle. The separate
   task dataset measures extraction/QA regression; it is NOT used for CPT loss:

```powershell
& $env:OPHANIM_PYTHON ml/scripts/generate_dataset.py --version v3-2026-10-10
& $env:OPHANIM_PYTHON ml/scripts/generate_pretraining_corpus.py --version cpt-v1-2026-10-10
& $env:OPHANIM_PYTHON ml/scripts/prepare_pretraining.py --corpus D:\models\corpora\cpt-v1-2026-10-10 --dataset D:\models\datasets\v3-2026-10-10 --version NEW_BUNDLE_VERSION
```

Choose a NEW dataset version if one already exists; never overwrite a held-out
test. The generator excludes customer uploads. Verify DATA_CARD.md and the
synthetic-only bundle before uploading. All generated data is ignored by Git.
The prepared final bundle is
`D:\models\kaggle-downloads\ophanim-cpt-cpt-v3-20261011\ophanim-cpt-input.zip`;
import `ml/kaggle/ophanim_continued_pretraining.ipynb`. The corpus has only 1,440
passages from a few procedural templates. It validates the pipeline; useful
production pretraining requires a more diverse licence-cleared corpus and the
held-out gates, not merely completing an epoch of this small bundle.

4. Create a Kaggle account, verify phone eligibility if requested, inspect current
   accelerator quota. Official [specifications](https://www.kaggle.com/docs/notebooks)
   describe P100 or dual T4 offerings, 12-hour CPU/GPU sessions and 20 GB saved
   output. Free availability and weekly quota vary by account; do not assume a
   fixed 30 hours or a larger GPU. This config uses ONE 16 GB GPU and fp16.
   Pinned [bitsandbytes 0.48.1](https://huggingface.co/docs/bitsandbytes/v0.48.1/en/installation)
   supports P100 NF4 with CUDA 11.8–12.6; the notebook installs torch's CUDA 12.4
   wheel. CUDA 12.8+ wheels omit Pascal, so do not substitute a newer CUDA build
   without checking compatibility. Base and adapter checksums are verified before
   loading; training and evaluation use registered local weights only.
5. Upload the input zip as a **private Kaggle Dataset**. No customer files, personal
   data, consent proofs or production secrets. Import ml/kaggle/ophanim_continued_pretraining.ipynb,
   attach that dataset, select GPU in Settings → Accelerator, turn Internet on
   for downloads. Optional HF_TOKEN goes in Kaggle Secrets. Qwen is ungated.
6. Run setup cells. Dependencies are pinned; CUDA 12.4 is intentional for P100.
   Use **Save Version → Save & Run All (Commit)** for background execution after
   closing your browser. Interactive idle sessions are not durable runs.
7. Training prints a time estimate after five optimizer steps. Target under six
   hours, never promise it before measurement. The callback stops beyond an
   estimated/actual 11-hour budget, leaving time for saving. Check peak GPU memory
   and the estimate; reduce dataset size/sequence length on a NEW training version
   if needed, keeping test unchanged. A run that stops early is not a completed model.
8. Adapter checkpoints save every 20 steps and at 30-minute boundaries, keeping
   three checkpoints in /kaggle/working/models/adapters/VERSION. Resume by attaching
   the previous output dataset and setting RESUME to its checkpoint directory.
   Always keep output private. A hard timeout may prevent the final zip; download
   the last checkpoint directory and logs from the saved version's Output tab.
9. The notebook runs base-versus-adapter held-out GPU generation after training,
   writes prediction files, comparison.json, REPORT.md and checksums, then creates
   /kaggle/working/ophanim-output.zip. Larger configured model evaluation runs
   separately using ml/eval/compare.py. Human review of summary/forecast meaning,
   citations, relevance and Arabic is required; exact match is only a proxy.
   The comparison names the adapted model `continued-pretrained`. Lower corpus
   loss/perplexity alone does not satisfy the task acceptance gate. This starter
   corpus is small and repetitive; a short successful run does not establish
   useful domain learning. Diversify licence-cleared procedural text and compare
   results before scaling. Live rules, schedules and disruptions stay in RAG.
10. Download the zip from Output onto D:\models\kaggle-downloads, or use the
    external-drive Kaggle environment and download_from_kaggle.py owner/notebook/RUN_NUMBER
    --version VERSION. VERSION must equal the adapter version printed in the notebook.
    The official CLI file filter downloads only `ophanim-output.zip`, excluding
    downloaded base weights and caches. Official credentials stay in
    ~/.kaggle/kaggle.json (legacy), ~/.kaggle/access_token, or Kaggle environment
    settings, never in this repo. The script rejects path traversal, unsafe archives,
    missing checksums and overwritten versions. Allow 12 GiB free for zip plus extraction.
11. Release only if extraction accuracy, valid-JSON rate and not-found accuracy
    improve without higher hallucination, separately by mode and English/Arabic.
    Full training and held-out checks must complete. Otherwise keep base + RAG.
12. Merge/export on this 40 GB RAM CPU machine, with >=40 GiB free external disk:
    First download the exact base_revision.json revision with
    download_base_models.py --base-revision REVISION into a fresh model store if
    the installed base revision differs; existing registered files are never replaced.
    build_model.py --version VERSION --llama-cpp D:\models\tools\llama.cpp
    --quantizer D:\models\tools\llama.cpp\build\bin\Release\llama-quantize.exe
    --evaluation D:\models\adapters\VERSION\comparison.json.
    Pin a reviewed llama.cpp source revision; install its converter requirements
    into the external-drive Python environment. Exports are safetensors, F16 GGUF,
    Q4_K_M, Q5_K_M and Q8_0. Previous versions remain available.

For API submission when the browser editor fails, use the isolated official
[Kaggle CLI](https://github.com/Kaggle/kaggle-cli/blob/main/docs/kernels.md).
Its [authentication instructions](https://github.com/Kaggle/kaggle-cli/blob/main/docs/README.md#authentication)
support a token in `C:\Users\Leonard\.kaggle\access_token`, legacy
`C:\Users\Leonard\.kaggle\kaggle.json`, or `KAGGLE_API_TOKEN`. Set credentials
locally; never paste tokens in chat or commit them. Alternatively, run
`D:\models\tools\kaggle-venv\Scripts\python.exe -m kaggle auth login` and
approve the official Kaggle SDK in the browser. This creates persistent CLI access
with the SDK's default `resources.admin` scope; review that permission yourself.
The official flow saves credentials locally and prints only a sign-in confirmation.
No manually copied token is needed. Keep the command running until the browser
redirects to localhost and the command confirms login. Access can be revoked in
Kaggle Account Settings. A custom legacy credential directory can be selected
with `KAGGLE_CONFIG_DIR`.

```powershell
$env:PIP_CACHE_DIR='D:\models\tools\pip-cache'
python -m venv D:\models\tools\kaggle-venv # Only when it does not already exist.
$taskKagglePython='D:\models\tools\kaggle-venv\Scripts\python.exe'
& $taskKagglePython -m pip install -r ml/requirements-kaggle.txt
& $env:OPHANIM_PYTHON ml/scripts/prepare_kaggle_submission.py --kernel leonardvk/ophanim-continued-pretraining --dataset leonardvk/ophanim-cpt-synthetic-inputs-v3-20261011 --version NEW_SUBMISSION_VERSION
& $taskKagglePython -m kaggle kernels status leonardvk/ophanim-continued-pretraining
```

After authentication succeeds, check that there is no existing active run before
pushing once. The prepared folder already exists at
`D:\models\kaggle-downloads\submission-cpt-v5-20261012-api`. It is a local,
checksummed submission, **not a launched job**. Metadata keeps the notebook private
and attaches only the private synthetic dataset. The notebook pins base revision
`cdbee75f17c01a7cc42f958dc650907174af0554`. T4 ×2 is the allocation name;
`CUDA_VISIBLE_DEVICES=0` restricts training to one GPU. A failed evaluation preserves
the adapter and writes `evaluation_failure.json`; it cannot establish acceptance.

```powershell
& $taskKagglePython -m kaggle kernels push --path D:\models\kaggle-downloads\submission-cpt-v5-20261012-api --accelerator NvidiaTeslaT4 --timeout 43200
& $taskKagglePython -m kaggle kernels status leonardvk/ophanim-continued-pretraining/RUN_NUMBER
& $taskKagglePython ml/scripts/download_from_kaggle.py leonardvk/ophanim-continued-pretraining/RUN_NUMBER --version ADAPTER_VERSION_FROM_LOG
```

Confirm the API response and run number before claiming submission. Check the
notebook logs for actual GPU, peak memory, epoch estimate and completion; download
only after outputs are available. The 12-hour cap is a limit, not a measured runtime.

Start a NEW Ollama daemon from a shell with OLLAMA_MODELS set (quit the existing
tray daemon first, if it uses another directory). `ollama serve`, then in another
configured shell `ollama create ophanim-logistics:VERSION -f MODELPATH` or the
build script. A client environment cannot relocate an already running daemon.
Use `ollama run ophanim-logistics:VERSION`. The endpoint is
http://localhost:11434/v1. Configure OPHANIM_LOCAL_MODEL and OPHANIM_MODEL_FILE
to this version's manifest path; AI SETUP shows path/version/checksum status.
If unplugged, configured fallback is used; choosing only the local preset needs
another configured fallback or no-AI source search.

Benchmark with ml/scripts/benchmark.py --llama-bench PATH, both CPU and Vulkan.
Current i5-8350U measurements are below the 8 tok/s gate; see final report. Lower
sequence/context sizes may help prompt latency, but do not claim faster generation
without measurement. Optional 1.7B helper requires its own quality evaluation.

Cloud backup: use ml/scripts/cloud_gpu.sh on a 16–24 GB CUDA GPU with a mounted
model volume. Planning estimate 3–6 GPU hours is unverified. At an illustrative
$0.50/hour, that is $1.50–$3 plus storage/network; this is a budget formula,
not a current provider quote. Set a spending/session cap and verify a live rate
before renting. No paid GPU was rented during development.

For a bounded local test on the **real 4B weights**, after the complete base
download and checksum registration:

```powershell
& $env:OPHANIM_PYTHON ml/scripts/pretrain.py --corpus D:\models\corpora\cpt-v1-2026-10-10 --version cpt-cpu-smoke-NEWVERSION --cpu-smoke --steps 2
```

This produces a real adapter under D:\models\adapters and records the base
revision, corpus hashes, loss, perplexity and measured adapter parameter change.
It is explicitly `smoke_only`, cannot pass the export release gate, and is not a
production model. The earlier `train.py --smoke` uses a random toy fixture;
do not confuse that older test with continued pretraining of Qwen.
The completed real-base test is `cpt-cpu-smoke-20261011-real4b`: two steps,
64 tokens, 104.88 seconds. See its external-drive `run_metrics.json` and FINAL_REPORT.md.

Local CPU embeddings can run without Ollama or Docker:

```powershell
& $env:OPHANIM_PYTHON ml/scripts/embedding_server.py
```

Set EMBEDDING_BASE_URL=http://127.0.0.1:18081/v1,
EMBEDDING_MODEL=Qwen/Qwen3-Embedding-0.6B, and allow the origin
http://127.0.0.1:18081 in AI_LOCAL_BASE_URLS. It loads only verified weights from
the external disk, never downloads at startup, and returns 1024-dimensional
vectors. Non-loopback hosting requires EMBEDDING_API_KEY. It is a single-request
CPU server; size production capacity separately.
