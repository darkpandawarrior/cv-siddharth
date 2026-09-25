"""PaymentsLab-KMP bell toran (world-v2-spec.md landmark #4): "provider N+1
touches no existing code" as a doorway hung with bells, one per gateway.

Kit, not a baked assembly (spec §0.3 rule 2 — no GLB bakes a data count; the
gateway counts are live `providers.ts` data, G14): ships ONE ToranFrame (the
gate itself) and ONE Bell prototype, plus `socket.bell_pitch`, an empty whose
location IS the per-bell spacing step (same trick as ghat-kit.py's
socket.step_pitch) so the runtime can hang `providerCount` bells along the
lintel without this file ever encoding that number.

Run through Blender in --background --python mode, same as its siblings in
this directory (see any sibling's own docstring for the exact flags).
"""
from pathlib import Path
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = "paymentslab-bell-toran"
sh.clear_scene()

sandstone = sh.pbr('mat.sandstone')
brass = sh.pbr('mat.brass')

HALF_SPAN, POST_W, POST_H, LINTEL_H = 1.0, 0.09, 1.9, 0.14


def beveled_box(name, size_xyz, location, mat, bevel=0.012):
    sx, sy, sz = size_xyz
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.name = name
    obj.data.name = name
    obj.data.materials.append(mat)
    b = obj.modifiers.new('Bevel', 'BEVEL')
    b.width = bevel
    b.segments = 2
    b.limit_method = 'ANGLE'
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=b.name)
    sh.canonicalize_object(obj)
    return obj


# --- gate: two posts, a lintel, and a shallow pediment cap, joined into one
# ToranFrame the runtime places whole (its own count never varies — it is
# one gateway, not one per provider). ---
left_post = beveled_box('_post_l', (POST_W, POST_W, POST_H),
                         (-HALF_SPAN, 0, POST_H / 2), sandstone)
right_post = beveled_box('_post_r', (POST_W, POST_W, POST_H),
                          (HALF_SPAN, 0, POST_H / 2), sandstone)
lintel = beveled_box('_lintel', (2 * HALF_SPAN + POST_W, POST_W, LINTEL_H),
                      (0, 0, POST_H + LINTEL_H / 2), sandstone)
pediment_bm = bmesh.new()
hw = HALF_SPAN + POST_W / 2 + 0.03
pv = [pediment_bm.verts.new(p) for p in (
    (-hw, -POST_W / 2, 0), (hw, -POST_W / 2, 0), (hw, POST_W / 2, 0), (-hw, POST_W / 2, 0),
    (0, -POST_W / 2, 0.22), (0, POST_W / 2, 0.22))]
pediment_bm.faces.new((pv[0], pv[1], pv[5], pv[4]))
pediment_bm.faces.new((pv[1], pv[2], pv[5]))
pediment_bm.faces.new((pv[2], pv[3], pv[4], pv[5]))
pediment_bm.faces.new((pv[3], pv[0], pv[4]))
pediment_bm.faces.new((pv[0], pv[3], pv[2], pv[1]))
bmesh.ops.recalc_face_normals(pediment_bm, faces=pediment_bm.faces)
pediment_bm = sh.canonical_order(pediment_bm)
pediment = sh.new_mesh_object('_pediment', pediment_bm, sandstone)
pediment.location = (0, 0, POST_H + LINTEL_H)

bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = left_post
for p in (left_post, right_post, lintel, pediment):
    p.select_set(True)
bpy.ops.object.join()
toran_frame = bpy.context.object
toran_frame.name = 'ToranFrame'
toran_frame.data.name = 'ToranFrame'
sh.canonicalize_object(toran_frame)
bpy.ops.object.select_all(action='DESELECT')

# --- bell: a lathed brass bell, canopy loop at top, flared mouth at bottom
# (close_caps=False so the mouth stays an honest open rim, not a solid cap) ---
BELL_PROFILE = [(0.09, 0), (0.085, 0.02), (0.06, 0.06), (0.05, 0.09),
                (0.045, 0.105), (0.02, 0.12), (0.02, 0.13), (0.03, 0.135), (0.015, 0.145)]
bell_bm = sh.lathe(BELL_PROFILE, steps=12, close_caps=False)
bell_bm = sh.canonical_order(bell_bm)
bell = sh.new_mesh_object('Bell', bell_bm, brass)
bell.location = (-HALF_SPAN + 0.16, 0, POST_H + 0.02)

# The runtime hangs `providerCount` bells along the lintel at this step (x
# spacing, z drop stays flat — hung level, per spec "one bell per gateway").
bell_pitch = sh.socket('socket.bell_pitch', (0.20, 0, 0), size=0.04)

kit_objects = [toran_frame, bell, bell_pitch]
sh.export_kit(ID, kit_objects)


def pack_glb(path):
    """Compress with meshopt via pinned npx gltfpack (house pattern, M42:
    _shared.py is frozen after P1-13, so this lives here, not there; mirrors
    kmp-foundation-keystone.py's compress_with_meshopt). -kn keeps every
    named node (the sockets above) attached and lookup-able post-pack."""
    path = Path(path)
    tmp = path.with_suffix('.tmp.glb')
    subprocess.run(
        ['npx', '-y', 'gltfpack@1.2.0', '-cc', '-kn', '-i', str(path), '-o', str(tmp)],
        check=True,
    )
    tmp.replace(path)


pack_glb(sh.MODELS_OUT / f'{ID}.glb')
print(f'{ID.upper().replace("-", "_")}_PACKED')
