"""External-drive artifact store. No fallback, path escape or untracked overwrite."""
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from filelock import FileLock

FOLDERS = ('base', 'embeddings', 'hf-cache', 'adapters', 'merged', 'gguf', 'ollama', 'kaggle-downloads', 'eval', 'tools', 'corpora')


def manifest_lock(store):
    return FileLock(str(store / 'manifest.json.lock'), timeout=60, is_singleton=True)


def root(required_bytes=0):
    # Read only this setting from local env; never print or rewrite secrets.
    if 'OPHANIM_MODELS_DIR' not in os.environ:
        repo = Path(__file__).resolve().parents[2]
        for name in ('.env', '.env.local'):
            file = repo / name
            if file.exists():
                for line in file.read_text(encoding='utf-8-sig').splitlines():
                    if line.startswith('OPHANIM_MODELS_DIR='):
                        os.environ['OPHANIM_MODELS_DIR'] = line.split('=', 1)[1].strip().strip('"\'')
    target = Path(os.environ.get('OPHANIM_MODELS_DIR', r'D:\models')).resolve()
    if not target.anchor or not Path(target.anchor).exists():
        raise RuntimeError(f'Model drive not found at {target}')
    if os.name != 'nt' and 'OPHANIM_MODELS_DIR' not in os.environ:
        raise RuntimeError('Set OPHANIM_MODELS_DIR to an absolute mounted model volume on Linux.')
    if os.name == 'nt' and target.drive.lower() == 'c:':
        raise RuntimeError('Model storage on C: is disabled; choose the external model disk.')
    target.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(target).free < required_bytes + 512 * 1024**2:
        raise RuntimeError(f'Insufficient free space at {target}; need {required_bytes / 1024**3:.1f} GiB plus 512 MiB reserve.')
    for name in FOLDERS:
        (target / name).mkdir(exist_ok=True)
    os.environ.update(HF_HOME=str(target / 'hf-cache'), HF_HUB_CACHE=str(target / 'hf-cache' / 'hub'),
                      HF_XET_CACHE=str(target / 'hf-cache' / 'xet'), OLLAMA_MODELS=str(target / 'ollama'))
    return target


def inside(store, relative):
    value = (store / relative).resolve()
    if value == store or not value.is_relative_to(store) or value.is_symlink():
        raise ValueError('Artifact path must stay within the model disk.')
    return value


def checksum(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024**2), b''):
            digest.update(block)
    return digest.hexdigest()


def manifest(store):
    file = store / 'manifest.json'
    return json.loads(file.read_text(encoding='utf-8')) if file.exists() else {'schema_version': 1, 'files': []}


def save_manifest(store, data):
    with manifest_lock(store):
        temp = store / 'manifest.json.tmp'
        temp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
        temp.replace(store / 'manifest.json')


def register(store, file, name, version, base_model, licence, eval_scores=None, expected_sha256=None):
    file = inside(store, file.relative_to(store))
    actual = checksum(file)
    if expected_sha256 and actual != expected_sha256:
        raise RuntimeError(f'Checksum mismatch: {file.name}')
    with manifest_lock(store):
        data = manifest(store)
        relative = file.relative_to(store).as_posix()
        data['files'] = [f for f in data['files'] if f['path'] != relative]
        data['files'].append(dict(path=relative, name=name, version=version, base_model=base_model, licence=licence,
                                  sha256=actual, size=file.stat().st_size, date=datetime.now(timezone.utc).isoformat(), eval_scores=eval_scores or {}))
        save_manifest(store, data)


def verify(store, relative):
    entry = next((f for f in manifest(store)['files'] if f['path'] == relative), None)
    if not entry or checksum(inside(store, relative)) != entry['sha256']:
        raise RuntimeError(f'Unregistered, partial or corrupted model: {relative}')
    return inside(store, relative)


def reserve_destination(store, relative):
    target = inside(store, relative)
    if target.exists():
        verify(store, relative)  # Existing untracked files are never adopted or overwritten.
        return target, True
    target.parent.mkdir(parents=True, exist_ok=True)
    return target, False
