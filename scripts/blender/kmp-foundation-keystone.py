"""KMP foundation keystone: a worked wedge at the hub of the includeBuild
roads, brushed titanium with an anodized amber inlay. Run with Blender
--background --python."""
from pathlib import Path
import math
import bmesh
import bpy

def canonicalize_object(obj):
    """A Bevel modifier's apply order is keyed to internal heap pointers, so
    two runs can emit identical geometry in a different element order.
    Rebuild a fresh bmesh with verts and faces inserted in a position-sorted,
    pure-Python order, so the exported GLB is byte-identical across runs, as
    the determinism gate requires."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    coords = [tuple(v.co) for v in bm.verts]
    faces_info = [([v.index for v in f.verts], f.material_index, f.smooth) for f in bm.faces]
    order = sorted(range(len(coords)), key=lambda i: tuple(round(c, 5) for c in coords[i]))
    remap = {old: new for new, old in enumerate(order)}
    out = bmesh.new()
    new_verts = [out.verts.new(coords[old]) for old in order]

    def rotate_to_min(loop):
        start = loop.index(min(loop))
        return loop[start:] + loop[:start]

    face_defs = sorted(
        (rotate_to_min([remap[i] for i in verts]), mat, smooth) for verts, mat, smooth in faces_info
    )
    for verts, mat, smooth in face_defs:
        face = out.faces.new(tuple(new_verts[i] for i in verts))
        face.material_index = mat
        face.smooth = smooth
    bmesh.ops.recalc_face_normals(out, faces=out.faces)
    bm.free()
    out.to_mesh(obj.data)
    out.free()
    obj.data.update()

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.showcase-work/blender-20260923/kmp-foundation-keystone'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metal, rough, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Emission Color'].default_value = (*color, 1)
    bsdf.inputs['Emission Strength'].default_value = emission
    return mat

silver = material('Brushed titanium', (.31, .38, .36), .82, .28)
amber = material('Anodized amber', (.8, .35, .085), .72, .26)

# Worked wedge: a four-sided frustum, wide face up (the visible cap surface
# where the roads meet) narrowing down into the foundation.
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=.22, radius2=.4, depth=.5, rotation=(0, 0, math.radians(45)))
wedge = bpy.context.object
wedge.name = 'KeystoneBody'
bevel = wedge.modifiers.new('KeystoneBevel', 'BEVEL')
bevel.width = .025
bevel.segments = 2
bpy.context.view_layer.objects.active = wedge
bpy.ops.object.modifier_apply(modifier=bevel.name)
canonicalize_object(wedge)
wedge.data.materials.append(silver)
for poly in wedge.data.polygons: poly.use_smooth = False

# Amber inlay: a diamond set into the cap face, the worked mark of assembly.
bpy.ops.mesh.primitive_cube_add(size=.16, location=(0, 0, .255), rotation=(0, 0, math.radians(45)))
inlay = bpy.context.object
inlay.name = 'KeystoneInlay'
inlay.scale = (1, 1, .12)
inlay.data.materials.append(amber)
for poly in inlay.data.polygons: poly.use_smooth = False

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'kmp-foundation-keystone.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/kmp-foundation-keystone.glb'),
    export_format='GLB', export_yup=True, use_selection=True)
print('KMP_FOUNDATION_KEYSTONE_EXPORTED')
