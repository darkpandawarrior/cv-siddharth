"""Blueprint centrepiece: a lathe-turned calibration instrument with a
screw-threaded grip and a beveled dial rim. Run with Blender --background
--python."""
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

# Dial body profile: foot, neck, a FLAT dial disc, beveled rim lip. Kept
# flat across its whole face (rather than the old design's dome rising to
# z=.92 at the centre) because the needle (below) is a flat blade spanning
# from the pivot out toward the tick ring at one constant height; a domed
# centre would bury the pivot end of the needle inside the body's own solid
# geometry. Built in the durable source so the "bevel" is shape language,
# not a modifier.
PROFILE = [
    (0, 0), (.35, 0), (.32, .08), (.14, .22), (.11, .6),
    (.62, .62), (.66, .665), (.58, .7), (.3, .665), (0, .665),
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

# Engraved tick channel: a shallow silver groove recessed just under the tick
# ring, so the twelve ticks below sit inside a cut channel rather than
# floating on the bare dial face (wow-pass: "lathe dial with an engraved
# tick ring").
bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=6,
    location=(0, 0, .700), major_radius=.6, minor_radius=.016)
channel = bpy.context.object
channel.name = 'TickChannel'
channel.data.materials.append(silver)
for poly in channel.data.polygons: poly.use_smooth = True

# Beveled bezel: a distinct chamfered ring proud of the rim lip, turned as
# its own lathe profile so the bevel is a separate shape rather than the
# body's own taper (wow-pass: "beveled bezel").
bezel_bm = lathe([(.58, .715), (.655, .715), (.685, .735), (.615, .755), (.58, .715)], steps=48)
bezel_mesh = bpy.data.meshes.new('BezelRing')
bezel_bm.to_mesh(bezel_mesh)
bezel_bm.free()
for poly in bezel_mesh.polygons: poly.use_smooth = True
bezel_mesh.materials.append(silver)
bezel = bpy.data.objects.new('BezelRing', bezel_mesh)
bpy.context.collection.objects.link(bezel)

# Twelve mint tick marks around the dial disc, evenly spaced calibration
# readout points, sitting inside the engraved channel.
for i in range(12):
    a = math.tau * i / 12
    bpy.ops.mesh.primitive_cube_add(size=.032, location=(.6 * math.cos(a), .6 * math.sin(a), .705))
    tick = bpy.context.object
    tick.name = f'Tick_{i}'
    tick.scale = (1, 1, .55)
    tick.data.materials.append(mint)

# The needle: a separate node pivoting at its own local origin (the dial
# centre), so BlueprintInstrument.tsx can rotate it about Z without any
# recentring math (contract for P1-02 / M50). A long pointer toward the tick
# ring plus a short tail counterweight behind the pivot, in the Signal
# ceramic material (the live/verified accent) with a thin vertical rib so it
# reads as a raised needle rather than a flat decal.
needle_bm = bmesh.new()
kite_xy = [(0, -.12), (-.022, 0), (0, .52), (.022, 0)]  # tail, left, tip, right
top = [needle_bm.verts.new((x, y, .006)) for x, y in kite_xy]
bottom = [needle_bm.verts.new((x, y, -.006)) for x, y in kite_xy]
needle_bm.faces.new(top)
needle_bm.faces.new(tuple(reversed(bottom)))
for i in range(4):
    j = (i + 1) % 4
    needle_bm.faces.new((top[i], bottom[i], bottom[j], top[j]))
bmesh.ops.recalc_face_normals(needle_bm, faces=needle_bm.faces)
needle_mesh = bpy.data.meshes.new('NeedleMesh')
needle_bm.to_mesh(needle_mesh)
needle_bm.free()
for poly in needle_mesh.polygons: poly.use_smooth = False
needle_mesh.materials.append(mint)
needle = bpy.data.objects.new('needle', needle_mesh)
needle.location = (0, 0, .71)
bpy.context.collection.objects.link(needle)

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
compress_with_meshopt(ROOT / 'public/models/blueprint-instrument.glb')
print('BLUEPRINT_INSTRUMENT_EXPORTED')
