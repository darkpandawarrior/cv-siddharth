"""World v2 ("Sangam") golden-hour spawn shot: the look-dev hero render that
proves out terrain, water, atmosphere and the two rebuilt landmark kits
(sangam-keystone-bridge, fleet-deepmal) together, composed to match concept
frame 1 (.showcase-work/concept/01-golden-spawn.png) and the valley.mengto
reference's grammar (world-v2-spec.md §1/§4). This is a standalone lookdev
scene, not a runtime export — no GLB comes out of this file; it only reads
the two kits' preview .blend files and the real generated terrain data.

Coordinate convention for THIS file only (Blender is Z-up; the runtime is
three.js Y-up): Blender X = data x (east), Blender Y = data z (south/
downstream, "now"), Blender Z = height.

Look-dev art-direction pass, round 2: a prior version of this docstring
claimed "facing +Y puts west on the camera's RIGHT" and placed the deepmal/
ghat cluster at -X on that assumption. Checked directly against
to_track_quat's actual camera basis (not re-derived by eye), that claim was
backwards — world +X renders screen-RIGHT here, not -X. That single wrong
assumption is why spawn-v2.png's first pass had the deepmal on screen-LEFT
and no tree in frame at all (spec §4 wants the opposite: deepmal/ghat on
the RIGHT third, the tree framing the LEFT edge). Below, the deepmal/ghat
cluster now sits on the +X side and the tree on the -X side, to land on the
correct screen side — this is a standalone lookdev composition (module
docstring above), not the runtime export, so there's no requirement that
+X/-X here match the runtime's literal west/east bank assignment.

Art-direction pass 3 (spawn-v3.png): the sun/water/atmosphere/vegetation/
boat fixes from this pass live here; the bridge/deepmal/ghat structural
fixes live in their own kit scripts (sangam-keystone-bridge.py,
fleet-deepmal.py, ghat-kit.py) since this file only imports their preview
.blend output. Specifically: the SunDisc mesh sphere is gone, replaced by a
native Sky Texture sun disc synced to the same to_sun direction as the
SunKey light; a uniform-density world volume gives depth fog and lets the
bridge occlude real god-rays through its arches; the water shader is a flat
~40%-reflection MixShader (Glossy + Diffuse) instead of a Fresnel-tinted
diffuse; vegetation scatter density is up substantially; the banyan's
canopy/aerial-root counts are up; and the boat gets a woven-bump canopy, a
lit lantern flame, and a rope coil.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python lookdev-spawn.py
"""
from pathlib import Path
import json
import math
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ROOT = sh.ROOT
TERRAIN = ROOT / 'heavy/world/terrain'
TEX = ROOT / 'heavy/world/textures'
PH_MODELS = ROOT / 'heavy/world/models/polyhaven'
OUT_PNG = ROOT / '.showcase-work/lookdev/spawn-v3.png'
OUT_BLEND = ROOT / '.showcase-work/lookdev/spawn-v3.blend'
random.seed(42)

sh.clear_scene()
for coll in list(bpy.data.collections):
    bpy.data.collections.remove(coll)

# =============================================================================
# 0. Real generated data (heightmap/splat pixels, river spline) — nothing here
#    is hand-invented; the terrain and river read the same files the runtime
#    build pipeline produced (scripts/world-v2/gen-terrain.mjs).
# =============================================================================
HM_META = json.loads((TERRAIN / 'heightmap.json').read_text())
BOUNDS = HM_META['bounds']
EXTENT = HM_META['extent']
HMIN, HMAX = HM_META['min'], HM_META['max']
RIVER_PTS = json.loads((TERRAIN / 'river-spline.json').read_text())['points']


def load_data_image(path):
    """Loads a PNG as raw (non-color) data, flipped to top-down row order to
    match gen-terrain.mjs's own [gz][gx] indexing (Blender's .pixels array is
    bottom-up)."""
    img = bpy.data.images.load(str(path))
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    ch = img.channels
    arr = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, ch)
    return arr[::-1]  # row 0 -> zMin, matching the generator


HEIGHT_ARR = load_data_image(TERRAIN / 'heightmap.png')[:, :, 0]
SPLAT_ARR = load_data_image(TERRAIN / 'splat.png')
GRID = HM_META['grid']
STEP = EXTENT / (GRID - 1)


def _bilinear(arr, x, z):
    gx = min(max((x - BOUNDS['xMin']) / STEP, 0), GRID - 1 - 1e-4)
    gz = min(max((z - BOUNDS['zMin']) / STEP, 0), GRID - 1 - 1e-4)
    x0, z0 = int(gx), int(gz)
    x1, z1 = x0 + 1, z0 + 1
    fx, fz = gx - x0, gz - z0
    v00, v10 = arr[z0, x0], arr[z0, x1]
    v01, v11 = arr[z1, x0], arr[z1, x1]
    return v00 * (1 - fx) * (1 - fz) + v10 * fx * (1 - fz) + v01 * (1 - fx) * fz + v11 * fx * fz


def height_at(x, z):
    return HMIN + _bilinear(HEIGHT_ARR, x, z) * (HMAX - HMIN)


def splat_at(x, z):
    return _bilinear(SPLAT_ARR, x, z)  # (soil, grass, laterite, pebble)


def river_x(z):
    """valley-math.mjs riverX(z) — the same deterministic meander, no data
    dependency, so it always agrees with the mesh gen-terrain.mjs carved."""
    return 14 * math.sin(z / 70) + 6 * math.sin(z / 23 + 1.3)


def river_width_at(z):
    pts = RIVER_PTS
    if z <= pts[0]['z']:
        return pts[0]['width']
    if z >= pts[-1]['z']:
        return pts[-1]['width']
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        if a['z'] <= z <= b['z']:
            t = (z - a['z']) / (b['z'] - a['z'])
            return a['width'] + (b['width'] - a['width']) * t
    return pts[-1]['width']


# =============================================================================
# 1. Composition constants (creative placement for THIS hero shot — the
#    river's own shape and width are real data; where the camera/boat/
#    landmarks sit within that valley is a look-dev framing choice, tuned
#    against concept frame 1 across the iteration passes below).
# =============================================================================
Z_CAM = -25.0
CROP_X = (-55, 55)
CROP_Z = (-45, 155)
BRIDGE_Z = 95.0
BRIDGE_SCALE = 2.5        # X/Y (span) only — matches the ~34 m river width.
# Art-direction pass 2 (multi-arch): sangam-keystone-bridge.py's preview span
# roughly doubled in local width (DECK_HALF_SPAN 4.0 -> 8.0 m, adding the two
# flanking arches), so BRIDGE_SCALE halved from 5.0 to keep the SAME real-
# world ~34-40 m total bridge width the old single-arch version already
# matched — not a re-tune, just holding total width constant while the local
# geometry that fills it changed.
BRIDGE_HEIGHT_SCALE = 2.2  # Z scale, kept separate from the span scale: the
# unscaled model is 6.6 x 3.4 x 5.44 m (span x depth x height, measured off
# metrics-glb.json's mesh world_bounds). A uniform BRIDGE_SCALE=5.0 on all
# 3 axes (the original approach) makes a 27 m TALL structure — at the old
# Z_CAM=2.0, ~78 m from camera, that fills/crops the frame from below (see
# spawn-v1.png: bridge underside wall-to-wall, no sky, no sun, no boat).
# Height doesn't need to scale 1:1 with span just because the river is
# wide; keeping height scale independent gives a ~12 m arch — grand but not
# a skyscraper — while still spanning bank to bank.
DEEPMAL_Z = 68.0
DEEPMAL_SCALE = 2.6
DEEPMAL_BANK_OFFSET = 9.0  # metres in from the water's edge, on the +X bank
# (the side that renders screen-RIGHT — see the docstring's coordinate note).
GHAT_Z_RANGE = (18.0, 88.0)
# BOAT_X/Z and TREE_X/Z are defined below, from the camera's own view basis
# (cam_relative()) rather than as fixed offsets here — see that block for
# why (a river-relative Z alone isn't enough to keep them in frame).

print(f'river width near z=0..150: {river_width_at(0):.1f}..{river_width_at(150):.1f} m')

# Sample the real centreline height to set the water level from data, not a
# guessed constant (the carve already puts the channel bed well below this).
_bank_samples = [height_at(river_x(z) + river_width_at(z) / 2 + 9, z) for z in range(0, 150, 15)]
WATER_Y = sum(_bank_samples) / len(_bank_samples) - 0.12
print(f'WATER_Y = {WATER_Y:.2f} (from {len(_bank_samples)} bank samples)')

# Landmark ground positions, derived from the same river_x()/river_width_at()
# the terrain carve used — computed here (before the terrain/scatter build)
# so the vegetation-density mask can clear space around each one.
BRIDGE_X = river_x(BRIDGE_Z)
DEEPMAL_X = river_x(DEEPMAL_Z) + river_width_at(DEEPMAL_Z) / 2 + DEEPMAL_BANK_OFFSET
CAMERA_X = river_x(Z_CAM) - 2.5

# Camera view basis, computed early (duplicates the section-12 look_target
# math — cheap, and needed here before the camera object exists) so the
# boat/tree — both metres from the lens — can be placed by offset from the
# actual view axis instead of by the river's own local curve X. Those two
# diverge fast along a meandering river: placing the boat by river_x(BOAT_Z)
# put it ~42 degrees off the camera's sightline to the bridge, aimed at a
# point ~100 m further along the meander — nowhere near this lens's ~29 deg
# half-FOV, so it silently never rendered. right is -X-leaning: this file's
# own convention (module docstring) is +Y = downstream/south, +X = east, so
# facing downstream puts west (-X) on the camera's right.
_look_x = river_x(BRIDGE_Z - 15)
_fwd = Vector((_look_x - CAMERA_X, (BRIDGE_Z - 15) - Z_CAM)).normalized()
_right = Vector((-_fwd.y, _fwd.x))


def cam_relative(forward_dist, right_offset):
    p = Vector((CAMERA_X, Z_CAM)) + _fwd * forward_dist + _right * right_offset
    return p.x, p.y


BOAT_X, BOAT_Z = cam_relative(8.0, 4.0)     # ahead, lower-left third (spec §4)
# (Sign verified empirically against a render, not re-derived: cam_relative's
# "right" axis is _fwd rotated -90 deg, which at this camera bearing points
# toward world -X — and world +X is screen-RIGHT here (docstring's coord
# note), so a positive right_offset lands screen-LEFT. Boat and tree both
# want screen-left, so both use a positive right_offset below.)

# TREE was previously placed river-relative (river_x(Z_CAM + 3) + a fixed
# bank margin), on the assumption that 3 m from the camera the river-curve/
# view-axis divergence is "negligible" — the same divergence that sent the
# boat 42 deg off-axis before it was switched to cam_relative(). Measured
# against the real river spline at the final Z_CAM=-25, it wasn't
# negligible: that placement was 76.5 deg off the view axis (checked with a
# one-off angle probe against the camera basis above), nowhere near even a
# wide lens's FOV — it silently never rendered. cam_relative() fixes it the
# same way it fixed the boat. The river is ~34 m wide right at the camera
# here, so a close-in offset still lands in the channel (checked against the
# real heightmap: height_at() stayed below WATER_Y out to about
# right_offset=16 at forward_dist=20-26); (26, 18) is the closest point that
# clears the bank with real margin (~0.35 m of freeboard) and still sits
# inside the wider 21 mm lens set in section 12 below.
TREE_X, TREE_Z = cam_relative(26.0, 18.0)

CLEAR_ZONES = [
    (BRIDGE_X, BRIDGE_Z, 3.2 * BRIDGE_SCALE),
    (DEEPMAL_X, DEEPMAL_Z, 8.0),
    (BOAT_X, BOAT_Z, 6.0),
    (TREE_X, TREE_Z, 3.0),
    (CAMERA_X, Z_CAM, 5.0),
]

# =============================================================================
# 2. Terrain mesh: heightmap-driven grid, splat-blended PBR material.
# =============================================================================
terrain_col = bpy.data.collections.new('Terrain')
bpy.context.scene.collection.children.link(terrain_col)

SPACING = 1.6
nx = int((CROP_X[1] - CROP_X[0]) / SPACING) + 1
nz = int((CROP_Z[1] - CROP_Z[0]) / SPACING) + 1
print(f'terrain grid {nx} x {nz} = {nx * nz} verts')

bm = bmesh.new()
uv_layer_name_splat = 'UVSplat'
grid_verts = [[None] * nx for _ in range(nz)]
for j in range(nz):
    z = CROP_Z[0] + j * (CROP_Z[1] - CROP_Z[0]) / (nz - 1)
    for i in range(nx):
        x = CROP_X[0] + i * (CROP_X[1] - CROP_X[0]) / (nx - 1)
        y = height_at(x, z)
        v = bm.verts.new((x, z, y))  # Blender (X, Y=data-z, Z=height)
        grid_verts[j][i] = v
bm.verts.ensure_lookup_table()

faces = []
for j in range(nz - 1):
    for i in range(nx - 1):
        f = bm.faces.new((grid_verts[j][i], grid_verts[j][i + 1],
                           grid_verts[j + 1][i + 1], grid_verts[j + 1][i]))
        faces.append(f)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

terrain_mesh = bpy.data.meshes.new('TerrainMesh')
bm.to_mesh(terrain_mesh)
bm.free()
for p in terrain_mesh.polygons:
    p.use_smooth = True
terrain_obj = bpy.data.objects.new('Terrain', terrain_mesh)
terrain_col.objects.link(terrain_obj)

uv = terrain_mesh.uv_layers.new(name=uv_layer_name_splat)
zmax_data = BOUNDS['zMax']
for poly in terrain_mesh.polygons:
    for li in poly.loop_indices:
        vi = terrain_mesh.loops[li].vertex_index
        vx, vy, _ = terrain_mesh.vertices[vi].co
        u = (vx - BOUNDS['xMin']) / EXTENT
        v = (zmax_data - vy) / EXTENT  # V=0 samples the image's bottom row
        uv.data[li].uv = (u, v)        # (PNG's last row = zMax) — see module
        # docstring's coordinate note; this aligns the shader's Image Texture
        # sampling (bottom-up) with gen-terrain.mjs's top-down [gz][gx] rows.

# Per-face density attributes for the geometry-nodes scatter below: general
# vegetation suitability (low in/near the river and on steep laterite slopes)
# and a separate near-water mask (ferns/rocks prefer the banks).
dens_attr = terrain_mesh.attributes.new('scatter_density', type='FLOAT', domain='FACE')
water_attr = terrain_mesh.attributes.new('near_water', type='FLOAT', domain='FACE')


def smoothstep(edge0, edge1, x):
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def compute_face_masks():
    for poly in terrain_mesh.polygons:
        cx, cy, cz = poly.center
        z = cy
        dist_river = abs(cx - river_x(z)) - river_width_at(z) / 2
        near = 1 - smoothstep(3, 14, dist_river)
        base = smoothstep(1.5, 6, dist_river) * (1 - smoothstep(30, 46, dist_river))
        for (lx, lz, r) in CLEAR_ZONES:
            base *= smoothstep(r * 0.6, r, math.hypot(cx - lx, cy - lz))
        dens_attr.data[poly.index].value = base
        water_attr.data[poly.index].value = near


# =============================================================================
# 3. Terrain material: 4-way splat blend (real Poly Haven textures) with a
#    tiled detail UV, plus AO/curvature-driven dirt weathering.
# =============================================================================
def img_node(nt, path, non_color=False):
    node = nt.nodes.new('ShaderNodeTexImage')
    img = bpy.data.images.load(str(path))
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    node.image = img
    return node


mat = bpy.data.materials.new('TerrainSplat')
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputMaterial')
out.location = (900, 0)
bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
bsdf.location = (650, 0)
nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

uvmap_splat = nt.nodes.new('ShaderNodeUVMap')
uvmap_splat.uv_map = uv_layer_name_splat
uvmap_splat.location = (-1400, 300)
splat_tex = img_node(nt, TERRAIN / 'splat.png', non_color=True)
splat_tex.location = (-1150, 300)
nt.links.new(uvmap_splat.outputs['UV'], splat_tex.inputs['Vector'])
sep = nt.nodes.new('ShaderNodeSeparateColor')
sep.location = (-900, 300)
nt.links.new(splat_tex.outputs['Color'], sep.inputs['Color'])

detail_coord = nt.nodes.new('ShaderNodeTexCoord')
detail_coord.location = (-1400, -200)
detail_map = nt.nodes.new('ShaderNodeMapping')
detail_map.location = (-1150, -200)
detail_map.inputs['Scale'].default_value = (0.5, 0.5, 0.5)  # 1 tile / 2 m
nt.links.new(detail_coord.outputs['Object'], detail_map.inputs['Vector'])

TEX_SETS = [
    ('brown_mud_dry', 'R'),      # soil
    ('withered_grass', 'G'),     # grass
    ('rock_pitted_mossy', 'B'),  # laterite
    ('ganges_river_pebbles', 'A'),  # pebble
]
weight_out = {'R': sep.outputs['Red'], 'G': sep.outputs['Green'], 'B': sep.outputs['Blue']}
weight_out['A'] = splat_tex.outputs['Alpha']

scaled = []
for idx, (tex_id, chan) in enumerate(TEX_SETS):
    ctex = img_node(nt, TEX / f'{tex_id}_c_1024.webp')
    ctex.location = (-850, -300 - idx * 260)
    nt.links.new(detail_map.outputs['Vector'], ctex.inputs['Vector'])
    scale_node = nt.nodes.new('ShaderNodeVectorMath')
    scale_node.operation = 'SCALE'
    scale_node.location = (-550, -300 - idx * 260)
    nt.links.new(ctex.outputs['Color'], scale_node.inputs[0])
    nt.links.new(weight_out[chan], scale_node.inputs['Scale'])
    scaled.append(scale_node.outputs['Vector'])

add1 = nt.nodes.new('ShaderNodeVectorMath')
add1.operation = 'ADD'
add1.location = (-300, -400)
nt.links.new(scaled[0], add1.inputs[0])
nt.links.new(scaled[1], add1.inputs[1])
add2 = nt.nodes.new('ShaderNodeVectorMath')
add2.operation = 'ADD'
add2.location = (-150, -450)
nt.links.new(add1.outputs['Vector'], add2.inputs[0])
nt.links.new(scaled[2], add2.inputs[1])
add3 = nt.nodes.new('ShaderNodeVectorMath')
add3.operation = 'ADD'
add3.location = (0, -500)
nt.links.new(add2.outputs['Vector'], add3.inputs[0])
nt.links.new(scaled[3], add3.inputs[1])
blended_color = add3.outputs['Vector']

# One shared detail normal for subtle micro-bump breakup (rung 7 on the
# ladder — a full 4-way *normal* blend adds real node-graph weight for
# breakup this render's golden-hour haze won't make visible; skip it).
ntex = img_node(nt, TEX / 'withered_grass_n_1024.webp', non_color=True)
ntex.location = (-850, 450)
nt.links.new(detail_map.outputs['Vector'], ntex.inputs['Vector'])
normal_map = nt.nodes.new('ShaderNodeNormalMap')
normal_map.location = (-550, 450)
normal_map.inputs['Strength'].default_value = 0.35
nt.links.new(ntex.outputs['Color'], normal_map.inputs['Color'])
nt.links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])

# Weathering: AO + curvature (Pointiness) darken creases and hollows toward
# a wet-dirt brown — spec's "blending and weathering (AO/curvature dirt)".
ao_node = nt.nodes.new('ShaderNodeAmbientOcclusion')
ao_node.location = (150, 200)
ao_node.samples = 8
geo = nt.nodes.new('ShaderNodeNewGeometry')
geo.location = (150, 50)
occ_mix = nt.nodes.new('ShaderNodeMath')
occ_mix.operation = 'MULTIPLY'
occ_mix.location = (350, 150)
inv_point = nt.nodes.new('ShaderNodeMath')
inv_point.operation = 'SUBTRACT'
inv_point.inputs[0].default_value = 1.0
inv_point.location = (150, -50)
nt.links.new(geo.outputs['Pointiness'], inv_point.inputs[1])
inv_ao = nt.nodes.new('ShaderNodeMath')
inv_ao.operation = 'SUBTRACT'
inv_ao.inputs[0].default_value = 1.0
inv_ao.location = (150, 350)
nt.links.new(ao_node.outputs['Color'], inv_ao.inputs[1])
nt.links.new(inv_ao.outputs['Value'], occ_mix.inputs[0])
nt.links.new(inv_point.outputs['Value'], occ_mix.inputs[1])
dirt_clamp = nt.nodes.new('ShaderNodeMath')
dirt_clamp.operation = 'MULTIPLY'
dirt_clamp.inputs[1].default_value = 0.55
dirt_clamp.location = (550, 150)
nt.links.new(occ_mix.outputs['Value'], dirt_clamp.inputs[0])
dirt_color = nt.nodes.new('ShaderNodeRGB')
dirt_color.outputs[0].default_value = (0.10, 0.07, 0.05, 1)
dirt_color.location = (350, 300)
weathered_mix = nt.nodes.new('ShaderNodeMixRGB')
weathered_mix.location = (750, 150)
nt.links.new(dirt_clamp.outputs['Value'], weathered_mix.inputs['Fac'])
nt.links.new(blended_color, weathered_mix.inputs['Color1'])
nt.links.new(dirt_color.outputs[0], weathered_mix.inputs['Color2'])
nt.links.new(weathered_mix.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.88

terrain_mesh.materials.append(mat)
compute_face_masks()
print('TERRAIN_BUILT verts=', len(terrain_mesh.vertices), 'polys=', len(terrain_mesh.polygons))

# =============================================================================
# 4. River: a meandering ribbon at WATER_Y, real width per z (spec §7 water —
#    reflection via Fresnel + world/HDRI, depth colour via a Beer-Lambert-ish
#    fade to a dark silt tone at the centre, subtle ripples via a bump normal).
# =============================================================================
river_col = bpy.data.collections.new('River')
bpy.context.scene.collection.children.link(river_col)

rbm = bmesh.new()
N_RIVER = 80
river_rows = []
for k in range(N_RIVER + 1):
    z = CROP_Z[0] + k * (CROP_Z[1] - CROP_Z[0]) / N_RIVER
    cx = river_x(z)
    hw = river_width_at(z) / 2
    y = WATER_Y - 0.02 * max(0, z - Z_CAM) / 100  # a hint of downstream fall
    vl = rbm.verts.new((cx - hw, z, y))
    vr = rbm.verts.new((cx + hw, z, y))
    river_rows.append((vl, vr))
for k in range(N_RIVER):
    l0, r0 = river_rows[k]
    l1, r1 = river_rows[k + 1]
    rbm.faces.new((l0, r0, r1, l1))
bmesh.ops.recalc_face_normals(rbm, faces=rbm.faces)
river_mesh = bpy.data.meshes.new('RiverMesh')
rbm.to_mesh(river_mesh)
rbm.free()
river_uv = river_mesh.uv_layers.new(name='UVFlow')
for poly in river_mesh.polygons:
    for li in poly.loop_indices:
        vi = river_mesh.loops[li].vertex_index
        vx, vy, _ = river_mesh.vertices[vi].co
        river_uv.data[li].uv = (vx * 0.15, vy * 0.15)
river_obj = bpy.data.objects.new('River', river_mesh)
river_col.objects.link(river_obj)

water_mat = bpy.data.materials.new('Water')
water_mat.use_nodes = True
wnt = water_mat.node_tree
wnt.nodes.clear()
wout = wnt.nodes.new('ShaderNodeOutputMaterial')
wout.location = (700, 0)
nt_link = wnt.links.new

wuv = wnt.nodes.new('ShaderNodeUVMap')
wuv.uv_map = 'UVFlow'
wuv.location = (-900, -200)
noise1 = wnt.nodes.new('ShaderNodeTexNoise')
noise1.location = (-650, -200)
noise1.inputs['Scale'].default_value = 9.0
noise1.inputs['Detail'].default_value = 3.0
nt_link(wuv.outputs['UV'], noise1.inputs['Vector'])
bump = wnt.nodes.new('ShaderNodeBump')
bump.location = (-350, -200)
bump.inputs['Strength'].default_value = 0.08  # a touch stronger than before
# (art-direction fix's "subtle ripple/normal map") — needs to be visible
# enough to break the reflection up, not just perturb a diffuse base.
nt_link(noise1.outputs['Fac'], bump.inputs['Height'])

# depth colour: darker, COOLER tone throughout (art-direction fix — the flat
# tan diffuse plane read warm everywhere; real river water at golden hour
# still reads blue-grey in the body, with the gold coming from the sky/
# bridge/tower reflection below, not the water's own pigment).
center_dist = wnt.nodes.new('ShaderNodeTexCoord')
center_dist.location = (-900, 200)
sep_g = wnt.nodes.new('ShaderNodeSeparateXYZ')
sep_g.location = (-650, 200)
nt_link(center_dist.outputs['Generated'], sep_g.inputs['Vector'])
depth_ramp = wnt.nodes.new('ShaderNodeValToRGB')
depth_ramp.location = (-350, 200)
depth_ramp.color_ramp.elements[0].position = 0.35
depth_ramp.color_ramp.elements[0].color = (0.014, 0.028, 0.038, 1)  # deep, cool silt
depth_ramp.color_ramp.elements[1].position = 0.85
depth_ramp.color_ramp.elements[1].color = (0.07, 0.10, 0.11, 1)     # shallow, still cool
gen_x = sep_g.outputs['X']
absx = wnt.nodes.new('ShaderNodeMath')
absx.operation = 'ABSOLUTE'
absx.location = (-500, 200)
nt_link(gen_x, absx.inputs[0])
nt_link(absx.outputs['Value'], depth_ramp.inputs['Fac'])

base_bsdf = wnt.nodes.new('ShaderNodeBsdfDiffuse')
base_bsdf.location = (0, 200)
nt_link(depth_ramp.outputs['Color'], base_bsdf.inputs['Color'])
nt_link(bump.outputs['Normal'], base_bsdf.inputs['Normal'])

# reflection: a REAL raytraced mirror of the bridge/tower/sky (use_raytracing
# is already on, section 12), not the old flat golden-tint hack — art-
# direction fix: "bridge and tower should mirror legibly, ~40% reflection
# strength per concept" reads as a flat art-directed mix, not a Fresnel
# curve, so it's a fixed MixShader factor rather than Fresnel-driven.
refl_bsdf = wnt.nodes.new('ShaderNodeBsdfGlossy')
refl_bsdf.location = (0, 0)
refl_bsdf.inputs['Roughness'].default_value = 0.05
nt_link(bump.outputs['Normal'], refl_bsdf.inputs['Normal'])

water_mix = wnt.nodes.new('ShaderNodeMixShader')
water_mix.location = (350, 100)
water_mix.inputs['Fac'].default_value = 0.4  # ~40% reflection strength
nt_link(base_bsdf.outputs['BSDF'], water_mix.inputs[1])
nt_link(refl_bsdf.outputs['BSDF'], water_mix.inputs[2])
nt_link(water_mix.outputs['Shader'], wout.inputs['Surface'])

river_mesh.materials.append(water_mat)
print('RIVER_BUILT polys=', len(river_mesh.polygons))

# =============================================================================
# 5. Fog band: cheap alpha-blended cards 0-4 m over the water (spec explicitly
#    allows this as an alternative to true volumetrics — "a volumetric OR
#    depth fog band"). Reliable in EEVEE without fighting volume-render
#    toggles for a single still frame.
# =============================================================================
fog_col = bpy.data.collections.new('Fog')
bpy.context.scene.collection.children.link(fog_col)

fog_mat = bpy.data.materials.new('FogBand')
fog_mat.use_nodes = True
fnt = fog_mat.node_tree
fnt.nodes.clear()
fout = fnt.nodes.new('ShaderNodeOutputMaterial')
fout.location = (400, 0)
ftrans = fnt.nodes.new('ShaderNodeBsdfTransparent')
femit = fnt.nodes.new('ShaderNodeEmission')
femit.inputs['Color'].default_value = (0.97, 0.85, 0.68, 1)
femit.inputs['Strength'].default_value = 0.9
fmix = fnt.nodes.new('ShaderNodeMixShader')
fmix.location = (150, 0)
ffres = fnt.nodes.new('ShaderNodeLayerWeight')
ffres.inputs['Blend'].default_value = 0.75
ffres.location = (-150, 100)
# ponytail: LayerWeight's Facing alone (fed straight into the mix factor)
# is what made the fog cards read as an opaque wall in spawn-v2.png. A near-
# horizontal camera views a horizontal card at an extreme grazing angle, and
# at Blend=0.75 that pushes Facing toward ~1.0 (mostly the Emission branch,
# not Transparent) exactly where this shot needs it to stay translucent. A
# Math-Multiply cap keeps the "thicker along a longer sightline" cue Facing
# is there for, without letting it reach full opacity; each card's cap is
# set below in the FOG_CARDS loop.
fcap = fnt.nodes.new('ShaderNodeMath')
fcap.operation = 'MULTIPLY'
fcap.inputs[1].default_value = 0.3
fcap.location = (-50, 100)
fnt.links.new(ffres.outputs['Facing'], fcap.inputs[0])
fnt.links.new(fcap.outputs['Value'], fmix.inputs['Fac'])
fnt.links.new(ftrans.outputs['BSDF'], fmix.inputs[1])
fnt.links.new(femit.outputs['Emission'], fmix.inputs[2])
fnt.links.new(fmix.outputs['Shader'], fout.inputs['Surface'])
fog_mat.blend_method = 'BLEND'
try:
    fog_mat.surface_render_method = 'BLENDED'
except (AttributeError, TypeError):
    pass
fog_mat.show_transparent_back = False

FOG_CARDS = [(0.35, 0.22), (1.4, 0.12), (2.6, 0.06)]  # (height, opacity-ish via alpha)
# ponytail: a card sized to the whole CROP_X/CROP_Z rectangle turns into a
# solid wall from this shot's low, near-horizontal camera — every ray at a
# given screen row crosses the SAME huge flat plane, and 3 cards stacked at
# the original alpha compounded to ~74% opaque (that's the flat brown bar
# across spawn-v2.png's first pass). Narrower cards hugging the river's
# meander envelope (it winds within about +-20 m of x=0, per riverX's own
# 14+6 amplitude) so the visible frustum's edges miss the band instead of
# wrapping it wall-to-wall, plus a lower per-card alpha so the 3-card stack
# still reads as haze, not a shutter.
FOG_HALF_WIDTH = 34.0
for idx, (fh, falpha) in enumerate(FOG_CARDS):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0.0,
                                                          (CROP_Z[0] + CROP_Z[1]) / 2, WATER_Y + fh))
    card = bpy.context.object
    card.name = f'FogCard_{idx}'
    card.scale = (FOG_HALF_WIDTH, (CROP_Z[1] - CROP_Z[0]) / 2, 1)
    m = fog_mat.copy()
    m.name = f'FogBand_{idx}'
    femit2 = m.node_tree.nodes['Emission']
    femit2.inputs['Strength'].default_value = 0.9
    m.node_tree.nodes['Math'].inputs[1].default_value = falpha
    card.data.materials.append(m)
    fog_col.objects.link(card)
    bpy.context.collection.objects.unlink(card)
bpy.ops.object.select_all(action='DESELECT')
print('FOG_BUILT')

# =============================================================================
# 6. World + sun: kloppenheim HDRI background, low golden-hour key light,
#    backlit per spec §7 uSunDir (their Y-up (.18,.14,.97) -> our (x,z,y)).
# =============================================================================
world = bpy.data.worlds.new('SpawnSky')
bpy.context.scene.world = world
world.use_nodes = True
wtree = world.node_tree
wtree.nodes.clear()
wbg = wtree.nodes.new('ShaderNodeBackground')
wenv = wtree.nodes.new('ShaderNodeTexEnvironment')
wenv.image = bpy.data.images.load(str(TEX / 'kloppenheim_06_puresky_1k.hdr'))
wout2 = wtree.nodes.new('ShaderNodeOutputWorld')
# ponytail: kloppenheim_06_puresky is a neutral daylight sky (spec §9 only
# promises it for the foliage-atlas bake and offline lookdev, not that it's
# golden-hour colored). Fed straight into Background at strength 1.1 it read
# as flat pale blue/white and washed out every other cue in spawn-v2.png's
# first pass — no visible warmth, and the tree/ghat/fog all disappeared into
# the glare. A cheap multiply tint plus a lower strength stop the ambient
# from fighting the sun instead of trying to relight the whole HDRI.
warm_tint = wtree.nodes.new('ShaderNodeRGB')
warm_tint.outputs[0].default_value = (1.0, 0.62, 0.32, 1)
warm_mix = wtree.nodes.new('ShaderNodeMixRGB')
warm_mix.blend_type = 'MULTIPLY'
warm_mix.inputs['Fac'].default_value = 0.65
wtree.links.new(wenv.outputs['Color'], warm_mix.inputs['Color1'])
wtree.links.new(warm_tint.outputs[0], warm_mix.inputs['Color2'])

to_sun = Vector((0.18, 0.97, 0.14)).normalized()  # their (x,y,z)->our (x,z,y)

# Art-direction fix: the two unshaded white sphere primitives sitting on/
# above the water (SunDisc + its own bump-warped water reflection) were "the
# single biggest thing breaking the shot" — a mesh standing in for the sun
# reads as a stage prop, not a sun. Blender's own Sky Texture (native "sky/
# HDRI system", not a mesh) has a real sun_disc — physically sized, matched
# to sun_elevation/sun_rotation from the SAME to_sun vector the SunKey light
# below uses, so the visible disc and the directional light/shadows agree.
# Screened over the tinted HDRI (not a straight replace) so kloppenheim's sky
# colour/cloud detail survives; the disc and its horizon warmth are additive
# on top, which is also what makes the horizon read gold (art-direction
# fix — atmosphere: "warm the sky gradient toward orange/gold at the
# horizon" comes largely free from Sky Texture's own physical scattering
# model at an 8 deg elevation, on top of the existing warm_tint multiply).
sky_tex = wtree.nodes.new('ShaderNodeTexSky')
sky_types = [e.identifier for e in bpy.types.ShaderNodeTexSky.bl_rna.properties['sky_type'].enum_items]
sky_tex.sky_type = 'MULTIPLE_SCATTERING' if 'MULTIPLE_SCATTERING' in sky_types else 'HOSEK_WILKIE'
sky_tex.sun_elevation = math.asin(to_sun.z)
sky_tex.sun_rotation = math.atan2(to_sun.y, to_sun.x)
if hasattr(sky_tex, 'sun_disc'):
    sky_tex.sun_disc = True
    sky_tex.sun_size = math.radians(1.4)   # enlarged from the real ~0.5 deg —
    # visible at this render's exposure/resolution without a mesh stand-in.
    sky_tex.sun_intensity = 1.0
if hasattr(sky_tex, 'aerosol_density'):
    sky_tex.aerosol_density = 3.4  # extra dust haze toward the horizon (spec
    # §7 uHaze — "a dust term, stronger than the reference's"); 2.2 read as
    # only a faint tint next to the volume-fog test render, bumped further.
sky_damp = wtree.nodes.new('ShaderNodeVectorMath')
sky_damp.operation = 'SCALE'
sky_damp.inputs['Scale'].default_value = 0.55  # physically-based sun-disc
# radiance is huge; damp before adding so it reads as bright-but-detailed
# rather than a single fully clipped white disc.
wtree.links.new(sky_tex.outputs['Color'], sky_damp.inputs[0])
sky_add = wtree.nodes.new('ShaderNodeMixRGB')
sky_add.blend_type = 'ADD'
sky_add.inputs['Fac'].default_value = 1.0
wtree.links.new(warm_mix.outputs['Color'], sky_add.inputs['Color1'])
wtree.links.new(sky_damp.outputs['Vector'], sky_add.inputs['Color2'])
wtree.links.new(sky_add.outputs['Color'], wbg.inputs['Color'])
wbg.inputs['Strength'].default_value = 0.3
wtree.links.new(wbg.outputs['Background'], wout2.inputs['Surface'])

# --- atmosphere: a uniform-density world volume (art-direction fix — height
# fog + god rays through the bridge arch). ponytail: uniform density, not a
# true exponential-height falloff (a height-varying Gradient-Texture density
# would need Geometry>Position wired into the volume, more graph for a
# single establishing shot from near water level); upgrade path is that
# Gradient-Texture-driven Density input if a future shot needs a visible fog
# floor from higher up. Sized so a ~120-150 m sightline (about the camera-
# to-bridge distance) reads visibly softened: transmittance = exp(-density *
# distance). density=0.006 (the physically-derived first guess) turned out
# imperceptible at render scale/exposure — checked by cranking it to 0.02 in
# a throwaway render and confirming the haze DOES respond (so the volume was
# wired correctly, just under-dosed); 0.012 is the middle ground that still
# reads as haze rather than flattening the whole shot to grey. ---
vol_mat = bpy.data.materials.new('AtmosphereVolume')
vol_mat.use_nodes = True
vnt = vol_mat.node_tree
vnt.nodes.clear()
vout = vnt.nodes.new('ShaderNodeOutputMaterial')
pvol = vnt.nodes.new('ShaderNodeVolumePrincipled')
pvol.inputs['Density'].default_value = 0.012
pvol.inputs['Color'].default_value = (0.90, 0.80, 0.68, 1)  # warm dust, not grey
pvol.inputs['Anisotropy'].default_value = 0.55  # forward-scattering, so the
# sun shafts through the bridge arch actually read as shafts, not flat haze.
vnt.links.new(pvol.outputs['Volume'], vout.inputs['Volume'])
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, (CROP_Z[0] + CROP_Z[1]) / 2, 60))
atmo_vol = bpy.context.object
atmo_vol.name = 'AtmosphereVolume'
atmo_vol.data.name = 'AtmosphereVolume'
atmo_vol.scale = ((CROP_X[1] - CROP_X[0]) / 2, (CROP_Z[1] - CROP_Z[0]) / 2, 120)
atmo_vol.data.materials.append(vol_mat)
scene_eevee = bpy.context.scene.eevee
try:
    scene_eevee.use_volume_custom_range = True
    scene_eevee.volumetric_start = 0.5
    scene_eevee.volumetric_end = 260.0
    scene_eevee.volumetric_tile_size = '2'
    scene_eevee.volumetric_samples = 32
    scene_eevee.use_volumetric_shadows = True  # the bridge occludes the sun
    # through the volume everywhere except the arch openings — that occlusion
    # difference IS the god-ray/sun-shaft beat.
    scene_eevee.volumetric_shadow_samples = 8
except AttributeError:
    pass
print('ATMOSPHERE_VOLUME_BUILT')

sun_data = bpy.data.lights.new('SunKey', 'SUN')
sun_data.energy = 14.0  # up from 4.2 — at the old value the flat HDRI fill
# dominated the shading, so nothing read as backlit/golden-hour; this is
# roughly the level that actually casts a visible shadow/specular pattern
# under the AgX view transform below.
sun_data.angle = math.radians(1.2)
sun_data.color = (1.0, 0.74, 0.46)
sun_obj = bpy.data.objects.new('SunKey', sun_data)
sun_obj.rotation_euler = to_sun.to_track_quat('Z', 'Y').to_euler()
bpy.context.scene.collection.objects.link(sun_obj)
print('WORLD_SUN_BUILT')

# =============================================================================
# 7. Landmarks: append the two rebuilt kits' preview assemblies (a true full
#    span, not the bare export prototypes) plus the existing ghat-kit's
#    preview flight, then retexture their mat.sandstone/mat.paleStone with
#    the real Poly Haven stone (Generated/box coords — no UVs on these kits,
#    see the module docstring's rung-2 note in the ladder about triplanar).
# =============================================================================
import re
WORLD_V2_SHOWCASE = ROOT / '.showcase-work/world-v2'


def canonical_name(name):
    return re.sub(r'\.\d{3}$', '', name)


def dedupe_material(mat):
    base = canonical_name(mat.name)
    if base == mat.name:
        return mat
    if base in bpy.data.materials:
        return bpy.data.materials[base]
    mat.name = base
    return mat


def dedupe_object_materials(obj):
    if obj.type != 'MESH':
        return
    for i, slot in enumerate(obj.material_slots):
        if slot.material:
            obj.material_slots[i].material = dedupe_material(slot.material)


def import_preview(blend_path, name_prefix):
    before = set(bpy.data.objects)
    with bpy.data.libraries.load(str(blend_path), link=False) as (data_from, data_to):
        data_to.objects = list(data_from.objects)
    new_objs = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(f'{name_prefix}Root', None)
    bpy.context.scene.collection.objects.link(root)
    top_level = [o for o in new_objs if o.parent is None]
    for o in new_objs:
        bpy.context.scene.collection.objects.link(o)
        dedupe_object_materials(o)
    for o in top_level:
        o.parent = root
    return root, new_objs


bridge_root, bridge_objs = import_preview(
    WORLD_V2_SHOWCASE / 'sangam-keystone-bridge/sangam-keystone-bridge-preview.blend', 'Bridge')
deepmal_root, deepmal_objs = import_preview(
    WORLD_V2_SHOWCASE / 'fleet-deepmal/fleet-deepmal-preview.blend', 'Deepmal')
ghat_root, ghat_objs = import_preview(
    WORLD_V2_SHOWCASE / 'ghat-kit/ghat-kit-preview.blend', 'Ghat')
print(f'IMPORTED bridge={len(bridge_objs)} deepmal={len(deepmal_objs)} ghat={len(ghat_objs)}')


def retexture_stone(mat_name, color_path, normal_path, tile=0.35):
    if mat_name not in bpy.data.materials:
        return
    m = bpy.data.materials[mat_name]
    m.use_nodes = True
    nt2 = m.node_tree
    bsdf2 = next((n for n in nt2.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf2 is None:
        bsdf2 = nt2.nodes.new('ShaderNodeBsdfPrincipled')
    coord = nt2.nodes.new('ShaderNodeTexCoord')
    mapping = nt2.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (tile, tile, tile)
    nt2.links.new(coord.outputs['Generated'], mapping.inputs['Vector'])
    ctex2 = img_node(nt2, color_path)
    nt2.links.new(mapping.outputs['Vector'], ctex2.inputs['Vector'])
    nt2.links.new(ctex2.outputs['Color'], bsdf2.inputs['Base Color'])
    ntex2 = img_node(nt2, normal_path, non_color=True)
    nt2.links.new(mapping.outputs['Vector'], ntex2.inputs['Vector'])
    nmap2 = nt2.nodes.new('ShaderNodeNormalMap')
    nmap2.inputs['Strength'].default_value = 0.5
    nt2.links.new(ntex2.outputs['Color'], nmap2.inputs['Color'])
    nt2.links.new(nmap2.outputs['Normal'], bsdf2.inputs['Normal'])
    bsdf2.inputs['Roughness'].default_value = 0.82


retexture_stone('mat.sandstone', TEX / 'large_sandstone_blocks_01_c_1024.webp',
                 TEX / 'large_sandstone_blocks_01_n_1024.webp')
retexture_stone('mat.paleStone', TEX / 'white_sandstone_blocks_02_c_1024.webp',
                 TEX / 'white_sandstone_blocks_02_n_1024.webp')
print('LANDMARK_MATERIALS_RETEXTURED')

# --- place the bridge: rotate to the river's local tangent at BRIDGE_Z,
# scale to the real ~34 m channel width, set on the bank/bed. ---
_tangent_dx = (14 / 70) * math.cos(BRIDGE_Z / 70) + (6 / 23) * math.cos(BRIDGE_Z / 23 + 1.3)
bridge_root.rotation_euler = (0, 0, math.atan2(_tangent_dx, 1))
bridge_root.scale = (BRIDGE_SCALE, BRIDGE_SCALE, BRIDGE_HEIGHT_SCALE)
bridge_root.location = (BRIDGE_X, BRIDGE_Z, WATER_Y - 1.6)

deepmal_root.scale = (DEEPMAL_SCALE,) * 3
deepmal_root.location = (DEEPMAL_X, DEEPMAL_Z, height_at(DEEPMAL_X, DEEPMAL_Z))
# fleet-deepmal.py's own preview now places a real warm point light in every
# lit niche (art-direction pass 2) and those import along with the mesh via
# import_preview() above (it links every object in the library, not just
# meshes) — so the hand-placed 7-light tower-spine stand-in this block used
# to carry is gone; it would only double up on the kit's own lights now.

# ghat: face the water (rotate so the flight descends toward the bank edge,
# into the river). Same bank as the deepmal now (+X — see the DEEPMAL_X note
# above for why +X is the side that renders screen-right).
#
# Root-cause fix (art-direction pass — "replacing the bare sand-dune slope
# that's there now"): the old GHAT_X sat only ~1 m past the river's own
# half-width, i.e. still on the submerged channel bed, not the dry bank —
# checked directly against height_at() (a 1-off probe script, not eyeballed):
# every offset out to +10 m stayed BELOW WATER_Y at this z, which is exactly
# why nothing here ever rendered. The bank only clears the water by a few
# metres even 20+ m back from the channel (a genuinely low stretch, not a
# dune the ghat can be carved into at full kit scale), so two things move
# together: GHAT_TOP_OFFSET goes from 1 m to 20 m (onto ground that actually
# clears WATER_Y), and the flight's HEIGHT axis alone (not its width/tread)
# is compressed to fit what relief is actually there.
# ponytail: a non-uniform (1.1, 1.1, 0.4) scale tilts the stair prototype's
# rise:run ratio shallower than a real 27 cm riser; acceptable for a
# background prop read from ~90 m, revisit with a taller carved bank if this
# ghat ever needs a close-up shot.
GHAT_TOP_OFFSET = 25.0
GHAT_X = river_x(DEEPMAL_Z - 12) + river_width_at(DEEPMAL_Z - 12) / 2 + GHAT_TOP_OFFSET
ghat_root.rotation_euler = (0, 0, math.radians(-90))
ghat_root.scale = (1.6, 1.6, 0.55)  # wider than 1:1 too — at ~90 m out a
# real-scale flight/chhatri reads as a grey smudge next to the deepmal/
# bridge; a bit of extra footprint is what actually makes the chhatri's
# domed silhouette break the dune's skyline instead of blending into it.
ghat_root.location = (GHAT_X, DEEPMAL_Z - 12, height_at(GHAT_X, DEEPMAL_Z - 12) + 0.3)
print('LANDMARKS_PLACED')

# =============================================================================
# 8. Hero boat: a hodi hull (triangular-section loft, bow curled and raised),
#    a woven-look arched canopy, an oar, and the Poly Haven brass lantern
#    lit at the bow (spec §4's "lantern beat"). No boatman — concept frame 1
#    doesn't show one, and a rigged figure is exactly the kind of unrequested
#    detail the ladder says to skip for a lookdev background prop.
# =============================================================================
boat_col = bpy.data.collections.new('Boat')
bpy.context.scene.collection.children.link(boat_col)
planks = sh.pbr('mat.planks')
retexture_stone('mat.planks', TEX / 'weathered_brown_planks_c_1024.webp',
                 TEX / 'weathered_brown_planks_n_1024.webp', tile=0.7)

HULL_LEN, HULL_BEAM = 5.6, 1.5
# (y_frac, halfwidth, bottom_z, top_z)
STATIONS = [
    (-0.5, 0.001, 0.10, 0.30), (-0.36, 0.34, -0.02, 0.38), (-0.16, 0.46, -0.12, 0.42),
    (0.0, 0.50, -0.16, 0.44), (0.16, 0.46, -0.12, 0.46), (0.34, 0.30, 0.02, 0.52),
    (0.44, 0.16, 0.18, 0.62), (0.5, 0.02, 0.42, 0.78),
]
hbm = bmesh.new()
rows = []
for yf, hw, bz, tz in STATIONS:
    y = yf * HULL_LEN
    keel = hbm.verts.new((0, y, bz))
    gl = hbm.verts.new((-hw * HULL_BEAM, y, tz))
    gr = hbm.verts.new((hw * HULL_BEAM, y, tz))
    rows.append((keel, gl, gr))
for i in range(len(rows) - 1):
    k0, l0, r0 = rows[i]
    k1, l1, r1 = rows[i + 1]
    hbm.faces.new((k0, l0, l1, k1))
    hbm.faces.new((k0, k1, r1, r0))
    hbm.faces.new((l0, r0, r1, l1))  # deck/gunwale strip closing the top
bmesh.ops.recalc_face_normals(hbm, faces=hbm.faces)
hull_bm = sh.canonical_order(hbm)
hull = sh.new_mesh_object('HodiHull', hull_bm, planks)
boat_col.objects.link(hull)
bpy.context.collection.objects.unlink(hull)


def arch_tube(radius, half_len, n_arc=10, z_off=0.0):
    bm2 = bmesh.new()
    front, back = [], []
    for i in range(n_arc + 1):
        a = math.pi * i / n_arc
        x, z = radius * math.cos(a), z_off + radius * math.sin(a)
        front.append(bm2.verts.new((x, -half_len, z)))
        back.append(bm2.verts.new((x, half_len, z)))
    for i in range(n_arc):
        bm2.faces.new((front[i], front[i + 1], back[i + 1], back[i]))
    bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces)
    return sh.canonical_order(bm2)


canopy_mat = sh.material('mat.canopyWeave', (0.32, 0.22, 0.11), rough=0.85)
# Art-direction fix: a woven bamboo/cane texture (visible weave bump), not a
# flat untextured dome — two crossed Wave Textures (native procedural nodes,
# no image asset needed) fake a basket weave's over-under ridge pattern.
canopy_mat.use_nodes = True
_cnt = canopy_mat.node_tree
_cbsdf = next(n for n in _cnt.nodes if n.type == 'BSDF_PRINCIPLED')
_ccoord = _cnt.nodes.new('ShaderNodeTexCoord')
_cmap = _cnt.nodes.new('ShaderNodeMapping')
_cmap.inputs['Scale'].default_value = (14, 14, 14)
_cnt.links.new(_ccoord.outputs['Object'], _cmap.inputs['Vector'])
_wave_u = _cnt.nodes.new('ShaderNodeTexWave')
_wave_u.bands_direction = 'X'
_wave_u.inputs['Scale'].default_value = 6.0
_cnt.links.new(_cmap.outputs['Vector'], _wave_u.inputs['Vector'])
_wave_v = _cnt.nodes.new('ShaderNodeTexWave')
_wave_v.bands_direction = 'Y'
_wave_v.inputs['Scale'].default_value = 6.0
_cnt.links.new(_cmap.outputs['Vector'], _wave_v.inputs['Vector'])
_weave_mul = _cnt.nodes.new('ShaderNodeMath')
_weave_mul.operation = 'MULTIPLY'
_cnt.links.new(_wave_u.outputs['Fac'], _weave_mul.inputs[0])
_cnt.links.new(_wave_v.outputs['Fac'], _weave_mul.inputs[1])
_cbump = _cnt.nodes.new('ShaderNodeBump')
_cbump.inputs['Strength'].default_value = 0.35
_cnt.links.new(_weave_mul.outputs['Value'], _cbump.inputs['Height'])
_cnt.links.new(_cbump.outputs['Normal'], _cbsdf.inputs['Normal'])

canopy = sh.new_mesh_object('HodiCanopy', arch_tube(0.72, HULL_LEN * 0.30, z_off=0.42), canopy_mat)
canopy.location = (0, -HULL_LEN * 0.06, 0)
boat_col.objects.link(canopy)
bpy.context.collection.objects.unlink(canopy)

bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.025, depth=2.6,
                                     location=(0.55, -HULL_LEN * 0.3, 0.55),
                                     rotation=(math.radians(70), 0, math.radians(20)))
oar = bpy.context.object
oar.name = 'Oar'
oar.data.name = 'Oar'
oar.data.materials.append(planks)
sh.canonicalize_object(oar)
boat_col.objects.link(oar)
bpy.context.collection.objects.unlink(oar)

# Art-direction fix: a coiled rope prop at the bow — a few concentric,
# slightly offset tori (native primitive, no new asset) read as coiled line.
rope_mat = sh.material('mat.rope', (0.42, 0.33, 0.20), rough=0.8)
rope_parts = []
for i in range(4):
    rr = 0.11 - i * 0.018
    bpy.ops.mesh.primitive_torus_add(major_radius=rr, minor_radius=0.014,
                                      location=(0.5, -HULL_LEN * 0.42, 0.58 + i * 0.016),
                                      major_segments=14, minor_segments=6)
    rope_parts.append(bpy.context.object)
bpy.context.view_layer.objects.active = rope_parts[0]
for p in rope_parts:
    p.select_set(True)
bpy.ops.object.join()
rope = bpy.context.object
rope.name = 'RopeCoil'
rope.data.name = 'RopeCoil'
rope.data.materials.append(rope_mat)
sh.canonicalize_object(rope)
boat_col.objects.link(rope)
bpy.context.collection.objects.unlink(rope)
bpy.ops.object.select_all(action='DESELECT')

lantern_gltf = PH_MODELS / 'brass_diya_lantern/brass_diya_lantern_1k.gltf'
lantern_obj = None
if lantern_gltf.exists():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(lantern_gltf))
    new_lantern = [o for o in bpy.data.objects if o not in before]
    lantern_root = bpy.data.objects.new('LanternRoot', None)
    bpy.context.scene.collection.objects.link(lantern_root)
    for o in new_lantern:
        if o.parent is None:
            o.parent = lantern_root
    mesh_dims = [max(o.dimensions) for o in new_lantern if o.type == 'MESH' and max(o.dimensions) > 0]
    dims = max(mesh_dims) if mesh_dims else 0.38
    lantern_root.scale = (0.35 / dims,) * 3
    lantern_root.location = (-0.5, -HULL_LEN * 0.44, 0.5)
    lantern_obj = lantern_root
    glow = bpy.data.lights.new('LanternGlow', 'POINT')
    glow.energy = 45
    glow.color = (1.0, 0.68, 0.32)
    glow.shadow_soft_size = 0.05
    glow_obj = bpy.data.objects.new('LanternGlow', glow)
    glow_obj.location = lantern_root.location + Vector((0, 0, 0.12))
    bpy.context.scene.collection.objects.link(glow_obj)

    # Art-direction fix: a real emissive flame mesh, not just an invisible
    # point light — the diya-flame prototype (section 11) doesn't exist yet
    # at this point in the script, so this is its own small standalone cone.
    lantern_flame_mat = sh.material('mat.lanternFlame', sh.AMBER, emission=sh.AMBER, emission_strength=7.0)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.02, radius2=0.002, depth=0.06,
                                     location=glow_obj.location)
    lantern_flame = bpy.context.object
    lantern_flame.name = 'LanternFlame'
    lantern_flame.data.name = 'LanternFlame'
    lantern_flame.data.materials.append(lantern_flame_mat)
    sh.canonicalize_object(lantern_flame)

BOAT_YAW = math.radians(-14)
boat_root = bpy.data.objects.new('BoatRoot', None)
bpy.context.scene.collection.objects.link(boat_root)
for o in (hull, canopy, oar, rope):
    o.parent = boat_root
if lantern_obj is not None:
    lantern_obj.parent = boat_root
    lantern_flame.parent = boat_root
boat_root.rotation_euler = (0, 0, BOAT_YAW)
boat_root.location = (BOAT_X, BOAT_Z, WATER_Y + 0.12)
print('BOAT_BUILT')

# =============================================================================
# 9. Banyan-style hero tree, framing the left edge close to camera (spec §4
#    "Left edge (east bank): a hero banyan... aerial roots in silhouette").
#    Custom-built (spec's own banyan-neem.py precedent), not a downloaded
#    Poly Haven tree — see fetch-polyhaven-models.py's docstring for why.
# =============================================================================
tree_col = bpy.data.collections.new('Tree')
bpy.context.scene.collection.children.link(tree_col)
bark = sh.pbr('mat.bark')
retexture_stone('mat.bark', TEX / 'bark_brown_02_c_1024.webp', TEX / 'bark_brown_02_n_1024.webp', tile=0.9)
leaf_mat = sh.material('mat.banyanLeaf', (0.05, 0.09, 0.035), rough=0.75)

TREE_BASE_Z = height_at(TREE_X, TREE_Z)
bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.55, radius2=0.30, depth=4.2,
                                 location=(TREE_X, TREE_Z, TREE_BASE_Z + 2.1))
trunk = bpy.context.object
trunk.name = 'BanyanTrunk'
trunk.data.name = 'BanyanTrunk'
trunk.data.materials.append(bark)
sh.canonicalize_object(trunk)
tree_col.objects.link(trunk)
bpy.context.collection.objects.unlink(trunk)

# Art-direction fix: broad canopy (~3x trunk height in diameter). Trunk
# height is 4.2 m, so the canopy blobs now reach out to r+radius ~= 6.3 m
# (~12.6 m diameter, ~3x), up from the old ~9 m spread — and more blobs (14,
# up from 9) so the wider spread doesn't read as sparser.
rand = random.Random(7)
canopy_blobs = []
for i in range(14):
    ang = rand.uniform(0, math.tau)
    r = rand.uniform(0.8, 4.2)
    cx = TREE_X + r * math.cos(ang)
    cz_ = TREE_Z + r * math.sin(ang)
    cy = TREE_BASE_Z + rand.uniform(3.6, 6.4)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=rand.uniform(1.3, 2.2),
                                           location=(cx, cz_, cy))
    blob = bpy.context.object
    blob.scale = (1, 1, rand.uniform(0.55, 0.8))
    blob.data.materials.append(leaf_mat)
    canopy_blobs.append(blob)
bpy.ops.object.select_all(action='DESELECT')
for b in canopy_blobs:
    b.select_set(True)
bpy.context.view_layer.objects.active = canopy_blobs[0]
bpy.ops.object.join()
canopy_obj = bpy.context.object
canopy_obj.name = 'BanyanCanopy'
sh.canonicalize_object(canopy_obj)
tree_col.objects.link(canopy_obj)
bpy.context.collection.objects.unlink(canopy_obj)

# Art-direction fix: 15-20 hanging aerial root strands (up from 7), spread
# out to match the now-wider canopy.
root_parts = []
for i in range(18):
    ang = rand.uniform(0, math.tau)
    r = rand.uniform(0.4, 3.8)
    rx = TREE_X + r * math.cos(ang)
    rz = TREE_Z + r * math.sin(ang)
    ry_top = TREE_BASE_Z + rand.uniform(3.5, 6.0)
    length = rand.uniform(2.0, 4.6)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.05, radius2=0.015, depth=length,
                                     location=(rx, rz, ry_top - length / 2))
    root_parts.append(bpy.context.object)
bpy.ops.object.select_all(action='DESELECT')
for r in root_parts:
    r.select_set(True)
bpy.context.view_layer.objects.active = root_parts[0]
bpy.ops.object.join()
roots_obj = bpy.context.object
roots_obj.name = 'BanyanAerialRoots'
roots_obj.data.materials.append(bark)
sh.canonicalize_object(roots_obj)
tree_col.objects.link(roots_obj)
bpy.context.collection.objects.unlink(roots_obj)
print('TREE_BUILT')

# =============================================================================
# 10. Vegetation/rock scatter: real CC0 Poly Haven assets (fern/shrub/rock),
#     placed by a geometry-nodes modifier on the terrain, density-driven by
#     the 'scatter_density'/'near_water' face attributes painted in step 2
#     (excludes the river itself, steep laterite slopes, and every landmark's
#     clear zone).
# =============================================================================
def import_ph_collection(gltf_path, coll_name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(gltf_path))
    new_objs = [o for o in bpy.data.objects if o not in before]
    coll = bpy.data.collections.new(coll_name)
    bpy.context.scene.collection.children.link(coll)
    for o in new_objs:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    tris = sum(len(o.data.polygons) for o in new_objs if o.type == 'MESH')
    print(f'{coll_name}: {len(new_objs)} objs, ~{tris} polys')
    return coll


fern_coll = import_ph_collection(PH_MODELS / 'fern_02/fern_02_1k.gltf', 'GN_Fern')
shrub_coll = import_ph_collection(PH_MODELS / 'shrub_01/shrub_01_1k.gltf', 'GN_Shrub')
rock_coll = import_ph_collection(PH_MODELS / 'rock_moss_set_01/rock_moss_set_01_1k.gltf', 'GN_Rock')

scatter_ng = bpy.data.node_groups.new('TerrainScatter', 'GeometryNodeTree')
scatter_ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
scatter_ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
gi = scatter_ng.nodes.new('NodeGroupInput')
gi.location = (-1400, 0)
go = scatter_ng.nodes.new('NodeGroupOutput')
go.location = (1600, 0)
gnodes, glinks = scatter_ng.nodes, scatter_ng.links
join = gnodes.new('GeometryNodeJoinGeometry')
join.location = (1350, 0)
glinks.new(gi.outputs['Geometry'], join.inputs['Geometry'])


def scatter_branch(coll, density_max, seed, min_scale, max_scale, y_off, use_water_mask):
    dist = gnodes.new('GeometryNodeDistributePointsOnFaces')
    dist.distribute_method = 'RANDOM'
    dist.location = (-1100, y_off)
    # ponytail: GeometryNodeDistributePointsOnFaces' `inputs[name]` lookup is
    # broken in this Blender 5.2.2 build (raises/returns None for a socket
    # that demonstrably exists — verified interactively) while every other
    # node's name lookup works fine. Index the sockets this node needs by
    # position (Mesh=0, Density Max=3, Density=4, Density Factor=5, Seed=6)
    # instead of fighting it; upgrade back to name lookup once a Blender
    # build fixes it.
    #
    # ROOT CAUSE of the render hang (isolated with a probe script that
    # measured actual scatter-point counts via Points-to-Vertices, since
    # to_mesh() silently drops raw point-cloud geometry and had been making
    # an earlier check look clean when it wasn't): for
    # distribute_method='RANDOM' on this build, socket idx4 ("Density")
    # governs the real point count, NOT idx3 ("Density Max") as the node's
    # own input order implies. Leaving idx4 at its default (10.0 pts/m^2)
    # while only setting idx3 produced 221,906 points for THIS branch alone
    # (665,686 total scatter instances across the 3 branches — up to a
    # single 156k-tri shrub repeated 221,906x) instead of the intended
    # dozens-to-low-hundreds. That runaway instance count is what made
    # bpy.ops.render.render() stall silently at ~0% CPU for 7+ minutes, on
    # every engine — proven by trivial-scene smoke tests (default cube,
    # EEVEE, EEVEE+raytracing, EEVEE+HDRI world) all rendering in under 3s,
    # meaning it was never a headless GPU/Metal-context problem. Set both
    # sockets to the same value so this holds regardless of which one a
    # future Blender build actually honours for RANDOM.
    dist.inputs[3].default_value = density_max
    dist.inputs[4].default_value = density_max
    dist.inputs[6].default_value = seed
    glinks.new(gi.outputs['Geometry'], dist.inputs[0])

    dens_node = gnodes.new('GeometryNodeInputNamedAttribute')
    dens_node.data_type = 'FLOAT'
    dens_node.inputs['Name'].default_value = 'scatter_density'
    dens_node.location = (-1400, y_off - 120)
    density_src = dens_node.outputs['Attribute']
    if use_water_mask:
        water_node = gnodes.new('GeometryNodeInputNamedAttribute')
        water_node.data_type = 'FLOAT'
        water_node.inputs['Name'].default_value = 'near_water'
        water_node.location = (-1400, y_off - 220)
        mul = gnodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        mul.location = (-1250, y_off - 170)
        glinks.new(density_src, mul.inputs[0])
        glinks.new(water_node.outputs['Attribute'], mul.inputs[1])
        density_src = mul.outputs['Value']
    glinks.new(density_src, dist.inputs[5])

    coll_info = gnodes.new('GeometryNodeCollectionInfo')
    coll_info.inputs['Collection'].default_value = coll
    coll_info.inputs['Separate Children'].default_value = True
    coll_info.transform_space = 'RELATIVE'
    coll_info.location = (-800, y_off + 150)

    rand_rot = gnodes.new('FunctionNodeRandomValue')
    rand_rot.data_type = 'FLOAT_VECTOR'
    rand_rot.inputs['Min'].default_value = (0, 0, 0)
    rand_rot.inputs['Max'].default_value = (0, 0, math.tau)
    rand_rot.inputs['Seed'].default_value = seed + 100
    rand_rot.location = (-800, y_off - 60)

    rand_scale = gnodes.new('FunctionNodeRandomValue')
    rand_scale.data_type = 'FLOAT'
    rand_scale.inputs['Min'].default_value = min_scale
    rand_scale.inputs['Max'].default_value = max_scale
    rand_scale.inputs['Seed'].default_value = seed + 200
    rand_scale.location = (-800, y_off - 220)
    combine = gnodes.new('ShaderNodeCombineXYZ')
    combine.location = (-560, y_off - 220)
    for axis in ('X', 'Y', 'Z'):
        glinks.new(rand_scale.outputs['Value'], combine.inputs[axis])

    inst = gnodes.new('GeometryNodeInstanceOnPoints')
    inst.location = (-320, y_off)
    glinks.new(dist.outputs['Points'], inst.inputs['Points'])
    glinks.new(coll_info.outputs['Instances'], inst.inputs['Instance'])
    inst.inputs['Pick Instance'].default_value = True  # one random object from
    # the collection per point, not the whole collection stacked — matters a
    # lot here: rock_moss_set_01 alone is 6 rocks / 63k tris, shrub_01 is a
    # single 156k-tri object (measured at import, see GN_Shrub/GN_Rock log).
    glinks.new(rand_rot.outputs['Value'], inst.inputs['Rotation'])
    glinks.new(combine.outputs['Vector'], inst.inputs['Scale'])
    glinks.new(inst.outputs['Instances'], join.inputs['Geometry'])


# Densities are tuned against each asset's real (measured) triangle cost, not
# a uniform "vegetation field" — shrub_01 imported at ~156k tris for a single
# object, so it gets sparse hero-accent placement, not groundcover.
# Art-direction fix: vegetation coverage read as near 0% — at the old
# densities (0.006/0.05 pts/m^2) the whole crop area held only a handful of
# points. fern is the main groundcover lever here (bumped 6x); shrub stays
# closer to its original sparse "hero-accent" density — it's the 156k-tri
# single object the comment above already flags, so a big density jump
# there risks the same class of runaway-instance-count render hang this
# file's own history warns about, not just a slower render. Rock stays
# sparse too (ambient debris, not groundcover).
scatter_branch(shrub_coll, density_max=0.012, seed=1, min_scale=0.6, max_scale=1.1, y_off=300, use_water_mask=False)
scatter_branch(fern_coll, density_max=0.3, seed=2, min_scale=0.5, max_scale=0.9, y_off=0, use_water_mask=True)
scatter_branch(rock_coll, density_max=0.015, seed=3, min_scale=0.4, max_scale=0.9, y_off=-300, use_water_mask=True)

glinks.new(join.outputs['Geometry'], go.inputs['Geometry'])
scatter_mod = terrain_obj.modifiers.new('TerrainScatter', 'NODES')
scatter_mod.node_group = scatter_ng
print('SCATTER_BUILT')

# =============================================================================
# 11. Diyas, marigold petals, kites — simple instanced cards (shared mesh
#     data per category, deterministic seeded placement).
# =============================================================================
fx_col = bpy.data.collections.new('FX')
bpy.context.scene.collection.children.link(fx_col)
clay = sh.pbr('mat.clay')
flame_mat = sh.material('mat.diyaFlame', sh.AMBER, emission=sh.AMBER, emission_strength=6.0)
petal_mat = sh.material('mat.marigold', (0.95, 0.55, 0.12), rough=0.6)
petal_mat2 = sh.material('mat.marigoldPale', (0.97, 0.93, 0.75), rough=0.6)

DIYA_PROFILE = [(0.0, 0.0), (0.05, 0.0), (0.06, 0.018), (0.045, 0.03)]
diya_bm = sh.lathe(DIYA_PROFILE, steps=8)
diya_proto = sh.new_mesh_object('_Diya', sh.canonical_order(diya_bm), clay)
fx_col.objects.link(diya_proto)
bpy.context.collection.objects.unlink(diya_proto)
bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.014, radius2=0.001, depth=0.04, location=(0, 0, 0.045))
flame_proto = bpy.context.object
flame_proto.name = '_DiyaFlame'
flame_proto.data.materials.append(flame_mat)
sh.canonicalize_object(flame_proto)
fx_col.objects.link(flame_proto)
bpy.context.collection.objects.unlink(flame_proto)

bpy.ops.mesh.primitive_plane_add(size=0.09)
petal_proto = bpy.context.object
petal_proto.name = '_Petal'
petal_proto.data.materials.append(petal_mat)
petal_proto.rotation_euler = (0, 0, math.radians(45))
bpy.ops.object.select_all(action='DESELECT')
petal_proto.select_set(True)
bpy.context.view_layer.objects.active = petal_proto
bpy.ops.object.transform_apply(rotation=True)
sh.canonicalize_object(petal_proto)
fx_col.objects.link(petal_proto)
bpy.context.collection.objects.unlink(petal_proto)

rand2 = random.Random(11)


def scatter_instance(proto, n, center, radius, z, jitter_z, mat=None, on_water=False):
    made = []
    for i in range(n):
        d = math.sqrt(rand2.random()) * radius
        a = rand2.uniform(0, math.tau)
        x, y = center[0] + d * math.cos(a), center[1] + d * math.sin(a)
        zz = (z(x, y) if callable(z) else z) + rand2.uniform(-jitter_z, jitter_z)
        dup = proto.copy()
        dup.data = proto.data
        dup.location = (x, y, zz)
        dup.rotation_euler = (rand2.uniform(-0.15, 0.15), rand2.uniform(-0.15, 0.15), rand2.uniform(0, math.tau))
        s = rand2.uniform(0.75, 1.3)
        dup.scale = (s, s, s)
        if mat is not None:
            dup.data = proto.data.copy()
            dup.data.materials[0] = mat
        fx_col.objects.link(dup)
        made.append(dup)
    return made


# diyas along the ghat edge, lit
ghat_diyas = scatter_instance(diya_proto, 10, (GHAT_X + 0.6, DEEPMAL_Z - 12), 2.2, WATER_Y + 0.35, 0.05)
for d in ghat_diyas:
    f = flame_proto.copy()
    f.data = flame_proto.data
    f.location = d.location + Vector((0, 0, 0.045))
    fx_col.objects.link(f)

# a scatter of diyas + petals floating on the water between boat and bridge
water_diyas = scatter_instance(diya_proto, 8, ((BOAT_X + BRIDGE_X) / 2, (BOAT_Z + BRIDGE_Z) / 2), 40, WATER_Y + 0.02, 0.0)
for d in water_diyas:
    f = flame_proto.copy()
    f.data = flame_proto.data
    f.location = d.location + Vector((0, 0, 0.045))
    fx_col.objects.link(f)

scatter_instance(petal_proto, 45, ((BOAT_X + BRIDGE_X) / 2, (BOAT_Z + BRIDGE_Z) / 2), 42, WATER_Y + 0.015, 0.0,
                  mat=rand2.choice([petal_mat, petal_mat2]))
for _ in range(3):
    scatter_instance(petal_proto, 15, ((BOAT_X + BRIDGE_X) / 2, (BOAT_Z + BRIDGE_Z) / 2), 42, WATER_Y + 0.015, 0.0,
                      mat=rand2.choice([petal_mat, petal_mat2]))
# Art-direction fix: a scatter of floating marigold-orange petals NEAR THE
# BOAT specifically (concept shows them clustered right around the hull,
# parted by it) — the mid-river scatter above centers on the boat-bridge
# midpoint, 20+ m from the boat itself.
scatter_instance(petal_proto, 25, (BOAT_X, BOAT_Z), 3.2, WATER_Y + 0.015, 0.0,
                  mat=rand2.choice([petal_mat, petal_mat2]))
# a handful adrift near the boat/tree, mid-air (falling)
scatter_instance(petal_proto, 14, (TREE_X - 1.5, TREE_Z + 3), 3.5,
                  lambda x, y: WATER_Y + rand2.uniform(1.0, 4.5), 0.3, mat=petal_mat)

# kites: flat diamond cards on thin string lines, upper-left sky near the tree
kite_mat = sh.material('mat.kite', (0.85, 0.30, 0.20), rough=0.6)
for i in range(3):
    bpy.ops.mesh.primitive_plane_add(size=0.6)
    kite = bpy.context.object
    kite.name = f'Kite_{i}'
    kite.data.materials.append(kite_mat)
    kx = TREE_X + rand2.uniform(-3, 4)
    kz = TREE_Z + rand2.uniform(-3, 4)
    ky = TREE_BASE_Z + rand2.uniform(9, 15)
    kite.location = (kx, kz, ky)
    kite.rotation_euler = (rand2.uniform(-0.3, 0.3), rand2.uniform(-0.3, 0.3), math.radians(45) + rand2.uniform(-0.4, 0.4))
    fx_col.objects.link(kite)
    bpy.context.collection.objects.unlink(kite)

    string_bm = bmesh.new()
    v0 = string_bm.verts.new((0, 0, 0))
    v1 = string_bm.verts.new((0, 0, -(ky - TREE_BASE_Z - 1.5)))
    string_bm.edges.new((v0, v1))
    string_mesh = bpy.data.meshes.new(f'KiteString_{i}')
    string_bm.to_mesh(string_mesh)
    string_bm.free()
    string_obj = bpy.data.objects.new(f'KiteString_{i}', string_mesh)
    string_obj.location = (kx, kz, ky)
    fx_col.objects.link(string_obj)
print('FX_BUILT')

# =============================================================================
# 12. Camera + render settings: chase-height pose behind the boat, aimed
#     downstream past the bridge (spec §4's spawn shot). 1280px wide cap (16
#     GB machine, other builds running). Height is 544, not 720: the concept
#     frames (.showcase-work/concept/*.png) are 1584x672, a 2.357:1 cinematic
#     crop, and 1280x720 (1.78:1) reads boxy/turntable next to them — 1280x544
#     is 2.353:1, matching the concept grammar while staying under the 1280
#     width and 720 height caps.
# =============================================================================
cam_data = bpy.data.cameras.new('SpawnCam')
cam_data.lens = 21  # widened from 32mm: at Z_CAM=-25 the river is ~34 m wide
# right at the camera, so the tree (spec's left-edge framing prop, placed
# above via cam_relative(26, 18)) only clears the bank ~26-30 m off-axis — a
# 32mm lens' ~29 deg half-FOV can't reach that far. 21mm (~41 deg half-FOV)
# does, with the bridge (0.3 deg off-axis), deepmal (15.4 deg) and boat
# (26.6 deg) all still comfortably inside it.
cam_data.clip_start = 0.1
cam_data.clip_end = 2000
cam_obj = bpy.data.objects.new('SpawnCam', cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

CAM_Z = Z_CAM
cam_obj.location = (CAMERA_X, CAM_Z, WATER_Y + 1.65)
look_target = Vector((river_x(BRIDGE_Z - 15), BRIDGE_Z - 15, WATER_Y + 1.0))
# ponytail: aiming at WATER_Y+5 (the bridge's mid-height) over a ~105 m
# distance pitches the camera up by only ~1.8 deg, but that's still enough
# to push the near boat (7.5 m out, at the waterline) below this lens's
# ~27 deg vertical FOV at the 2.35:1 crop. WATER_Y+1.0 (near eye height)
# levels the shot — the bridge/deepmal have >10 deg of headroom either way,
# so levelling costs them nothing, and it's what brings the boat into frame.
direction = look_target - cam_obj.location
cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

scene = bpy.context.scene
engine_ids = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engine_ids else 'BLENDER_EEVEE'
scene.render.resolution_x = 1280
scene.render.resolution_y = 544
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX' if 'AgX' in [t.name for t in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items] else 'Standard'
scene.view_settings.look = 'AgX - Very High Contrast' if scene.view_settings.view_transform == 'AgX' else 'None'
try:
    scene.eevee.use_raytracing = True
except AttributeError:
    pass
try:
    scene.eevee.taa_render_samples = 48
except AttributeError:
    pass
try:
    scene.eevee.use_shadows = True
except AttributeError:
    pass

OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
scene.render.filepath = str(OUT_PNG)
scene.render.image_settings.file_format = 'PNG'

OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
print('SCENE_SAVED', OUT_BLEND)

print('RENDER_START engine=', scene.render.engine, 'res=', scene.render.resolution_x, 'x', scene.render.resolution_y)
bpy.ops.render.render(write_still=True)
print('SPAWN_RENDERED', OUT_PNG)
