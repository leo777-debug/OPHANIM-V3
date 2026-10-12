"""Stage verified private inputs whether Kaggle kept or expanded the ZIP."""
import hashlib
import json
import zipfile
from pathlib import Path


def stage_inputs(input_root, output_root):
    inputs = Path(input_root)
    output = Path(output_root).resolve()
    archives = list(inputs.rglob('ophanim-cpt-input.zip'))
    manifests = list(inputs.rglob('bundle_manifest.json'))
    if len(archives) == 1 and not manifests:
        with zipfile.ZipFile(archives[0]) as archive:
            names = archive.namelist()
            if len(names) != len(set(names)):
                raise RuntimeError('Duplicate archive entries')
            checks = json.loads(archive.read('bundle_manifest.json'))
            if set(checks) != set(names) - {'bundle_manifest.json'}:
                raise RuntimeError('Incomplete bundle')
            payload = {name: archive.read(name) for name in checks}
        source = str(archives[0]); form = 'zip'
    elif not archives and len(manifests) == 1:
        # Kaggle's dataset uploader automatically expands ZIP archives.
        folder = manifests[0].parent.resolve()
        checks = json.loads(manifests[0].read_text(encoding='utf-8'))
        payload = {}
        for name in checks:
            file = (folder / name).resolve()
            if not file.is_relative_to(folder) or file == folder or chr(92) in name or ':' in name:
                raise RuntimeError('Unsafe input path')
            payload[name] = file.read_bytes()
        source = str(folder); form = 'expanded'
    else:
        raise RuntimeError('Attach exactly one private Ophanim CPT input dataset')

    # Validate the entire bundle before writing or executing any input code.
    for name, data in payload.items():
        target = (output / name).resolve()
        if not target.is_relative_to(output) or target == output or chr(92) in name or ':' in name:
            raise RuntimeError('Unsafe input path')
        if hashlib.sha256(data).hexdigest() != checks[name]:
            raise RuntimeError(f'Corrupted input: {name}')
        if target.exists() and target.read_bytes() != data:
            raise RuntimeError(f'Refusing to replace different staged input: {name}')
    for name, data in payload.items():
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_bytes(data)
    return {'input': source, 'form': form, 'verified_files': len(payload)}
