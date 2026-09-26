"""KMP foundation keystone: a voussoir-profiled wedge at the hub of the
includeBuild roads, brushed titanium with engraved rings and an anodized
amber inlay. Run with Blender --background --python."""
from pathlib import Path
import math
import bmesh
import bpy
import subprocess

def compress_with_meshopt(path):
    """Compress the exported GLB with meshopt via a dev-only npx binary
    (gltfpack is never added to package.json). -cc is the higher
    compression ratio; -kn keeps named nodes (e.g. blueprint-instrument's
    'needle') attached and lookup-able by name. gltfpack is deterministic
    given identical input, so this does not break the two-runs-identical
    gate; write to a sibling temp file first since gltfpack cannot read and
    write the same path."""
    path = Path(path)
    tmp = path.with_suffix('.tmp.glb')
    subprocess.run(
        ['npx', '-y', 'gltfpack@1.2.0', '-cc', '-kn', '-i', str(path), '-o', str(tmp)],
        check=True,
    )
    tmp.replace(path)


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

# Worked voussoir: a rectangular truncated wedge, narrow at the intrados
# (bottom, where it meets the foundation) and wide at the extrados (top cap,
# where the includeBuild roads converge), tapering more in span (X) than in
# depth (Y) so it reads as a true arch wedge rather than a generic frustum.
BX0, BY0 = .17, .19  # bottom (intrados) half-extents
TX0, TY0 = .32, .17  # top (extrados) half-extents
Z1 = .5
wedge_bm = bmesh.new()
b = [wedge_bm.verts.new(v) for v in (
    (-BX0, -BY0, 0), (BX0, -BY0, 0), (BX0, BY0, 0), (-BX0, BY0, 0))]
t = [wedge_bm.verts.new(v) for v in (
    (-TX0, -TY0, Z1), (TX0, -TY0, Z1), (TX0, TY0, Z1), (-TX0, TY0, Z1))]
wedge_bm.faces.new((b[3], b[2], b[1], b[0]))
wedge_bm.faces.new((t[0], t[1], t[2], t[3]))
for i in range(4):
    j = (i + 1) % 4
    wedge_bm.faces.new((b[i], t[i], t[j], b[j]))
bmesh.ops.recalc_face_normals(wedge_bm, faces=wedge_bm.faces)
wedge_mesh = bpy.data.meshes.new('KeystoneBody')
wedge_bm.to_mesh(wedge_mesh)
wedge_bm.free()
wedge = bpy.data.objects.new('KeystoneBody', wedge_mesh)
bpy.context.collection.objects.link(wedge)
bevel = wedge.modifiers.new('KeystoneBevel', 'BEVEL')
bevel.width = .022
bevel.segments = 3
bpy.context.view_layer.objects.active = wedge
bpy.ops.object.modifier_apply(modifier=bevel.name)
canonicalize_object(wedge)
wedge.data.materials.append(silver)
for poly in wedge.data.polygons: poly.use_smooth = False

# Engraved rings: two concentric grooves actually cut into the cap with a
# Boolean difference (a torus recessed under the top face does nothing
# visible on its own, it is simply buried inside the solid, which is what
# the first cut of this asset got wrong), reading as the worked assembly
# marks of a hub where several roads converge (wow-pass: "engraved rings").
# Both radii stay inside the top face's tighter Y half-extent (TY0=.17) so
# neither ring is clipped by the wedge's own side walls.
for i, major_r in enumerate((.08, .14)):
    bpy.ops.mesh.primitive_torus_add(major_segments=20, minor_segments=6,
        location=(0, 0, Z1), major_radius=major_r, minor_radius=.012)
    cutter = bpy.context.object
    cutter.name = f'KeystoneRingCutter_{i}'
    groove_bool = wedge.modifiers.new(f'KeystoneGroove_{i}', 'BOOLEAN')
    groove_bool.operation = 'DIFFERENCE'
    groove_bool.object = cutter
    bpy.context.view_layer.objects.active = wedge
    bpy.ops.object.modifier_apply(modifier=groove_bool.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
canonicalize_object(wedge)
for poly in wedge.data.polygons: poly.use_smooth = False

# Amber inlay: a diamond set into the cap face, the worked mark of assembly.
bpy.ops.mesh.primitive_cube_add(size=.14, location=(0, 0, Z1 + .005), rotation=(0, 0, math.radians(45)))
inlay = bpy.context.object
inlay.name = 'KeystoneInlay'
inlay.scale = (1, 1, .1)
inlay.data.materials.append(amber)
for poly in inlay.data.polygons: poly.use_smooth = False

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'kmp-foundation-keystone.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/kmp-foundation-keystone.glb'),
    export_format='GLB', export_yup=True, use_selection=True)
compress_with_meshopt(ROOT / 'public/models/kmp-foundation-keystone.glb')
print('KMP_FOUNDATION_KEYSTONE_EXPORTED')
