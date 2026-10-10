# Founder runbook

The competition on **17 October 2026** uses a base model + RAG + prompts. Run full
training afterwards. No fine-tuned model is released until held-out gates pass.

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
& $env:OPHANIM_PYTHON -m pip install -r ml/requirements.txt
& $env:OPHANIM_PYTHON ml/scripts/download_base_models.py
```

The uncommitted .env may override OPHANIM_MODELS_DIR. Download scripts load that
setting only. No missing-drive fallback or model download to C: is allowed.
Use Python 3.11/3.12 for the full Kaggle stack. Windows CPU smoke can use a
supported CPU PyTorch wheel (the development run used Python 3.14 / torch 2.9.1).

3. Generate synthetic templates and the Kaggle input bundle:

```powershell
& $env:OPHANIM_PYTHON ml/scripts/generate_dataset.py --version v2-2026-10-10
& $env:OPHANIM_PYTHON ml/scripts/prepare_kaggle.py --dataset D:\models\datasets\v2-2026-10-10
```

Choose a NEW dataset version if one already exists; never overwrite a held-out
test. The generator excludes customer uploads. Verify DATA_CARD.md and the
synthetic-only bundle before uploading. All generated data is ignored by Git.

4. Create a Kaggle account, verify phone eligibility if requested, inspect current
   accelerator quota. Official [specifications](https://www.kaggle.com/docs/notebooks)
   describe P100 or dual T4 offerings, 12-hour CPU/GPU sessions and 20 GB saved
   output. Free availability and weekly quota vary by account; do not assume a
   fixed 30 hours or a larger GPU. This config uses ONE 16 GB GPU and fp16.
5. Upload the input zip as a **private Kaggle Dataset**. No customer files, personal
   data, consent proofs or production secrets. Import ml/kaggle/ophanim_qlora.ipynb,
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
10. Download the zip from Output onto D:\models\kaggle-downloads, or install the
    official `kaggle` Python package and use download_from_kaggle.py owner/notebook
    --version VERSION. Official credentials stay in ~/.kaggle/kaggle.json or Kaggle
    environment settings, never in this repo. The script rejects path traversal,
    unsafe archives, missing checksums and overwritten versions.
11. Release only if extraction accuracy, valid-JSON rate and not-found accuracy
    improve without higher hallucination, separately by mode and English/Arabic.
    Full training and held-out checks must complete. Otherwise keep base + RAG.
12. Merge/export on this 40 GB RAM CPU machine, with >=40 GiB free external disk:
    build_model.py --version VERSION --llama-cpp D:\models\tools\llama.cpp
    --quantizer D:\models\tools\llama.cpp\build\bin\Release\llama-quantize.exe
    --evaluation D:\models\adapters\VERSION\comparison.json.
    Pin a reviewed llama.cpp source revision; install its converter requirements
    into the external-drive Python environment. Exports are safetensors, F16 GGUF,
    Q4_K_M, Q5_K_M and Q8_0. Previous versions remain available.

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
