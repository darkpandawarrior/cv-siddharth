"""Shared node marker: a faceted hex-capsule, cloned per graph node by the
scenes that mount it. Run with Blender --background --python."""
from pathlib import Path
import math
import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.showcase-work/blender-20260923/signal-marker'
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

mint = material('Signal ceramic', (.14, .8, .48), .35, .2, .6)

# Hex-capsule: an elongated hexagonal bipyramid, built explicitly so its
# winding and topology are exact (six side quads plus twelve cap triangles).
RADIUS, HALF_BODY, CAP = .11, .08, .09

bm = bmesh.new()
ring_top = [bm.verts.new((RADIUS * math.cos(a), RADIUS * math.sin(a), HALF_BODY))
    for a in (math.tau * i / 6 for i in range(6))]
ring_bottom = [bm.verts.new((RADIUS * math.cos(a), RADIUS * math.sin(a), -HALF_BODY))
    for a in (math.tau * i / 6 for i in range(6))]
apex_top = bm.verts.new((0, 0, HALF_BODY + CAP))
apex_bottom = bm.verts.new((0, 0, -HALF_BODY - CAP))
bm.verts.ensure_lookup_table()

for i in range(6):
    j = (i + 1) % 6
    bm.faces.new((ring_top[i], ring_top[j], ring_bottom[j], ring_bottom[i]))
    bm.faces.new((apex_top, ring_top[j], ring_top[i]))
    bm.faces.new((apex_bottom, ring_bottom[i], ring_bottom[j]))

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

mesh = bpy.data.meshes.new('SignalMarker')
bm.to_mesh(mesh)
bm.free()
marker = bpy.data.objects.new('SignalMarker', mesh)
bpy.context.collection.objects.link(marker)
for poly in mesh.polygons: poly.use_smooth = True
mesh.materials.append(mint)

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'signal-marker.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/signal-marker.glb'), export_format='GLB', export_yup=True)
print('SIGNAL_MARKER_EXPORTED')
