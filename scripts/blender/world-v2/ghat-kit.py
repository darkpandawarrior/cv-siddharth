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

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python ghat-kit.py
"""
from pathlib import Path
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'ghat-kit'
sh.clear_scene()

sandstone = sh.pbr('mat.sandstone')

RISE, RUN, WIDTH = 0.16, 0.32, 1.8


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

kit_objects = [step, landing, pitch]
sh.export_kit(ID, kit_objects)

# ---------------------------------------------------------------------------
# Preview-only assembly: a representative 8-step descending flight with one
# landing, so the render can be judged at landmark scale (not exported).
# ---------------------------------------------------------------------------
preview_objs = []
N_PREVIEW = 8
for i in range(N_PREVIEW):
    dup = step.copy()
    dup.data = step.data.copy()
    dup.name = f'Step_preview_{i}'
    dup.location = (0, -i * RUN, -i * RISE)
    bpy.context.collection.objects.link(dup)
    preview_objs.append(dup)

dup = landing.copy()
dup.data = landing.data.copy()
dup.name = 'Landing_preview'
dup.location = (0, -N_PREVIEW * RUN - LAND_DEPTH / 2 + RUN / 2, -N_PREVIEW * RISE)
bpy.context.collection.objects.link(dup)
preview_objs.append(dup)

for o in kit_objects:
    if o.type == 'MESH':
        o.hide_render = True

preview_dir = sh.SHOWCASE / ID
preview_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(preview_dir / f'{ID}-preview.blend'))
print(f'{ID.upper().replace("-", "_")}_PREVIEW_SAVED')
