"""Official Kaggle API; verify producer checksums and defend against zip slip."""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import zipfile
import uuid
from model_store import root,inside,checksum,register


def require_run(kernel, current_version):
    parts=kernel.split('/')
    if len(parts)==3 and int(parts[2])!=current_version:
        raise RuntimeError('The installed Kaggle CLI reads latest outputs; requested run is no longer latest')
    return '/'.join(parts[:2])


def current_run(api, kernel):
    from kagglesdk.kernels.types.kernels_api_service import ApiGetKernelRequest
    with api.build_kaggle_client() as client:
        request=ApiGetKernelRequest();request.user_name,request.kernel_slug=kernel.split('/')
        metadata=client.kernels.kernels_api_client.get_kernel(request).metadata
    if not metadata.is_private:raise RuntimeError('Expected the private training notebook')
    return metadata.current_version_number


def validate_archive(archive,version):
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
    # Verify every member before creating any adapter directory.
    for name in actual:
        digest=hashlib.sha256()
        with archive.open(name) as source:
            for block in iter(lambda:source.read(1024**2),b''):digest.update(block)
        if digest.hexdigest()!=expected[name]:raise RuntimeError('Producer checksum mismatch; do not import this adapter')
    if 'comparison.json' in actual and json.loads(archive.read('comparison.json')).get('adapter_version')!=version:raise RuntimeError('Download version must match the notebook adapter version')
    return members,expected


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('kernel',help='owner/notebook-slug');p.add_argument('--version',required=True);args=p.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_-]+/[A-Za-z0-9_-]+(?:/[0-9]+)?',args.kernel):raise ValueError('Expected owner/notebook-slug[/run-number]')
    if not re.fullmatch(r'[A-Za-z0-9_-]+',args.version):raise ValueError('Use a simple adapter version')
    store=root(12*1024**3)
    adapter=inside(store,f'adapters/{args.version}')
    if adapter.exists():raise RuntimeError('Adapter version exists; will not overwrite')
    from kaggle.api.kaggle_api_extended import KaggleApi
    api=KaggleApi();api.authenticate()
    kernel='/'.join(args.kernel.split('/')[:2]);run=current_run(api,kernel)
    require_run(args.kernel,run)
    if str(api.kernels_status(kernel).status).endswith(('.QUEUED','.RUNNING')):raise RuntimeError('Notebook is still active; wait for published outputs')
    # A retry uses a fresh attempt directory, preserving any partial download.
    target=inside(store,f'kaggle-downloads/{args.version}/attempt-{uuid.uuid4().hex[:12]}')
    target.mkdir(parents=True)
    # Use the official CLI's file filter to download only the adapter bundle,
    # never the multi-GB base/cache outputs.
    subprocess.run([sys.executable,'-m','kaggle','kernels','output',kernel,
                    '--path',str(target),'--file-pattern',r'(^|/)ophanim-output\.zip$'],
                   env={**os.environ,'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8'},check=True)
    if current_run(api,kernel)!=run:raise RuntimeError('Notebook version changed during download; do not import')
    zips=list(target.glob('*.zip'))
    if len(zips)!=1:raise RuntimeError('Notebook must produce one ophanim-output.zip')
    with zipfile.ZipFile(zips[0]) as archive:
        members,expected=validate_archive(archive,args.version)
        scores={}
        for filename,label in (('run_metrics.json','training'),('comparison.json','evaluation')):
            if filename in expected:scores[label]=json.loads(archive.read(filename))
        adapter.mkdir(parents=True)
        for member in members:
            if member.is_dir():continue
            destination=inside(store,f'adapters/{args.version}/{member.filename}');destination.parent.mkdir(parents=True,exist_ok=True)
            if destination.exists():raise RuntimeError('Refusing overwrite')
            with archive.open(member) as source,destination.open('xb') as output:
                __import__('shutil').copyfileobj(source,output)
            if member.filename!='checksums.json' and (member.filename not in expected or checksum(destination)!=expected[member.filename]):raise RuntimeError('Producer checksum mismatch; do not load this adapter')
            register(store,destination,'ophanim-logistics',args.version,'Qwen/Qwen3-4B-Instruct-2507','Apache-2.0',eval_scores=scores,expected_sha256=expected.get(member.filename))
    register(store,zips[0],'ophanim-kaggle-output',args.version,'Qwen/Qwen3-4B-Instruct-2507','Apache-2.0',eval_scores=scores)
    print(f'Checksummed adapter output imported into {adapter}; evaluation gate still applies.')
