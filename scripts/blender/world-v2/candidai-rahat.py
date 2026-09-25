"""Candidai rahat (world-v2-spec.md landmark #5): "one engine, five targets"
as a Persian water wheel with 5 fixed buckets. The wheel turns only while the
boat is inside its sensor — "zero tokens until an LLM is needed" made
mechanical (idea-atlas.md WORLD-5). Five buckets is the wheel's own fixed
architecture (it is not a live count anywhere — see living-ledger-spec.md
§3.3 G14: only `w:<landmark>:<field>` rows read live data, and rahat has none
here), so unlike the bell toran's data-driven count this file bakes exactly
five bucket sockets, per this lane's own task list.

Kit: ONE Wheel (rim + spokes, the single node the runtime rotates), ONE
Bucket prototype, and 5 `socket.bucket.N` empties parented to Wheel so the
buckets stay mounted on it as it turns.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python candidai-rahat.py
"""
from pathlib import Path
import math
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'candidai-rahat'
sh.clear_scene()

planks = sh.pbr('mat.planks')
clay = sh.pbr('mat.clay')

WHEEL_R, RIM_THICK, SPOKE_W = 0.62, 0.035, 0.028
N_SPOKES = 8

# --- wheel: a lathed rim ring + radial spoke boxes, joined into one Wheel
# object — the whole thing is what the runtime rotates about +Y. ---
RIM_PROFILE = [(WHEEL_R - RIM_THICK, -0.03), (WHEEL_R, -0.03), (WHEEL_R, 0.03),
               (WHEEL_R - RIM_THICK, 0.03)]
rim_bm = sh.lathe(RIM_PROFILE, steps=24, close_caps=False)
rim_bm = sh.canonical_order(rim_bm)
rim = sh.new_mesh_object('_wheelRim', rim_bm, planks)

spokes = [rim]
for i in range(N_SPOKES):
    ang = i * math.tau / N_SPOKES
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(
        (WHEEL_R - RIM_THICK) / 2 * math.cos(ang), (WHEEL_R - RIM_THICK) / 2 * math.sin(ang), 0))
    spoke = bpy.context.object
    spoke.scale = (WHEEL_R - RIM_THICK, SPOKE_W, SPOKE_W)
    spoke.rotation_euler = (0, 0, ang)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    spoke.data.materials.append(planks)
    spokes.append(spoke)

bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = spokes[0]
for s in spokes:
    s.select_set(True)
bpy.ops.object.join()
wheel = bpy.context.object
wheel.name = 'Wheel'
wheel.data.name = 'Wheel'
sh.canonicalize_object(wheel)
bpy.ops.object.select_all(action='DESELECT')

# --- bucket: a small lathed clay pot ---
BUCKET_PROFILE = [(0.0, 0), (0.05, 0), (0.055, 0.03), (0.05, 0.075), (0.03, 0.09), (0.032, 0.095)]
bucket_bm = sh.lathe(BUCKET_PROFILE, steps=10)
bucket_bm = sh.canonical_order(bucket_bm)
bucket = sh.new_mesh_object('Bucket', bucket_bm, clay)
bucket.location = (WHEEL_R, 0, 0)

# --- 5 fixed bucket sockets, evenly ringed, parented to Wheel so they spin
# with it (WORLD-5: exactly five targets, never a growing count) ---
bucket_sockets = []
for i in range(5):
    ang = i * math.tau / 5
    s = sh.socket(f'socket.bucket.{i}',
                  (WHEEL_R * math.cos(ang), WHEEL_R * math.sin(ang), 0),
                  rotation=(0, 0, ang), parent=wheel, size=0.04)
    bucket_sockets.append(s)

kit_objects = [wheel, bucket] + bucket_sockets
sh.export_kit(ID, kit_objects)


def pack_glb(path):
    """Compress with meshopt via the pinned npx gltfpack@1.2.0 call (house pattern, M42:
    _shared.py is frozen, so this lives here; mirrors
    kmp-foundation-keystone.py's compress_with_meshopt)."""
    path = Path(path)
    tmp = path.with_suffix('.tmp.glb')
    subprocess.run(
        ['npx', '-y', 'gltfpack@1.2.0', '-cc', '-kn', '-i', str(path), '-o', str(tmp)],
        check=True,
    )
    tmp.replace(path)


pack_glb(sh.MODELS_OUT / f'{ID}.glb')
print(f'{ID.upper().replace("-", "_")}_PACKED')
