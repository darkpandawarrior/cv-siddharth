"""Ghat step-flight kit: the shared step + landing prototypes every ghat in
World v2 mounts at its socket.flights_top (world-v2-spec.md §5, §9). This is
the dependency the art-direction critic named as blocking doori-ghat and
gaddi-ghat: "nothing about their silhouette can be fixed without it" — a
ghat's whole visual identity is its descending flights of stairs, and until
this kit existed no step geometry existed anywhere in the repo.

Kit pieces (spec §0.3 rule 2: "no GLB bakes a data count" — this ships ONE
step prototype and ONE landing prototype, the runtime instances the
per-landmark count: doori's 13 flights, gaddi's 15 steps):
  - Step:    one tread+riser unit, nosed and coursed like the bridge's
             voussoirs, sandstone.
  - Landing: a one-riser-tall rest platform for between flights.
  - socket.step_pitch: an empty encoding the stacking pitch (rise 0.16 m,
    run 0.32 m along -Y, descending in -Z) so the runtime can compute where
    step N sits without guessing a number that isn't in this file.

A separate, non-exported preview .blend stacks a representative descending
run of steps so the render can be judged at landmark scale, same pattern as
sangam-keystone-bridge.py's arch preview.

Art-direction pass 2: the preview flight was 8 risers at 16 cm each (1.3 m of
total drop) sitting on a bare procedural dune slope — nowhere near reaching
the waterline, so it silently read as "no ghat at all" next to the concept's
long stone stair. The preview now runs ~18 risers at ~27 cm each (spec's
15-20-riser, 25-30 cm brief) and adds a one-off ChhatriPavilion (4 pillars,
a domed roof, same lathe-profile vocabulary the bridge/deepmal kits already
use for their finials) at the top landing.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python ghat-kit.py
"""
from pathlib import Path
import math
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'ghat-kit'
sh.clear_scene()

sandstone = sh.pbr('mat.sandstone')
palestone = sh.pbr('mat.paleStone')

RISE, RUN, WIDTH = 0.27, 0.40, 1.8


def step_block():
    """A tread+riser unit with a rounded nosing on the leading top edge —
    the stair-cutting vocabulary, not a bare box (the same discipline the
    bridge's drafted_block already applies to voussoirs)."""
    bm = bmesh.new()
    hw = WIDTH / 2
    v = [bm.verts.new(p) for p in (
        (-hw, 0, 0), (hw, 0, 0), (hw, RUN, 0), (-hw, RUN, 0),
        (-hw, 0, RISE), (hw, 0, RISE), (hw, RUN, RISE), (-hw, RUN, RISE))]
    bm.faces.new((v[0], v[1], v[2], v[3]))
    bm.faces.new((v[7], v[6], v[5], v[4]))
    bm.faces.new((v[0], v[4], v[5], v[1]))  # nosing face (-Y, the descent side)
    bm.faces.new((v[1], v[5], v[6], v[2]))
    bm.faces.new((v[2], v[6], v[7], v[3]))
    bm.faces.new((v[3], v[7], v[4], v[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    nose_edges = [e for e in bm.edges
                  if all(abs(v.co.y) < 1e-6 and v.co.z > 1e-6 for v in e.verts)]
    bmesh.ops.bevel(bm, geom=nose_edges, offset=0.03, segments=3, affect='EDGES')
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges if e.is_boundary and e not in nose_edges],
                     offset=0.006, segments=1, affect='EDGES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return sh.canonical_order(bm)


step_bm = step_block()
step = sh.new_mesh_object('Step', step_bm, sandstone)

# --- landing: a wider, deeper rest platform, one riser tall ---
LAND_DEPTH = 0.7
land_bm = bmesh.new()
hw, hd = WIDTH / 2, LAND_DEPTH / 2
lv = [land_bm.verts.new(p) for p in (
    (-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0),
    (-hw, -hd, RISE), (hw, -hd, RISE), (hw, hd, RISE), (-hw, hd, RISE))]
land_bm.faces.new((lv[0], lv[1], lv[2], lv[3]))
land_bm.faces.new((lv[7], lv[6], lv[5], lv[4]))
land_bm.faces.new((lv[0], lv[4], lv[5], lv[1]))
land_bm.faces.new((lv[1], lv[5], lv[6], lv[2]))
land_bm.faces.new((lv[2], lv[6], lv[7], lv[3]))
land_bm.faces.new((lv[3], lv[7], lv[4], lv[0]))
bmesh.ops.recalc_face_normals(land_bm, faces=land_bm.faces)
bmesh.ops.bevel(land_bm, geom=[e for e in land_bm.edges if e.is_boundary],
                 offset=0.015, segments=2, affect='EDGES')
bmesh.ops.recalc_face_normals(land_bm, faces=land_bm.faces)
bmesh.ops.dissolve_degenerate(land_bm, dist=1e-5, edges=list(land_bm.edges))
bmesh.ops.recalc_face_normals(land_bm, faces=land_bm.faces)
land_bm = sh.canonical_order(land_bm)
landing = sh.new_mesh_object('Landing', land_bm, sandstone)

# The runtime instances Step along -Y/-Z at this pitch from socket.flights_top
# on each ghat; the empty's location IS the pitch vector, not a comment that
# can drift out of sync with the geometry.
pitch = sh.socket('socket.step_pitch', (0, -RUN, -RISE), size=0.05)

# --- chhatri pavilion: a small domed pavilion topping the flight (art-
# direction fix — "a small domed chhatri/pavilion" at the head of the
# stairs). One-off whole-piece, same lathe-profile vocabulary the bridge's
# lamp post / deepmal's finial already use for a turned stone silhouette. ---
PILLAR_PROFILE = [(.05, 0), (.06, .04), (.04, .5), (.055, .56), (.05, .60)]
DOME_PROFILE = [(0.0, 0), (.62, 0), (.64, .06), (.55, .30), (.30, .48), (.10, .58), (0.0, .62)]
PILLAR_R = 0.5
chhatri_parts = []
for i in range(4):
    ang = i * math.pi / 2 + math.pi / 4
    px, py = PILLAR_R * math.cos(ang), PILLAR_R * math.sin(ang)
    p_bm = sh.canonical_order(sh.lathe(PILLAR_PROFILE, steps=8))
    p_obj = sh.new_mesh_object(f'_chhatri_pillar_{i}', p_bm, palestone)
    p_obj.location = (px, py, 0)
    chhatri_parts.append(p_obj)

dome_obj = sh.new_mesh_object('_chhatri_dome', sh.canonical_order(sh.lathe(DOME_PROFILE, steps=12)), palestone)
dome_obj.location = (0, 0, 0.60)
chhatri_parts.append(dome_obj)

bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.68, depth=0.06, location=(0, 0, 0.03))
chhatri_deck = bpy.context.object
chhatri_deck.data.materials.append(sandstone)
chhatri_parts.append(chhatri_deck)

bpy.context.view_layer.objects.active = chhatri_parts[0]
for p in chhatri_parts:
    p.select_set(True)
bpy.ops.object.join()
chhatri = bpy.context.object
chhatri.name = 'ChhatriPavilion'
chhatri.data.name = 'ChhatriPavilion'
sh.canonicalize_object(chhatri)
bpy.ops.object.select_all(action='DESELECT')

kit_objects = [step, landing, pitch, chhatri]
sh.export_kit(ID, kit_objects)


def pack_glb(path):
    """Compress with meshopt via the pinned npx gltfpack@1.2.0 call (house
    pattern, M68: the exact pin, never added to package.json; mirrors
    fleet-deepmal.py's pack_glb, since _shared.py is frozen per M42). This
    lane's task 3 (P2-07e): pack every GLB."""
    path = Path(path)
    tmp = path.with_suffix('.tmp.glb')
    subprocess.run(
        ['npx', '-y', 'gltfpack@1.2.0', '-cc', '-kn', '-i', str(path), '-o', str(tmp)],
        check=True,
    )
    tmp.replace(path)


pack_glb(sh.MODELS_OUT / f'{ID}.glb')
print(f'{ID.upper().replace("-", "_")}_PACKED')

# ---------------------------------------------------------------------------
# Preview-only assembly: a representative descending flight (~18 risers,
# spec's 15-20-riser brief) with a mid landing and the chhatri at the top,
# so the render can be judged at landmark scale (not exported).
# ---------------------------------------------------------------------------
preview_objs = []
N_PREVIEW = 18
MID_LANDING_AFTER = 9
z_off = 0.0
for i in range(N_PREVIEW):
    dup = step.copy()
    dup.data = step.data.copy()
    dup.name = f'Step_preview_{i}'
    y = -i * RUN - (LAND_DEPTH - RUN if i >= MID_LANDING_AFTER else 0)
    dup.location = (0, y, -i * RISE)
    bpy.context.collection.objects.link(dup)
    preview_objs.append(dup)
    if i == MID_LANDING_AFTER - 1:
        mid = landing.copy()
        mid.data = landing.data.copy()
        mid.name = 'Landing_preview_mid'
        mid.location = (0, y - LAND_DEPTH / 2 - RUN / 2, -i * RISE)
        bpy.context.collection.objects.link(mid)
        preview_objs.append(mid)

dup = landing.copy()
dup.data = landing.data.copy()
last_y = -(N_PREVIEW - 1) * RUN - (LAND_DEPTH - RUN)
dup.location = (0, last_y - LAND_DEPTH / 2 - RUN / 2, -(N_PREVIEW - 1) * RISE)
dup.name = 'Landing_preview'
bpy.context.collection.objects.link(dup)
preview_objs.append(dup)

chhatri_dup = chhatri.copy()
chhatri_dup.data = chhatri.data.copy()
chhatri_dup.name = 'ChhatriPavilion_preview'
chhatri_dup.location = (0, 0.55, 0)
bpy.context.collection.objects.link(chhatri_dup)
preview_objs.append(chhatri_dup)

for o in kit_objects:
    if o.type == 'MESH':
        o.hide_render = True

preview_dir = sh.SHOWCASE / ID
preview_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(preview_dir / f'{ID}-preview.blend'))
print(f'{ID.upper().replace("-", "_")}_PREVIEW_SAVED')
