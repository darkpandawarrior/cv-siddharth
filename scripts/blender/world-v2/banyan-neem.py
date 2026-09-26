"""World v2 hero banyan (world-v2-spec.md §6): a space-colonisation trunk
and branch skeleton merged with tapered aerial-root curves, plus two smaller
neem trunks grown by the same algorithm at a smaller scale. Budget: 30k tris
/ 700 KB for the whole banyan-neem.glb (banyan + both neem trees). Canopy
foliage is NOT baked here -- world-v2-spec.md §7 puts instanced cross-cards
(this lane's foliage-atlas.py texture) on the runtime side (P3-01b), so this
script only exports bark geometry plus the socket the atlas system needs.

Algorithm (classic space colonisation, Runions et al. 2007): grow a straight
trunk stem up to the canopy floor, then scatter attraction points through a
half-ellipsoid canopy volume and let the skeleton grow toward them one fixed
step at a time, killing attractors it gets close enough to. Deterministic:
every random draw comes from a locally seeded random.Random, never the
global `random` module, so two runs of this script produce the identical
skeleton and (after `canonical_order`) an identical exported GLB.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python banyan-neem.py
"""
from pathlib import Path
import math
import random
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'banyan-neem'
sh.clear_scene()
bark = sh.pbr('mat.bark')

# --- vector helpers (plain tuples; bpy's Vector would work too, but tuples
# keep this testable with a bare `python3` outside Blender). ---


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _scale(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def _length(a):
    return math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])


def _normalize(a):
    length = _length(a)
    return (0.0, 0.0, 0.0) if length < 1e-9 else _scale(a, 1.0 / length)


def _dist(a, b):
    return _length(_sub(a, b))


def grow_tree(base, trunk_top_z, canopy_center, canopy_rxy, canopy_h,
              n_attractors, step, influence_r, kill_r, max_iters, seed,
              trunk_step=0.4):
    """Returns a list of {'pos': (x, y, z), 'parent': int|None} nodes: a
    straight trunk stem from `base` to `trunk_top_z`, then space-colonisation
    branches toward `n_attractors` points scattered through a half-ellipsoid
    dome (canopy_center is the dome's flat base, not its centroid)."""
    nodes = [{'pos': base, 'parent': None}]
    z = base[2]
    while z < trunk_top_z:
        z = min(z + trunk_step, trunk_top_z)
        nodes.append({'pos': (base[0], base[1], z), 'parent': len(nodes) - 1})

    rng = random.Random(seed)
    attractors = []
    while len(attractors) < n_attractors:
        x, y, zz = rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0, 1)
        if x * x + y * y + zz * zz <= 1.0:
            attractors.append((canopy_center[0] + x * canopy_rxy,
                                canopy_center[1] + y * canopy_rxy,
                                canopy_center[2] + zz * canopy_h))

    for _ in range(max_iters):
        if not attractors:
            break
        growth = {}
        for a in attractors:
            best_i, best_d = None, influence_r
            for ni, n in enumerate(nodes):
                d = _dist(n['pos'], a)
                if d < best_d:
                    best_d, best_i = d, ni
            if best_i is not None:
                growth.setdefault(best_i, []).append(a)
        if not growth:
            break
        new_nodes = []
        for ni in sorted(growth.keys()):
            direction = (0.0, 0.0, 0.0)
            for a in growth[ni]:
                direction = _add(direction, _normalize(_sub(a, nodes[ni]['pos'])))
            direction = _normalize(direction)
            if direction == (0.0, 0.0, 0.0):
                continue
            new_nodes.append({'pos': _add(nodes[ni]['pos'], _scale(direction, step)), 'parent': ni})
        if not new_nodes:
            break
        nodes.extend(new_nodes)
        attractors = [a for a in attractors if all(_dist(a, nn['pos']) > kill_r for nn in new_nodes)]
    return nodes


def node_depths(nodes):
    depths = [0] * len(nodes)
    for i, n in enumerate(nodes):
        if n['parent'] is not None:
            depths[i] = depths[n['parent']] + 1
    return depths


def add_tube(bm, p0, p1, r0, r1, sides=6):
    """A capped tapered cylinder from p0 (radius r0) to p1 (radius r1),
    triangulated directly (no quads) so tri_estimate/inspect_asset counts
    match what actually exports. ponytail: each skeleton edge is its own
    disjoint segment (no shared ring at branch joints) -- a real pipe-model
    join is unnecessary polish for a background bark silhouette; upgrade to
    shared branch-joint rings if a close-up shot ever needs it."""
    direction = _normalize(_sub(p1, p0))
    if direction == (0.0, 0.0, 0.0):
        return
    up_ref = (1.0, 0.0, 0.0) if abs(direction[2]) > 0.999 else (0.0, 0.0, 1.0)
    right = _normalize(_cross(up_ref, direction))
    up = _cross(direction, right)

    ring0, ring1 = [], []
    for i in range(sides):
        theta = 2 * math.pi * i / sides
        c, s = math.cos(theta), math.sin(theta)
        offset = _add(_scale(right, c), _scale(up, s))
        ring0.append(bm.verts.new(_add(p0, _scale(offset, r0))))
        ring1.append(bm.verts.new(_add(p1, _scale(offset, r1))))

    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((ring0[i], ring0[j], ring1[j]))
        bm.faces.new((ring0[i], ring1[j], ring1[i]))

    c0 = bm.verts.new(p0)
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((c0, ring0[j], ring0[i]))
    c1 = bm.verts.new(p1)
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((c1, ring1[i], ring1[j]))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def add_skeleton_tubes(bm, nodes, base_r, decay, min_r, sides=6):
    depths = node_depths(nodes)
    for i, n in enumerate(nodes):
        if n['parent'] is None:
            continue
        p = nodes[n['parent']]
        r0 = max(min_r, base_r * (decay ** depths[n['parent']]))
        r1 = max(min_r, base_r * (decay ** depths[i]))
        add_tube(bm, p['pos'], n['pos'], r0, r1, sides=sides)


def pick_aerial_roots(nodes, canopy_floor_z, trunk_radius_xy, count):
    """Outer, upper-canopy branch tips (real aerial roots drop from the
    horizontal outer branches, not the trunk) picked deterministically by
    sorting on angle around the trunk axis and taking an even stride, so the
    roots ring the canopy instead of clustering wherever growth happened to
    reach first."""
    candidates = [i for i, n in enumerate(nodes)
                  if n['pos'][2] > canopy_floor_z and math.hypot(n['pos'][0], n['pos'][1]) > trunk_radius_xy]
    candidates.sort(key=lambda i: math.atan2(nodes[i]['pos'][1], nodes[i]['pos'][0]))
    if not candidates:
        return []
    stride = max(1, len(candidates) // count)
    return candidates[::stride][:count]


def add_aerial_root(bm, top, idx, base_r=0.045, tip_r=0.032, sides=4, segments=3):
    """A thin tapered curve from a canopy branch point straight down to the
    ground, with a small deterministic sideways bow (a function of `idx`,
    not a further RNG draw, so the whole skeleton stays reproducible from
    one seed) -- real banyan roots sway slightly, they never hang plumb."""
    ground = (top[0], top[1], 0.0)
    bow = (0.09 * math.sin(idx * 1.7), 0.09 * math.cos(idx * 1.7), 0.0)
    points = []
    for s in range(segments + 1):
        t = s / segments
        bow_scale = math.sin(math.pi * t)
        pos = (
            top[0] + (ground[0] - top[0]) * t + bow[0] * bow_scale,
            top[1] + (ground[1] - top[1]) * t + bow[1] * bow_scale,
            top[2] + (ground[2] - top[2]) * t,
        )
        points.append(pos)
    for s in range(segments):
        t0, t1 = s / segments, (s + 1) / segments
        r0 = base_r + (tip_r - base_r) * t0
        r1 = base_r + (tip_r - base_r) * t1
        add_tube(bm, points[s], points[s + 1], r0, r1, sides=sides)


# --- Banyan: trunk to z=6.0, canopy dome to z~8.5, radius decaying from a
# 0.22 m trunk. ---
banyan_nodes = grow_tree(
    base=(0.0, 0.0, 0.0), trunk_top_z=6.0, canopy_center=(0.0, 0.0, 6.0),
    canopy_rxy=3.2, canopy_h=2.5, n_attractors=150, step=0.35,
    influence_r=1.6, kill_r=0.45, max_iters=70, seed=20260924, trunk_step=0.4,
)

bm = bmesh.new()
add_skeleton_tubes(bm, banyan_nodes, base_r=0.22, decay=0.955, min_r=0.02)
root_indices = pick_aerial_roots(banyan_nodes, canopy_floor_z=6.0, trunk_radius_xy=1.2, count=8)
for idx, ni in enumerate(root_indices):
    add_aerial_root(bm, banyan_nodes[ni]['pos'], idx)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm = sh.canonical_order(bm)
banyan_obj = sh.new_mesh_object('BanyanTrunk', bm, bark)

# --- Two neem trunks, same algorithm at neem scale, planted either side of
# the banyan; single-digit suffixes are a fixed count of 2, never a data
# count (kitSockets.nature.test.ts's DATA_COUNT_SUFFIX guard). ---
NEEM_PLANTS = [
    {'origin': (-3.6, 2.0, 0.0), 'seed': 314159},
    {'origin': (3.1, -2.3, 0.0), 'seed': 271828},
]
for i, plant in enumerate(NEEM_PLANTS):
    ox, oy, _ = plant['origin']
    neem_nodes = grow_tree(
        base=(ox, oy, 0.0), trunk_top_z=3.0, canopy_center=(ox, oy, 3.0),
        canopy_rxy=1.3, canopy_h=1.2, n_attractors=70, step=0.3, influence_r=1.2,
        kill_r=0.35, max_iters=55, seed=plant['seed'], trunk_step=0.3,
    )
    nbm = bmesh.new()
    add_skeleton_tubes(nbm, neem_nodes, base_r=0.12, decay=0.94, min_r=0.015)
    bmesh.ops.recalc_face_normals(nbm, faces=nbm.faces)
    nbm = sh.canonical_order(nbm)
    sh.new_mesh_object(f'NeemTrunk.{i}', nbm, bark)

kit_objects = [obj for obj in bpy.context.collection.objects]
sh.export_kit(ID, kit_objects)


def pack_glb(path):
    """Pinned npx gltfpack@1.2.0 (house pattern, M68; _shared.py is frozen,
    so this is duplicated per-script like template-gomukh.py's helper)."""
    path = Path(path)
    tmp = path.with_suffix('.tmp.glb')
    subprocess.run(['npx', '-y', 'gltfpack@1.2.0', '-cc', '-kn', '-i', str(path), '-o', str(tmp)], check=True)
    tmp.replace(path)


pack_glb(sh.MODELS_OUT / f'{ID}.glb')
print(f'{ID.upper().replace("-", "_")}_PACKED nodes_banyan={len(banyan_nodes)}')
