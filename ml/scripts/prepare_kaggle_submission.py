"""Stage a private CPT notebook for the official CLI; no credentials or auto-launch."""
import argparse
import json
import re
import hashlib
import zipfile
from pathlib import Path
from model_store import root, inside, register, verify
from prepare_pretraining import notebook, BASE_REVISION


def prepare(kernel, dataset, version, bundle):
    for value in (kernel, dataset):
        if not re.fullmatch(r'[A-Za-z0-9_-]+/[A-Za-z0-9_-]+', value):
            raise ValueError('Expected owner/slug for the notebook and private dataset')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', version):
        raise ValueError('Use a simple new submission version')
    store = root(10 * 1024**2)
    bundle = Path(bundle).resolve()
    bundle = verify(store, bundle.relative_to(store).as_posix())
    with zipfile.ZipFile(bundle) as archive:
        expected_manifest_sha256 = hashlib.sha256(archive.read('bundle_manifest.json')).hexdigest()
    target = inside(store, f'kaggle-downloads/submission-{version}')
    if target.exists():
        raise RuntimeError('Submission version exists; choose a new version')
    target.mkdir()
    code_file = 'ophanim_continued_pretraining.ipynb'
    metadata = dict(id=kernel, code_file=code_file, language='python',
                    kernel_type='notebook', is_private=True, enable_gpu=True,
                    enable_internet=True, machine_shape='NvidiaTeslaT4',
                    dataset_sources=[dataset], competition_sources=[],
                    kernel_sources=[], model_sources=[])
    files = {code_file: notebook(expected_manifest_sha256), 'kernel-metadata.json': metadata,
             'submission.json': dict(kernel=kernel, dataset=dataset,
                                     base_revision=BASE_REVISION,
                                     input_manifest_sha256=expected_manifest_sha256,
                                     uses_one_gpu=True, submitted=False)}
    for name, data in files.items():
        file = target / name
        file.write_text(json.dumps(data, indent=2), encoding='utf-8')
        register(store, file, 'ophanim-cpt-submission', version,
                 'Qwen/Qwen3-4B-Instruct-2507', 'MIT / Apache-2.0')
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kernel', required=True)
    parser.add_argument('--dataset', required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--bundle', required=True, help='Registered private input ZIP on the external model disk')
    args = parser.parse_args()
    print(prepare(args.kernel, args.dataset, args.version, args.bundle))
