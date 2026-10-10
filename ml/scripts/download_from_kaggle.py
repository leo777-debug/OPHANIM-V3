"""Official Kaggle API; verify producer checksums and defend against zip slip."""
import argparse
import json
import zipfile
from model_store import root,inside,checksum,register

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('kernel',help='owner/notebook-slug');p.add_argument('--version',required=True);args=p.parse_args()
    store=root(6*1024**3);target=inside(store,f'kaggle-downloads/{args.version}')
    if target.exists():raise RuntimeError('Download version exists; choose a fresh version')
    target.mkdir(parents=True)
    from kaggle.api.kaggle_api_extended import KaggleApi
    api=KaggleApi();api.authenticate() # ~/.kaggle/kaggle.json or official environment credentials.
    api.kernels_output(args.kernel,path=str(target),force=False,quiet=False)
    zips=list(target.glob('*.zip'))
    if len(zips)!=1:raise RuntimeError('Notebook must produce one ophanim-output.zip')
    adapter=inside(store,f'adapters/{args.version}')
    if adapter.exists():raise RuntimeError('Adapter version exists; will not overwrite')
    with zipfile.ZipFile(zips[0]) as archive:
        members=archive.infolist()
        if sum(m.file_size for m in members)>6*1024**3:raise RuntimeError('Archive exceeds 6 GiB')
        for member in members:
            name=member.filename
            if name.startswith(('/','\\')) or '\\' in name or ':' in name or any(part in ('..','') for part in name.rstrip('/').split('/')) or (member.external_attr>>16)&0o170000==0o120000:raise RuntimeError('Unsafe archive path')
        if 'checksums.json' not in archive.namelist():raise RuntimeError('Producer checksums missing; partial outputs cannot be imported')
        expected=json.loads(archive.read('checksums.json'))
        actual={m.filename for m in members if not m.is_dir() and m.filename!='checksums.json'}
        if not isinstance(expected,dict) or set(expected)!=actual:raise RuntimeError('Missing or unexpected output files; incomplete archive')
        if len({m.filename for m in members})!=len(members):raise RuntimeError('Duplicate archive entries')
        adapter.mkdir(parents=True)
        for member in members:
            if member.is_dir():continue
            destination=inside(store,f'adapters/{args.version}/{member.filename}');destination.parent.mkdir(parents=True,exist_ok=True)
            if destination.exists():raise RuntimeError('Refusing overwrite')
            with archive.open(member) as source,destination.open('xb') as output:
                __import__('shutil').copyfileobj(source,output)
            if member.filename!='checksums.json' and (member.filename not in expected or checksum(destination)!=expected[member.filename]):raise RuntimeError('Producer checksum mismatch; do not load this adapter')
            register(store,destination,'ophanim-logistics',args.version,'Qwen/Qwen3-4B-Instruct-2507','Apache-2.0',expected_sha256=expected.get(member.filename))
    print(f'Checksummed adapter output imported into {adapter}; evaluation gate still applies.')
