"""Blueprint centrepiece: a lathe-turned calibration instrument with a
screw-threaded grip and a beveled dial rim. Run with Blender --background
--python."""
from pathlib import Path
import math
import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.showcase-work/blender-20260923/blueprint-instrument'
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
mint = material('Signal ceramic', (.14, .8, .48), .35, .2, .6)

def canonical_order(bm):
    """bmesh merge/bevel/screw ops iterate an internal hash keyed by heap
    pointers, so two runs can emit identical geometry in a different element
    order. Rebuild a fresh bmesh with verts and faces inserted in a
    position-sorted, pure-Python order, so the exported GLB is byte-identical
    across runs, as the determinism gate requires."""
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    coords = [tuple(v.co) for v in bm.verts]
    faces_info = [([v.index for v in f.verts], f.material_index, f.smooth) for f in bm.faces]
    order = sorted(range(len(coords)), key=lambda i: tuple(round(c, 5) for c in coords[i]))
    remap = {old: new for new, old in enumerate(order)}
    out = bmesh.new()
    new_verts = [out.verts.new(coords[old]) for old in order]

    def rotate_to_min(loop):
        # A face's vertex loop can start at any point in its cycle without
        # changing the face; fix the start at its lowest index so the same
        # face always serializes the same way.
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
    return out

def lathe(profile_rz, steps=48):
    """Revolve a (radius, z) profile around Z. First and last points at r=0
    close the solid without separate caps."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profile_rz]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1),
        angle=math.tau, steps=steps, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return canonical_order(bm)

def canonicalize_object(obj):
    """Re-sort an object's mesh data (post-modifier-apply) the same way, for
    geometry that never passes through the lathe() bmesh above."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    out = canonical_order(bm)
    out.to_mesh(obj.data)
    out.free()
    obj.data.update()

# Dial body profile: foot, neck, dial disc, beveled rim lip, finial. Built
# in the durable source so the "bevel" is shape language, not a modifier.
PROFILE = [
    (0, 0), (.35, 0), (.32, .08), (.14, .22), (.11, .55),
    (.62, .62), (.66, .68), (.6, .72), (.5, .78), (.15, .86), (0, .92),
]
bm = lathe(PROFILE, steps=56)
mesh = bpy.data.meshes.new('InstrumentBody')
bm.to_mesh(mesh)
bm.free()
for poly in mesh.polygons: poly.use_smooth = True
mesh.materials.append(silver)
body = bpy.data.objects.new('InstrumentBody', mesh)
bpy.context.collection.objects.link(body)

# Amber calibration ring, inset just under the rim lip.
bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=8,
    location=(0, 0, .655), major_radius=.63, minor_radius=.018)
ring = bpy.context.object
ring.name = 'CalibrationRing'
ring.data.materials.append(amber)
for poly in ring.data.polygons: poly.use_smooth = True

# Twelve mint tick marks around the dial disc, evenly spaced calibration
# readout points.
for i in range(12):
    a = math.tau * i / 12
    bpy.ops.mesh.primitive_cube_add(size=.032, location=(.6 * math.cos(a), .6 * math.sin(a), .705))
    tick = bpy.context.object
    tick.name = f'Tick_{i}'
    tick.scale = (1, 1, .55)
    tick.data.materials.append(mint)

# Screw-threaded grip collar on the neck: a small profile edge revolved and
# advanced per turn by the Screw modifier, giving a knurled calibration grip.
grip_bm = bmesh.new()
gv = [grip_bm.verts.new(v) for v in ((.12, 0, .28), (.145, 0, .3), (.12, 0, .32))]
grip_bm.edges.new((gv[0], gv[1]))
grip_bm.edges.new((gv[1], gv[2]))
grip_mesh = bpy.data.meshes.new('GripProfile')
grip_bm.to_mesh(grip_mesh)
grip_bm.free()
grip = bpy.data.objects.new('GripProfile', grip_mesh)
bpy.context.collection.objects.link(grip)
screw = grip.modifiers.new('GripThread', 'SCREW')
screw.axis = 'Z'
screw.angle = math.radians(360 * 4)
screw.screw_offset = .05
screw.iterations = 1
screw.steps = 10
screw.render_steps = 10
screw.use_merge_vertices = True
bpy.context.view_layer.objects.active = grip
bpy.ops.object.modifier_apply(modifier=screw.name)
canonicalize_object(grip)
grip.name = 'GripThread'
grip.data.materials.append(silver)
for poly in grip.data.polygons: poly.use_smooth = False

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'blueprint-instrument.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/blueprint-instrument.glb'),
    export_format='GLB', export_yup=True, use_selection=True)
print('BLUEPRINT_INSTRUMENT_EXPORTED')
