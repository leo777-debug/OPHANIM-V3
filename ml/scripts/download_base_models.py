"""Resumable, pinned Hub downloads into the external disk, with upstream hashes."""
import argparse
import json
import urllib.request
from model_store import root, register, reserve_destination, checksum

MAIN = 'Qwen/Qwen3-4B-Instruct-2507'
EMBED = 'Qwen/Qwen3-Embedding-0.6B'
GGUF = 'unsloth/Qwen3-4B-Instruct-2507-GGUF'


def download(repo, folder, selected=None, revision=None, extra_required_bytes=0):
    store = root()
    revision_path=f'/revision/{revision}' if revision else ''
    info = json.load(urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}{revision_path}?blobs=true', timeout=60))
    revision = info['sha']
    planned = []
    required_bytes = extra_required_bytes
    for item in info['siblings']:
        name = item['rfilename']
        if selected and name not in selected:
            continue
        if not selected and not name.endswith(('.safetensors', '.json', '.txt', '.model', '.jinja', 'LICENSE', 'README.md')):
            continue
        target, exists = reserve_destination(store, f'{folder}/{repo.replace("/", "--")}/{name}')
        size = item.get('lfs', {}).get('size', item.get('size'))
        if not exists:
            if size is None:
                raise RuntimeError(f'Upstream size missing for {name}; cannot check download space')
            required_bytes += size
        planned.append((item, target, exists))
    # Reserve the actual missing bytes plus checkpoint headroom, not a fixed
    # 20 GiB that cannot fit Kaggle's working volume even before downloading.
    root(required_bytes)
    print(f'Download plan: {required_bytes / 1024**3:.2f} GiB including reserved outputs', flush=True)
    from huggingface_hub import hf_hub_download
    for item, target, exists in planned:
        name = item['rfilename']
        if exists:
            print(f'Verified {target.name}', flush=True)
            continue
        # hf_hub_download verifies cache blobs and resumes interrupted downloads.
        downloaded = hf_hub_download(repo, name, revision=revision, local_dir=str(target.parents[len(__import__('pathlib').Path(name).parts)-1]))
        if str(target) != str(downloaded):
            raise RuntimeError('Unexpected Hub destination')
        expected = item.get('lfs', {}).get('sha256')
        if expected and checksum(target) != expected:
            raise RuntimeError(f'Upstream checksum mismatch: {name}')
        register(store, target, repo, revision, MAIN if repo == GGUF else repo, 'Apache-2.0', expected_sha256=expected)
        print(f'Registered {name}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--gguf-only', action='store_true')
    parser.add_argument('--helper', action='store_true')
    parser.add_argument('--base-revision',help='Exact training revision from base_revision.json for reproducible merge inputs')
    args = parser.parse_args()
    if args.gguf_only:
        download(GGUF, 'gguf', ['Qwen3-4B-Instruct-2507-Q4_K_M.gguf', 'README.md'])
    else:
        download(MAIN, 'base',revision=args.base_revision)
        download(EMBED, 'embeddings')
        if args.helper:
            download('Qwen/Qwen3-1.7B', 'base')
