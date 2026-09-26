"""The hodi + boatman (world-v2-spec.md §6 hero prop row 1; master-plan.md
#M44): the hull half-beam is an analytic function, exported once as JSON
(`src/world/v2/hullProfile.json`) and read by both this script and the
water shader's wake term -- a single source, never a second hand-guessed
hull curve (world-v2-spec.md §0.3 rule 1, the reference's "matches boat.js"
requirement). Canopy, a static boatman, and an oar ride the hull; the oar's
moving half is its own node, `oarArm`, so the runtime can bend it per-vertex
for the scull stroke without touching the rest of the boat. A bow socket
takes the shared Poly Haven `brass_diya_lantern` (spec §4's "lantern beat").

Boatman source: if scripts/blender/world-v2/sources/boatman.glb exists (an
InstantMesh ingest from P2-07c's optional pipeline, world-v2-spec.md#6 /
master-plan.md#M68), it is imported and renamed Boatman in place of the
procedural figure below, keeping `oarArm` exactly as built here (the oar is
never part of the ingested source). P2-07c shipped no such file this pass
(the common case), so the procedural low-poly figure stays.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python hodi-boatman.py
"""
from pathlib import Path
import json
import math
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'hodi-boatman'
sh.clear_scene()

HULL_PROFILE = json.loads((sh.ROOT / 'src/world/v2/hullProfile.json').read_text())
HULL_LENGTH: float = HULL_PROFILE['length']
HULL_SAMPLES: list[tuple[float, float]] = [(t, hb) for t, hb in HULL_PROFILE['samples']]
MAX_HALF_BEAM = max(hb for _, hb in HULL_SAMPLES)

planks = sh.pbr('mat.planks')
canopy_mat = sh.material('mat.canopyWeave', (.68, .58, .38), rough=.8)
oar_wood_mat = sh.material('mat.oarWood', (.34, .22, .12), rough=.7)
boatman_mat = sh.material('mat.boatmanCloth', (.82, .74, .58), rough=.75)


def hull_offsets(half_beam: float) -> tuple[float, float]:
    """Depth (keel) / freeboard (gunwale) as a function of the LOCAL half-
    beam only, so the hull silhouette narrows to a point at both ends with
    the same curve hullProfile.json already gives us, rather than a second,
    separately-tuned depth curve (ladder rung 2: reuse the shape we have)."""
    frac = half_beam / MAX_HALF_BEAM if MAX_HALF_BEAM else 0.0
    bottom = -0.12 - 0.30 * frac
    top = 0.18 + 0.16 * frac
    return bottom, top


# --- hull: loft the analytic profile, one station per JSON sample. The two
# zero-width end samples (t=-1, t=1) collapse to a single point, so they are
# excluded from the loft and closed instead with a 3-triangle fan -- a
# degenerate zero-width quad row is exactly the kind of non-manifold sliver
# inspect_asset's gate would flag. ---
mid_samples = sorted((t, hb) for t, hb in HULL_SAMPLES if hb > 1e-6)

hbm = bmesh.new()
rows: list[tuple] = []
for t, half_beam in mid_samples:
    y = t * (HULL_LENGTH / 2)
    bottom, top = hull_offsets(half_beam)
    keel = hbm.verts.new((0, y, bottom))
    left = hbm.verts.new((-half_beam, y, top))
    right = hbm.verts.new((half_beam, y, top))
    rows.append((keel, left, right))

for i in range(len(rows) - 1):
    k0, l0, r0 = rows[i]
    k1, l1, r1 = rows[i + 1]
    hbm.faces.new((k0, l0, l1, k1))  # port side
    hbm.faces.new((k0, k1, r1, r0))  # starboard side
    hbm.faces.new((l0, r0, r1, l1))  # deck / gunwale strip

bow_top = hull_offsets(0.0)[1]
bow_tip = hbm.verts.new((0, -HULL_LENGTH / 2, bow_top))
stern_tip = hbm.verts.new((0, HULL_LENGTH / 2, bow_top))
k0, l0, r0 = rows[0]
hbm.faces.new((bow_tip, k0, l0))
hbm.faces.new((bow_tip, l0, r0))
hbm.faces.new((bow_tip, r0, k0))
kN, lN, rN = rows[-1]
hbm.faces.new((stern_tip, lN, kN))
hbm.faces.new((stern_tip, rN, lN))
hbm.faces.new((stern_tip, kN, rN))

bmesh.ops.recalc_face_normals(hbm, faces=hbm.faces)
hull_bm = sh.canonical_order(hbm)
hull = sh.new_mesh_object('HodiHull', hull_bm, planks)

# --- canopy: an open half-tunnel over midship, a two-ring ruled surface (a
# straight arch needs no more than its two end profiles) ---
CANOPY_HALF_LEN = HULL_LENGTH * 0.18
CANOPY_RADIUS = MAX_HALF_BEAM * 0.85
CANOPY_Z = hull_offsets(MAX_HALF_BEAM)[1] + 0.02
N_ARC = 8

canopy_bm = bmesh.new()
canopy_rows = []
for y in (-CANOPY_HALF_LEN, CANOPY_HALF_LEN):
    ring = []
    for i in range(N_ARC + 1):
        a = math.pi * i / N_ARC
        ring.append(canopy_bm.verts.new((CANOPY_RADIUS * math.cos(a), y, CANOPY_Z + CANOPY_RADIUS * math.sin(a))))
    canopy_rows.append(ring)
for i in range(N_ARC):
    a0, b0 = canopy_rows[0][i], canopy_rows[0][i + 1]
    a1, b1 = canopy_rows[1][i], canopy_rows[1][i + 1]
    canopy_bm.faces.new((a0, b0, b1, a1))
bmesh.ops.recalc_face_normals(canopy_bm, faces=canopy_bm.faces)
canopy_bm = sh.canonical_order(canopy_bm)
canopy = sh.new_mesh_object('Canopy', canopy_bm, canopy_mat)

# --- oarArm: shaft tapering to a flat blade, local origin at the oarlock
# pivot (y=0 of the object) so the runtime can bend it per-vertex by
# distance along local +Y for the scull stroke (world-v2-spec §6 row 1) ---
OAR_LENGTH = 1.4
OAR_Y = HULL_LENGTH * 0.32  # aft of midship -- a hodi is sculled from astern
OAR_BEAM_OFFSET = MAX_HALF_BEAM + 0.05

bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.018, depth=OAR_LENGTH * 0.82,
                                     location=(0, OAR_LENGTH * 0.41, 0))
shaft = bpy.context.object
shaft.rotation_euler = (math.radians(90), 0, 0)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

bpy.ops.mesh.primitive_cube_add(size=1, location=(0, OAR_LENGTH * 0.92, 0))
blade = bpy.context.object
blade.scale = (0.10, 0.20, 0.006)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = shaft
for o in (shaft, blade):
    o.select_set(True)
bpy.ops.object.join()
oar_arm = bpy.context.object
oar_arm.name = 'oarArm'
oar_arm.data.name = 'oarArm'
oar_arm.data.materials.clear()
oar_arm.data.materials.append(oar_wood_mat)
sh.canonicalize_object(oar_arm)
bpy.ops.object.select_all(action='DESELECT')
oar_arm.location = (OAR_BEAM_OFFSET, OAR_Y, 0.22)

# --- boatman: procedural low-poly figure (torso, head, two legs, joined),
# unless P2-07c's optional ingested source is present ---
SOURCE_BOATMAN = Path(__file__).resolve().parent / 'sources' / 'boatman.glb'


def build_procedural_boatman():
    parts = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.09, depth=0.55, location=(0, 0, 0.275))
    parts.append(bpy.context.object)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=0.09, location=(0, 0, 0.62))
    parts.append(bpy.context.object)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.05, depth=0.55, location=(0.05, 0, -0.275))
    parts.append(bpy.context.object)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.05, depth=0.55, location=(-0.05, 0, -0.275))
    parts.append(bpy.context.object)

    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = parts[0]
    for p in parts:
        p.select_set(True)
    bpy.ops.object.join()
    figure = bpy.context.object
    figure.name = 'Boatman'
    figure.data.name = 'Boatman'
    figure.data.materials.clear()
    figure.data.materials.append(boatman_mat)
    sh.canonicalize_object(figure)
    bpy.ops.object.select_all(action='DESELECT')
    return figure


if SOURCE_BOATMAN.exists():
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_BOATMAN))
    imported_meshes = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    boatman = imported_meshes[0] if imported_meshes else build_procedural_boatman()
    boatman.name = 'Boatman'
else:
    boatman = build_procedural_boatman()
boatman.location = (0.0, OAR_Y - 0.15, 0.30)

# --- bow socket for the shared Poly Haven brass_diya_lantern ---
bow_socket = sh.socket('socket.lantern', (0, -HULL_LENGTH / 2 + 0.35, bow_top + 0.05), size=0.06)

kit_objects = [hull, canopy, oar_arm, boatman, bow_socket]
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
