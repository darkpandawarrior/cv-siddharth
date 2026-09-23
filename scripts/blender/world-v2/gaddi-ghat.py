"""Gaddi ghat: a seat pavilion carrying the app that runs inside this very
site as Wasm (world-v2-spec.md landmark #3).

Kit pieces: GaddiSeat (a plinth pavilion), JharokhaScreen (a carved lattice
window whose recessed cells glow amber — "the runs-here edge to portfolio",
spec §0.3 rule 3: amber = fire/light/calibration), and a small chhatri
canopy over the seat. The 15-step flight (projectStats.gaddi.modules) is
instanced from ghat-kit.py at runtime, mounted at socket.flights_top.
Mooring posts with green signal lamps (one per `ships` edge: F-Droid,
GitHub Releases, headless CLI) come from misc-kit.py, mounted at
socket.mooring.NN.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python gaddi-ghat.py
"""
from pathlib import Path
import math
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'gaddi-ghat'
sh.clear_scene()

sandstone = sh.pbr('mat.sandstone')
palestone = sh.pbr('mat.paleStone')
jharokha_glow = sh.material('mat.jharokhaGlow', sh.AMBER, metal=0.0, rough=0.35,
                             emission=sh.AMBER, emission_strength=2.4)

# --- seat plinth: a raised, coped block the pavilion stands on ---
bm = bmesh.new()
w, d, h = 2.6, 2.0, 0.5
v = [bm.verts.new(p) for p in (
    (-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (w / 2, d / 2, 0), (-w / 2, d / 2, 0),
    (-w / 2, -d / 2, h), (w / 2, -d / 2, h), (w / 2, d / 2, h), (-w / 2, d / 2, h))]
bm.faces.new((v[0], v[1], v[2], v[3]))
bm.faces.new((v[7], v[6], v[5], v[4]))
bm.faces.new((v[0], v[4], v[5], v[1]))
bm.faces.new((v[1], v[5], v[6], v[2]))
bm.faces.new((v[2], v[6], v[7], v[3]))
bm.faces.new((v[3], v[7], v[4], v[0]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.ops.bevel(bm, geom=[e for e in bm.edges if e.is_boundary], offset=0.03, segments=2, affect='EDGES')
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm = sh.canonical_order(bm)
seat = sh.new_mesh_object('GaddiSeat', bm, sandstone)

# --- jharokha screen: a carved lattice back-wall. Built as a hollow border
# (4 bars, an open centre) plus a 4x3 grid of pierced-strut cells — a real
# picture-frame surround, not a solid slab with cells stuck on top of it.
# The earlier version was one solid box the full fw x fh area: the "lattice"
# cells sat in front of a backing wall that was never actually open, so
# nothing could read as pierced no matter what sat on its face (critic
# finding #2 — "reads as a birdhouse", "even a simple repeating cutout
# pattern reads infinitely better than solid painted squares"). ---
frame_parts = []
fw, fd, fh = 2.2, 0.14, 1.5
BW = 0.13  # border bar width
bar_defs = [
    ((0, -d / 2, h + fh - BW / 2), (fw, fd, BW)),           # top bar
    ((0, -d / 2, h + BW / 2), (fw, fd, BW)),                # bottom bar
    ((-fw / 2 + BW / 2, -d / 2, h + fh / 2), (BW, fd, fh - 2 * BW)),  # left bar
    ((fw / 2 - BW / 2, -d / 2, h + fh / 2), (BW, fd, fh - 2 * BW)),   # right bar
]
for loc, scale in bar_defs:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    bar = bpy.context.object
    bar.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    sh.bevel_apply(bar, width=0.018, segments=2)  # a flat bar read as a slab (critic finding #5); a moulded edge reads as a built surround
    frame_parts.append(bar)

# Art-direction fix: a solid painted-cube checkerboard doesn't read as a
# carved jharokha screen at all — it reads as a birdhouse (critic finding
# #2). A real jali is pierced, so each cell is built as an X of diagonal
# stone struts with nothing solid behind them; a "lit" cell gets a small
# recessed amber pad glimpsed through the gap instead of a flat glowing
# square. This is still 12 cells with the same alternating-lit pattern, just
# built as struts instead of panels — a repeating cutout pattern, not carved
# tracery, but it reads as pierced stonework instead of a solid grid.
cols, rows = 4, 3
cell_w, cell_h = fw / cols, fh / rows
strut_len = min(cell_w, cell_h) * 0.92
strut_th = cell_w * 0.11
glow_parts = []
for c in range(cols):
    for r in range(rows):
        cx = -fw / 2 + (c + 0.5) * cell_w
        cz = h + (r + 0.5) * cell_h
        lit = (c + r) % 2 == 0
        for ang in (45, -45):
            bpy.ops.mesh.primitive_cube_add(
                size=1, location=(cx, -d / 2 - 0.02, cz), rotation=(0, math.radians(ang), 0))
            strut = bpy.context.object
            strut.scale = (strut_len, 0.035, strut_th)
            strut.data.materials.append(sandstone)
            for poly in strut.data.polygons:
                poly.use_smooth = False
            glow_parts.append(strut)
        if lit:
            bpy.ops.mesh.primitive_cube_add(
                size=1, location=(cx, -d / 2 - 0.07, cz))
            pad = bpy.context.object
            pad.scale = (cell_w * 0.5, 0.03, cell_h * 0.5)
            pad.data.materials.append(jharokha_glow)
            for poly in pad.data.polygons:
                poly.use_smooth = False
            glow_parts.append(pad)

bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = frame_parts[0]
for p in frame_parts:
    p.select_set(True)
bpy.ops.object.join()
jharokha_frame = bpy.context.object
jharokha_frame.name = 'JharokhaFrame'
jharokha_frame.data.materials.clear()
jharokha_frame.data.materials.append(sandstone)
sh.canonicalize_object(jharokha_frame)
bpy.ops.object.select_all(action='DESELECT')

# --- chhatri canopy: a small domed roof on 4 corner posts over the seat ---
canopy_parts = []
post_positions = [(-fw / 2 + 0.1, -d / 2 + 0.15, h), (fw / 2 - 0.1, -d / 2 + 0.15, h),
                   (-fw / 2 + 0.1, d / 2 - 0.15, h), (fw / 2 - 0.1, d / 2 - 0.15, h)]
for px, py, pz in post_positions:
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.05, depth=fh + 0.25,
                                         location=(px, py, pz + (fh + 0.25) / 2))
    post = bpy.context.object
    canopy_parts.append(post)

# Art-direction fix: the dome used to sit at y = -d/2+0.15 (over the two
# *front* posts only) while the back two posts, at y = +d/2-0.15, had
# nothing over them at all — they poked straight up past the roofline with
# no structural or compositional role (critic finding #2, "read as stray/
# orphaned geometry"). All 4 posts share one z (h+fh+0.25); the dome just
# needed to be centred over the seat (y=0, the midpoint between the front
# and back post rows) instead of parked over one row. The radii are also
# widened so the canopy eave genuinely overhangs all 4 corner posts
# (max radial distance from centre ~1.31 m) instead of stopping short.
DOME_PROFILE = [(0.02, 0), (1.20, 0.02), (1.28, 0.11), (1.00, 0.36), (0.46, 0.52), (0.0, 0.60)]
dome_bm = sh.lathe(DOME_PROFILE, steps=12)
dome_bm = sh.canonical_order(dome_bm)
dome = sh.new_mesh_object('_dome_tmp', dome_bm, palestone)
dome.location = (0, 0, h + fh + 0.25)
canopy_parts.append(dome)

bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = canopy_parts[0]
for p in canopy_parts:
    p.select_set(True)
bpy.ops.object.join()
canopy = bpy.context.object
canopy.name = 'ChhatriCanopy'
canopy.data.materials.clear()
canopy.data.materials.append(palestone)
sh.canonicalize_object(canopy)
bpy.ops.object.select_all(action='DESELECT')

sh.socket('socket.flights_top', (0, -d / 2 - 0.05, 0), size=0.18)
mooring = [sh.socket(f'socket.mooring.{i:02d}', (1.6 + i * 0.9, -d / 2 - 1.6, -0.45), size=0.12)
           for i in range(3)]

kit_objects = [seat, jharokha_frame, canopy, *glow_parts,
               bpy.data.objects['socket.flights_top'], *mooring]
sh.export_kit(ID, kit_objects)

# ---------------------------------------------------------------------------
# Preview-only: mount ghat-kit's Step run at socket.flights_top and
# misc-kit's mooring post + lamp at each socket.mooring.NN, so this review
# render shows an actual ghat instead of a pavilion sitting on bare sockets
# (critic finding #1/#2 — "no steps ... no mooring posts, no lamps despite
# 3 socket.mooring.NN empties being present"). Neither exported kit above
# changes; the runtime does this instancing from live data.
# ---------------------------------------------------------------------------
GHAT_KIT_GLB = sh.MODELS_OUT / 'ghat-kit.glb'
if GHAT_KIT_GLB.exists():
    bpy.ops.import_scene.gltf(filepath=str(GHAT_KIT_GLB))
    imported = list(bpy.context.selected_objects)
    step_proto = next((o for o in imported if o.name == 'Step'), None)
    flights_top = bpy.data.objects['socket.flights_top']
    STEP_RUN, STEP_RISE, N_STEPS_PREVIEW = 0.32, 0.16, 12
    if step_proto is not None:
        for i in range(N_STEPS_PREVIEW):
            dup = step_proto.copy()
            dup.data = step_proto.data.copy()
            dup.name = f'Step_preview_{i}'
            dup.location = (flights_top.location.x,
                             flights_top.location.y - i * STEP_RUN,
                             flights_top.location.z - i * STEP_RISE)
            bpy.context.collection.objects.link(dup)
    for o in imported:
        o.hide_render = True
        o.hide_viewport = True

MISC_KIT_GLB = sh.MODELS_OUT / 'misc-kit.glb'
if MISC_KIT_GLB.exists():
    bpy.ops.import_scene.gltf(filepath=str(MISC_KIT_GLB))
    imported2 = list(bpy.context.selected_objects)
    post_proto = next((o for o in imported2 if o.name == 'MooringPost'), None)
    lamp_proto = next((o for o in imported2 if o.name == 'SignalLampPost'), None)
    for i, sock in enumerate(mooring):
        if post_proto is not None:
            dup = post_proto.copy()
            dup.data = post_proto.data.copy()
            dup.name = f'MooringPost_preview_{i}'
            dup.location = sock.location
            bpy.context.collection.objects.link(dup)
            for child in post_proto.children:
                cdup = child.copy()
                cdup.data = child.data.copy() if child.data else None
                cdup.name = f'{child.name}_preview_{i}'
                cdup.parent = dup
                bpy.context.collection.objects.link(cdup)
        if lamp_proto is not None:
            ldup = lamp_proto.copy()
            ldup.data = lamp_proto.data.copy()
            ldup.name = f'SignalLampPost_preview_{i}'
            ldup.location = (sock.location.x + 0.2, sock.location.y, sock.location.z)
            bpy.context.collection.objects.link(ldup)
            for child in lamp_proto.children:
                cdup = child.copy()
                cdup.data = child.data.copy() if child.data else None
                cdup.name = f'{child.name}_preview_{i}'
                cdup.parent = ldup
                bpy.context.collection.objects.link(cdup)
    for o in imported2:
        o.hide_render = True
        o.hide_viewport = True
        for c in o.children:
            c.hide_render = True
            c.hide_viewport = True

preview_dir = sh.SHOWCASE / ID
preview_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(preview_dir / f'{ID}-preview.blend'))
print(f'{ID.upper().replace("-", "_")}_PREVIEW_SAVED')
