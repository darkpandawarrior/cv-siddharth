"""Stepping stones (world-v2-spec.md landmark #14): one basalt or laterite
stone per merged upstream PR, crossing the river just above the bridge
(idea-atlas.md WORLD-14, master-plan.md#M15). Grouped by upstream org --
basalt for career-ops-hq, laterite for openMF -- ordered by merge date at
runtime; a repo merged into 3+ times gets a carved rim (M15's "recurrence
earns detail"), the rest sit in a per-org cairn. Open PRs render as a
separate submerged-stone form, visible but not walkable (M15).

Kit, not a baked assembly (spec section 0.3 rule 2): four stone prototypes,
never a per-PR count. The runtime scatters/orders instances of these along
the flow map; nothing here encodes how many PRs there are.
  - StoneBasalt:    a merged-PR stone, career-ops-hq org.
  - StoneLaterite:  a merged-PR stone, openMF org.
  - CairnStone:     the smaller per-org overflow stone (curated rows are
                     itemised individually as Basalt/Laterite; the rest
                     stack into a cairn, M15).
  - SubmergedStone: the open-PR form -- lower, flatter, half in the water.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python pr-stepping-stones.py
"""
from pathlib import Path
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'pr-stepping-stones'
sh.clear_scene()

# mat.basalt: not in the shared PBR table (_shared.py is frozen, M42) -- a
# dark, low-sheen volcanic stone, defined locally like sinc-p-baori's own
# one-off accents.
basalt = sh.material('mat.basalt', (.10, .10, .11), metal=0.0, rough=0.92)
laterite = sh.pbr('mat.laterite')


def stone_bm(half_w, half_d, height, top_shrink=0.82):
    """An irregular river-stone block: a rectangular footprint tapering
    slightly toward a flatter top, corners bevelled -- the same
    box-then-bevel vocabulary template-gomukh's GomukhHead uses."""
    bm = bmesh.new()
    tw, td = half_w * top_shrink, half_d * top_shrink
    v = [bm.verts.new(p) for p in (
        (-half_w, -half_d, 0), (half_w, -half_d, 0), (half_w, half_d, 0), (-half_w, half_d, 0),
        (-tw, -td, height), (tw, -td, height), (tw, td, height), (-tw, td, height))]
    bm.faces.new((v[0], v[1], v[2], v[3]))
    bm.faces.new((v[7], v[6], v[5], v[4]))
    bm.faces.new((v[0], v[4], v[5], v[1]))
    bm.faces.new((v[1], v[5], v[6], v[2]))
    bm.faces.new((v[2], v[6], v[7], v[3]))
    bm.faces.new((v[3], v[7], v[4], v[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges if e.is_boundary], offset=0.02, segments=2, affect='EDGES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return sh.canonical_order(bm)


# --- the two org-carried, individually itemised stone forms: same silhouette,
# different material so the runtime's per-org grouping (basalt/laterite,
# M15) reads at a glance. ---
stone_basalt = sh.new_mesh_object('StoneBasalt', stone_bm(0.16, 0.13, 0.09), basalt)
stone_laterite = sh.new_mesh_object('StoneLaterite', stone_bm(0.16, 0.13, 0.09), laterite)

# --- cairn stone: the per-org overflow pile -- a shorter, wider single
# block standing in for several small unrecorded merges, distinct in
# silhouette so it never reads as "just another basalt stone". ---
cairn_stone = sh.new_mesh_object('CairnStone', stone_bm(0.22, 0.20, 0.05, top_shrink=0.65), basalt)

# --- submerged stone: the open-PR form -- lower and flatter (half in the
# water, "visible but not walkable", M15), same footprint family, its own
# name so the runtime never confuses it with a merged stone. ---
submerged_stone = sh.new_mesh_object('SubmergedStone', stone_bm(0.15, 0.12, 0.025, top_shrink=0.9), laterite)

kit_objects = [stone_basalt, stone_laterite, cairn_stone, submerged_stone]
sh.export_kit(ID, kit_objects)


def pack_glb(path):
    """Compress with meshopt via the pinned npx gltfpack@1.2.0 call (house pattern, M42:
    _shared.py is frozen, so this lives here)."""
    path = Path(path)
    tmp = path.with_suffix('.tmp.glb')
    subprocess.run(
        ['npx', '-y', 'gltfpack@1.2.0', '-cc', '-kn', '-i', str(path), '-o', str(tmp)],
        check=True,
    )
    tmp.replace(path)


pack_glb(sh.MODELS_OUT / f'{ID}.glb')
print(f'{ID.upper().replace("-", "_")}_PACKED')
