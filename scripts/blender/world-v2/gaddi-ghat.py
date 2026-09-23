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

# --- jharokha screen: a carved lattice back-wall. Built as a frame plus a
# 4x3 grid of alternating recessed-glow / raised-stone cells — an array,
# not a bare panel. ---
frame_parts = []
fw, fd, fh = 2.2, 0.14, 1.5
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -d / 2, h + fh / 2))
frame = bpy.context.object
frame.scale = (fw, fd, fh)
frame_parts.append(frame)

cols, rows = 4, 3
cell_w, cell_h = fw / cols * 0.82, fh / rows * 0.78
glow_parts = []
for c in range(cols):
    for r in range(rows):
        cx = -fw / 2 + (c + 0.5) * (fw / cols)
        cz = h + (r + 0.5) * (fh / rows)
        lit = (c + r) % 2 == 0
        bpy.ops.mesh.primitive_cube_add(
            size=1, location=(cx, -d / 2 - (0.05 if lit else -0.01), cz))
        cell = bpy.context.object
        cell.scale = (cell_w, 0.05 if lit else 0.03, cell_h)
        cell.data.materials.append(jharokha_glow if lit else sandstone)
        for poly in cell.data.polygons:
            poly.use_smooth = False
        glow_parts.append(cell)

bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = frame
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

DOME_PROFILE = [(0.02, 0), (0.9, 0.02), (0.95, 0.10), (0.75, 0.32), (0.35, 0.46), (0.0, 0.52)]
dome_bm = sh.lathe(DOME_PROFILE, steps=12)
dome_bm = sh.canonical_order(dome_bm)
dome = sh.new_mesh_object('_dome_tmp', dome_bm, palestone)
dome.location = (0, -d / 2 + 0.15, h + fh + 0.25)
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

preview_dir = sh.SHOWCASE / ID
preview_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(preview_dir / f'{ID}-preview.blend'))
print(f'{ID.upper().replace("-", "_")}_PREVIEW_SAVED')
