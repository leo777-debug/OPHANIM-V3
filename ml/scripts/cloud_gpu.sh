#!/usr/bin/env bash
set -euo pipefail
: "${OPHANIM_MODELS_DIR:?Set an absolute mounted GPU workspace volume}"
: "${OPHANIM_DATASET_DIR:?Set the synthetic private dataset directory}"
: "${OPHANIM_CORPUS_DIR:?Set the reviewed unlabelled CPT corpus directory}"
: "${OPHANIM_VERSION:?Choose a new adapter version}"
export HF_HOME="$OPHANIM_MODELS_DIR/hf-cache"
export OLLAMA_MODELS="$OPHANIM_MODELS_DIR/ollama"
python -m pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cu124
python -m pip install -r ml/requirements-training.txt
python ml/scripts/pretrain.py --corpus "$OPHANIM_CORPUS_DIR" --version "$OPHANIM_VERSION"
python ml/scripts/evaluate_gpu.py --dataset "$OPHANIM_DATASET_DIR" --corpus "$OPHANIM_CORPUS_DIR" --version "$OPHANIM_VERSION"
