"""Diya kit (world-v2-spec.md §6 hero prop row 5; living-ledger-spec.md §10
C7): a clay diya + flame card, instanced once per commit -- "Commits =
floating diyas (live)" is C7's resolution of the three-way diya conflict
(commit lamps vs fleet niches vs floating artifacts). The OTHER two sides of
that conflict live elsewhere: fleet listings get their own `niche-lamp` form
(fleet-deepmal.py's NicheUnit/FlameCard), and artifacts become floating
marigold garlands (misc-kit.py's `garland`, this lane's own task list) --
never a second diya. So this kit stays commit-diyas-only and exports
exactly two nodes, no socket: an instanced-per-record prototype has nothing
to mount.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python diya-kit.py
"""
from pathlib import Path
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'diya-kit'
sh.clear_scene()

clay = sh.pbr('mat.clay')
# Amber is the fire/light/calibration semantic (world-v2-spec §0.3 rule 3,
# which names diyas explicitly) -- the one node here allowed to use it.
flame_mat = sh.material('mat.diyaFlame', sh.AMBER, rough=.3, emission=sh.AMBER, emission_strength=3.2)

# --- diya: a shallow lathed clay bowl with a pinched lip ---
DIYA_PROFILE = [(0.0, 0.0), (0.05, 0.0), (0.055, 0.012), (0.048, 0.028), (0.052, 0.032), (0.03, 0.034)]
diya_bm = sh.canonical_order(sh.lathe(DIYA_PROFILE, steps=8))
diya = sh.new_mesh_object('diya', diya_bm, clay)


# --- flame: a small flat card, billboarded by the runtime (the same idiom
# fleet-deepmal's FlameCard already uses) -- never a modelled, rotating
# flame mesh here ---
def flame_bm():
    bm = bmesh.new()
    half = 0.018
    base_z = 0.034
    verts = [
        bm.verts.new((-half, 0, base_z)),
        bm.verts.new((half, 0, base_z)),
        bm.verts.new((half, 0, base_z + half * 2.6)),
        bm.verts.new((-half, 0, base_z + half * 2.6)),
    ]
    bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return sh.canonical_order(bm)


flame = sh.new_mesh_object('flame', flame_bm(), flame_mat)

kit_objects = [diya, flame]
assert len(kit_objects) == 2, 'diya-kit exports exactly diya + flame, commit diyas only (C7)'
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
