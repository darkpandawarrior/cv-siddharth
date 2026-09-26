#!/usr/bin/env python3
"""Fetches CC0 Poly Haven *model* (gltf) source assets used by lookdev-spawn.py's
geometry-nodes scatter (fern/shrub/rock) and the brass diya lantern prop
(world-v2-spec.md §6). Sibling of scripts/world-v2/fetch-polyhaven.mjs, which
only fetches flat textures — models need their own endpoint shape
(api.polyhaven.com/files/<id>.gltf['1k']['gltf']) and write to
heavy/world/models/polyhaven/<id>/, gitignored the same way the texture webps
are (regenerable, not carried in git; see heavy/world/ASSETS.md for the CC0
attribution that IS carried).

Idempotent: skips any file that already exists on disk. Full-tree assets
(jacaranda_tree etc.) are deliberately not in this list — Poly Haven's
"geometry nodes" tagged trees bake a shared, resolution-independent .bin of
75-205 MB regardless of the requested texture resolution, wrong for both this
16 GB machine and a look-dev git commit. Background tree silhouettes are
built procedurally in lookdev-spawn.py instead, same discipline as the
spec's own banyan-neem.py/palm.py.

Run: python3 scripts/blender/world-v2/fetch-polyhaven-models.py
"""
import json
import os
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'heavy/world/models/polyhaven')
API = 'https://api.polyhaven.com/files/{}'
PAGE = 'https://polyhaven.com/a/{}'
UA = 'Mozilla/5.0 (agent-harness world-v2 lookdev fetch)'

MODELS = {
    'fern_02': 'near-field fern clumps, T1 scatter (spec §6)',
    'rock_moss_set_01': 'riverbank boulders, geo-nodes scatter (spec §6)',
    'shrub_01': 'undergrowth shrub, geo-nodes scatter (spec §5.6 lookdev)',
    'brass_diya_lantern': 'boat-bow + keystone lantern prop (spec §6)',
}


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    return urllib.request.urlopen(req, timeout=30)


def main():
    results = []
    for asset_id, use in MODELS.items():
        out_dir = os.path.join(OUT, asset_id)
        os.makedirs(out_dir, exist_ok=True)
        meta = json.load(fetch(API.format(asset_id)))
        entry = meta['gltf']['1k']['gltf']
        all_files = {**entry.get('include', {}), os.path.basename(entry['url']): entry}
        files = []
        for rel_path, f in all_files.items():
            dest = os.path.join(out_dir, rel_path)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            if not os.path.exists(dest):
                with fetch(f['url']) as resp, open(dest, 'wb') as out_fh:
                    out_fh.write(resp.read())
            files.append({'path': os.path.relpath(dest, ROOT), 'bytes': os.path.getsize(dest)})
        gltf_path = os.path.relpath(os.path.join(out_dir, os.path.basename(entry['url'])), ROOT)
        results.append({'id': asset_id, 'use': use, 'sourceUrl': PAGE.format(asset_id),
                         'licence': 'CC0', 'gltf': gltf_path, 'files': files})
        print(f'{asset_id}: {len(files)} files, {sum(f["bytes"] for f in files) / 1e6:.1f} MB')

    with open(os.path.join(OUT, 'manifest.json'), 'w') as fh:
        json.dump(results, fh, indent=2)
    print(f'MODELS_FETCHED count={len(results)}')


if __name__ == '__main__':
    main()
