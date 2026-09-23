"""Deterministic studio sculpture. Run with Blender --background --python."""
from pathlib import Path
import math
import bmesh
import bpy

def canonical_order(bm):
    """A modifier's evaluation order is keyed to internal heap pointers, so
    two runs of the same construction can emit identical geometry in a
    different element order. Rebuild a fresh bmesh with verts and faces
    inserted in a position-sorted, pure-Python order, so the exported GLB is
    byte-identical across runs, as the determinism gate requires."""
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

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.showcase-work/studio-20260923'
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

# Bands and markers are built as explicit bmesh (not bpy.ops primitives),
# because Blender's glTF exporter runs each mesh's loops through a
# content-addressed vertex/accessor cache; a bpy.ops primitive's own
# internal ordering feeds that cache in a way this Blender build reproduces
# differently between processes, which breaks the determinism gate even
# though the visible geometry never changes. Direct verts.new()/faces.new()
# in a fixed Python loop order removes the non-determinism at the source.
def build_torus(major_radius, minor_radius, major_segments, minor_segments):
    bm = bmesh.new()
    rings = []
    for i in range(major_segments):
        theta = math.tau * i / major_segments
        ring = []
        for j in range(minor_segments):
            phi = math.tau * j / minor_segments
            rad = major_radius + minor_radius * math.cos(phi)
            ring.append(bm.verts.new((rad * math.cos(theta), rad * math.sin(theta), minor_radius * math.sin(phi))))
        rings.append(ring)
    for i in range(major_segments):
        for j in range(minor_segments):
            a, b = rings[i][j], rings[(i + 1) % major_segments][j]
            c, d = rings[(i + 1) % major_segments][(j + 1) % minor_segments], rings[i][(j + 1) % minor_segments]
            bm.faces.new((a, b, c, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def build_uv_sphere(radius, segments, rings, center):
    bm = bmesh.new()
    top = bm.verts.new((center[0], center[1], center[2] + radius))
    bottom = bm.verts.new((center[0], center[1], center[2] - radius))
    belt = []
    for r in range(1, rings):
        phi = math.pi * r / rings
        z, rad = radius * math.cos(phi), radius * math.sin(phi)
        belt.append([bm.verts.new((center[0] + rad * math.cos(math.tau * s / segments),
            center[1] + rad * math.sin(math.tau * s / segments), center[2] + z)) for s in range(segments)])
    for s in range(segments):
        bm.faces.new((top, belt[0][(s + 1) % segments], belt[0][s]))
        bm.faces.new((bottom, belt[-1][s], belt[-1][(s + 1) % segments]))
    for r in range(len(belt) - 1):
        for s in range(segments):
            a, b = belt[r][s], belt[r][(s + 1) % segments]
            c, d = belt[r + 1][(s + 1) % segments], belt[r + 1][s]
            bm.faces.new((a, b, c, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

# Open sculptural bands: broad enough to catch the softbox, thin in silhouette.
for i, (radius, rotation, mat) in enumerate([
    (2.35, (math.radians(64), math.radians(15), 0), silver),
    (2.16, (math.radians(110), math.radians(-36), .35), amber),
    (1.98, (math.radians(28), math.radians(68), -.4), silver),
]):
    band_mesh = bpy.data.meshes.new(f'Orbit_band_{i}')
    build_torus(radius, .038, 160, 12).to_mesh(band_mesh)
    band_mesh.materials.append(mat)
    for poly in band_mesh.polygons: poly.use_smooth = True
    obj = bpy.data.objects.new(f'Orbit_band_{i}', band_mesh)
    obj.rotation_euler = rotation
    bpy.context.collection.objects.link(obj)
    for j in range(2):
        angle = .7 + j * math.pi
        marker_mesh = bpy.data.meshes.new(f'Signal_inset_{i}_{j}')
        build_uv_sphere(.085, 24, 12, (0, 0, 0)).to_mesh(marker_mesh)
        marker_mesh.materials.append(mint)
        for poly in marker_mesh.polygons: poly.use_smooth = True
        marker = bpy.data.objects.new(f'Signal_inset_{i}_{j}', marker_mesh)
        marker.parent = obj
        marker.location = (radius * math.cos(angle), radius * math.sin(angle), 0)
        bpy.context.collection.objects.link(marker)

# Hex-profile plinth: the sculpture's physical base, so it reads as a mounted
# instrument rather than a floating diagram. A 6-step spin gives the hex
# cross-section directly (no modifier stack, so the export stays
# deterministic); the profile itself carries the bevelled barrel edge.
PLINTH_PROFILE = [(1.6, 0), (1.9, .12), (1.9, .38), (1.6, .5)]
bm = bmesh.new()
verts = [bm.verts.new((r, 0, z)) for r, z in PLINTH_PROFILE]
edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1),
    angle=math.tau, steps=6, use_merge=True)
bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, -2.05))
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm = canonical_order(bm)
plinth_mesh = bpy.data.meshes.new('Plinth_hex')
bm.to_mesh(plinth_mesh)
bm.free()
plinth_mesh.materials.append(silver)
for poly in plinth_mesh.polygons: poly.use_smooth = True
plinth = bpy.data.objects.new('Plinth_hex', plinth_mesh)
bpy.context.collection.objects.link(plinth)

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'studio-orbit.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/studio-orbit.glb'), export_format='GLB', export_yup=True)
print('STUDIO_ORBIT_EXPORTED')
