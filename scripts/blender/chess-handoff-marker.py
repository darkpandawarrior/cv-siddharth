"""Chess handoff marker: two overlapping lathe-turned abstracted pawns
(baton pass) marking the Jan-2023 lichess-to-chess.com handoff. Run with
Blender --background --python."""
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
OUT = ROOT / '.showcase-work/blender-20260923/chess-handoff-marker'
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

amber = material('Anodized amber', (.8, .35, .085), .72, .26)
silver = material('Brushed titanium', (.31, .38, .36), .82, .28)
mint = material('Signal ceramic', (.14, .8, .48), .35, .2, .6)

def canonical_order(bm):
    """bmesh merge ops iterate an internal hash keyed by heap pointers, so two
    runs can emit identical geometry in a different element order. Rebuild a
    fresh bmesh with verts and faces inserted in a position-sorted, pure-
    Python order, so the exported GLB is byte-identical across runs, as the
    determinism gate requires."""
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
    return out

def lathe(profile_rz, steps=12):
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

# Abstracted pawn silhouette (silhouette pass): base bevel, neck, a distinct
# collar ring with a groove under it, then the rounded head, so it reads as
# a pawn's proportions rather than a plain spinning-top blob.
PAWN_PROFILE = [
    (0, 0), (.22, 0), (.2, .03), (.08, .16),
    (.07, .26), (.15, .3), (.11, .325), (.155, .355),
    (.16, .42), (.1, .5), (0, .56),
]

def make_pawn(name, x, mat):
    bm = lathe(PAWN_PROFILE)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    for poly in mesh.polygons: poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.location = (x, 0, 0)
    bpy.context.collection.objects.link(obj)
    return obj

# Overlapping baton pass: lichess (amber, the earlier calibration source)
# handing off to chess.com (titanium), close enough that their bases touch.
make_pawn('PawnLichess', -.16, amber)
make_pawn('PawnChessCom', .16, silver)

bpy.ops.mesh.primitive_torus_add(major_segments=12, minor_segments=5,
    rotation=(math.radians(90), 0, 0), location=(0, 0, .18), major_radius=.1, minor_radius=.016)
ring = bpy.context.object
ring.name = 'HandoffRing'
ring.data.materials.append(mint)
for poly in ring.data.polygons: poly.use_smooth = True

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'chess-handoff-marker.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/chess-handoff-marker.glb'),
    export_format='GLB', export_yup=True, use_selection=True)
compress_with_meshopt(ROOT / 'public/models/chess-handoff-marker.glb')
print('CHESS_HANDOFF_MARKER_EXPORTED')
