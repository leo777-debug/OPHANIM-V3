"""List/remove only checksummed, manifest-owned files; keep rollback version."""
import argparse
import json
from model_store import root,manifest,inside,verify,save_manifest

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('command',choices=['list','verify','remove']);p.add_argument('--version');args=p.parse_args()
    store=root();data=manifest(store)
    if args.command=='list':
        print(json.dumps(data,indent=2));raise SystemExit
    entries=[f for f in data['files'] if not args.version or f['version']==args.version]
    if args.command=='verify':
        for file in entries:verify(store,file['path']);print(f'Verified {file["path"]}')
    else:
        if not args.version:raise RuntimeError('--version required for deletion')
        deployed=[f for f in data['files'] if f['name']=='ophanim-logistics']
        retained_versions={f['version'] for f in deployed if f['version']!=args.version}
        if any(f['name']=='ophanim-logistics' for f in entries) and len(retained_versions)<2:raise RuntimeError('Keep at least the current and previous deployed versions before removing another')
        if not entries:raise RuntimeError('Version not present in manifest')
        for entry in entries:verify(store,entry['path'])
        for entry in entries:inside(store,entry['path']).unlink() # Never recursive-delete directories/untracked siblings.
        paths={f['path'] for f in entries};data['files']=[f for f in data['files'] if f['path'] not in paths];save_manifest(store,data)
        print(f'Removed {len(entries)} registered files; untracked files retained.')
