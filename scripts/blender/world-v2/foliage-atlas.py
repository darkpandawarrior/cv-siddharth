"""World v2 foliage card atlas (world-v2-spec.md §6): a 4x4 grid of leaf
cards for the four families the runtime cross-card system (P3-01b) instances
-- banyan, neem, palm frond, marigold shrub -- lit by kloppenheim_06_puresky
(offline only; no runtime HDRI, world-v2-spec.md §9) and rendered to
atlas-color-1024.webp + atlas-normal-1024.webp. Budget: 400 KB for the pair.

Grid convention (read by whichever lane wires the runtime aVariant index,
P3-01b): cell_center(row, col) places family FAMILIES[row]'s cluster at
world Z = -3 + row*CELL (row 0 lowest Z, row 3 highest), column at world
X = -3 + col*CELL; both renders share one camera and geometry, so the two
images' cells line up pixel-for-pixel. Read the row/column back from a
rendered pixel by inverting that same formula, rather than assuming a
top/bottom screen convention this script does not itself assert.

Technique: each of the 16 cells is one small mesh object (a handful of flat
lens-shaped "leaf" quads scattered within its cell, deterministically seeded
per family+variant) built directly in its own grid cell in world space, so
one orthographic camera framing the whole 4x4 grid renders every cell in a
single pass -- no per-cell render-and-composite step. The color pass lights
the leaves with the HDRI through a Principled BSDF; the normal pass swaps in
an unlit Emission material driven by Geometry.Normal*0.5+0.5 with the world
light temporarily silenced, so no HDRI shading leaks into the encoded
normal. ponytail: this is an object-space normal approximation, not a
proper tangent-space bake through the compositor -- correct for a flat,
camera-facing cutout card (object space ~= tangent space here), and cheap;
upgrade to a real compositor Normal pass only if close-up per-leaf shading
under the InstancedMesh cross-cards ever needs it.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python foliage-atlas.py
"""
from pathlib import Path
import math
import random
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'foliage-atlas'
sh.clear_scene()

OUT_DIR = sh.ROOT / 'heavy/world/textures'
HDRI_PATH = OUT_DIR / 'kloppenheim_06_puresky_1k.hdr'
CELL = 2.0  # world units per grid cell
GRID = 4
ATLAS_PX = 1024

# (family id, leaf colour, leaf count, leaf half-length, leaf half-width)
FAMILIES = [
    ('banyan', (0.10, 0.28, 0.09), 5, 0.42, 0.24),
    ('neem', (0.16, 0.42, 0.14), 9, 0.22, 0.09),
    ('palmFrond', (0.32, 0.46, 0.14), 3, 0.62, 0.10),
    ('marigoldShrub', (0.20, 0.34, 0.12), 7, 0.20, 0.16),
]


def cell_center(row, col):
    origin = -(GRID - 1) * CELL / 2.0
    return (origin + col * CELL, 0.0, origin + row * CELL)


def add_leaf(bm, center, length, width, angle, sides=6):
    """A flat lens-shaped leaf quad in the XZ plane (camera faces -Y), built
    as a `sides`-gon fan so it reads as a leaf silhouette, not a rectangle."""
    verts = []
    for i in range(sides):
        t = i / sides
        # a lens profile: widest at the middle, pointed at both ends
        along = (t - 0.5) * 2.0  # -1..1
        r = math.sin(math.pi * (t))  # 0 at ends, 1 at the middle
        local = (r * width * 0.5, 0.0, along * length * 0.5)
        ca, sa = math.cos(angle), math.sin(angle)
        rotated = (local[0] * ca - local[2] * sa, 0.0, local[0] * sa + local[2] * ca)
        verts.append(bm.verts.new((center[0] + rotated[0], center[1], center[2] + rotated[2])))
    for i in range(1, sides - 1):
        bm.faces.new((verts[0], verts[i], verts[i + 1]))


def build_family_cell(family_id, base_color, leaf_count, leaf_len, leaf_w, center, seed):
    rng = random.Random(seed)
    bm = bmesh.new()
    for _ in range(leaf_count):
        offset = (rng.uniform(-0.55, 0.55), 0.0, rng.uniform(-0.55, 0.55))
        angle = rng.uniform(0, math.tau)
        scale = rng.uniform(0.75, 1.15)
        add_leaf(bm, (center[0] + offset[0], center[1], center[2] + offset[2]),
                 leaf_len * scale, leaf_w * scale, angle)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm = sh.canonical_order(bm)
    color_mat = sh.material(f'AtlasColor.{family_id}', base_color, metal=0.0, rough=0.7)
    obj = sh.new_mesh_object(f'AtlasCard.{family_id}', bm, color_mat, smooth=False)
    return obj, color_mat


def normal_preview_material(name):
    """Unlit Emission material encoding Geometry.Normal as RGB (see module
    docstring: object-space stand-in for a tangent-space normal map)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    remap = nt.nodes.new('ShaderNodeVectorMath')
    remap.operation = 'MULTIPLY_ADD'
    remap.inputs[1].default_value = (0.5, 0.5, 0.5)
    remap.inputs[2].default_value = (0.5, 0.5, 0.5)
    emit = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(geo.outputs['Normal'], remap.inputs[0])
    nt.links.new(remap.outputs['Vector'], emit.inputs['Color'])
    nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return mat


# --- build the 4x4 grid: family = row, variant = col. ---
built = []
for row, (family_id, base_color, leaf_count, leaf_len, leaf_w) in enumerate(FAMILIES):
    for col in range(GRID):
        seed = row * 1000 + col  # deterministic, distinct per cell
        center = cell_center(row, col)
        obj, color_mat = build_family_cell(family_id, base_color, leaf_count, leaf_len, leaf_w, center, seed)
        normal_mat = normal_preview_material(f'AtlasNormal.{family_id}.{col}')
        built.append((obj, color_mat, normal_mat))

# --- world: kloppenheim_06_puresky HDRI, offline lighting only. ---
world = bpy.data.worlds.new('AtlasWorld')
bpy.context.scene.world = world
world.use_nodes = True
bg_node = world.node_tree.nodes.get('Background')
env_node = world.node_tree.nodes.new('ShaderNodeTexEnvironment')
env_node.image = bpy.data.images.load(str(HDRI_PATH))
world.node_tree.links.new(env_node.outputs['Color'], bg_node.inputs['Color'])

# --- camera: orthographic, framing the whole 4x4 grid in one shot. ---
cam_data = bpy.data.cameras.new('AtlasCam')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = GRID * CELL
cam = bpy.data.objects.new('AtlasCam', cam_data)
cam.location = (0.0, -10.0, 0.0)
cam.rotation_euler = (math.radians(90.0), 0.0, 0.0)
bpy.context.collection.objects.link(cam)
bpy.context.scene.camera = cam

scene = bpy.context.scene
engine_ids = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engine_ids else 'BLENDER_EEVEE'
scene.render.resolution_x = ATLAS_PX
scene.render.resolution_y = ATLAS_PX
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'WEBP'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.quality = 90
if hasattr(scene, 'eevee'):
    scene.eevee.taa_render_samples = 32

# --- pass 1: color, lit by the HDRI through each family's Principled BSDF. ---
for obj, color_mat, _ in built:
    obj.data.materials[0] = color_mat
scene.render.filepath = str(OUT_DIR / 'atlas-color-1024.webp')
bpy.ops.render.render(write_still=True)

# --- pass 2: normal, unlit (world strength 0) so only the encoded normal
# emission shows, same camera and geometry as pass 1. ---
bg_node.inputs['Strength'].default_value = 0.0
for obj, _, normal_mat in built:
    obj.data.materials[0] = normal_mat
scene.render.filepath = str(OUT_DIR / 'atlas-normal-1024.webp')
bpy.ops.render.render(write_still=True)

print('FOLIAGE_ATLAS_RENDERED cells=16')
