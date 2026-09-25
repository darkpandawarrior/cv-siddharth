"""Shared node marker: a faceted hex-capsule, cloned per graph node by the
scenes that mount it. Run with Blender --background --python."""
from pathlib import Path
import math
import bmesh
import bpy

# Not run through gltfpack (unlike the other 6 wow-pass assets): this GLB is
# already 2 KB raw, far under its 20 KB row, and StoryMapScene.tsx /
# FoundationGraphScene.tsx / SkillsOrbitScene.tsx all pull the Mesh straight
# off the scene graph (getObjectByName("SignalMarker") or scene.children[0])
# rather than mounting <primitive object={scene}>. gltfpack always wraps a
# compressed mesh in an extra decode-transform parent node (quantization
# requires it; only -noq, full precision with no meshopt benefit at all,
# turns it off), which would silently break that lookup at all three call
# sites. None of them are owned by this lane, and there is no size reason to
# risk it.
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

# Faceted hex-capsule: a waisted barrel (silhouette pass) rather than a
# plain bipyramid, so the marker reads as a cut bead from any angle. Two
# outer rings (narrow) plus two inner rings (a wider bulge at the waist)
# between the top and bottom apex caps, all hex-aligned so every band stays
# a clean quad.
OUTER_RADIUS, BULGE_RADIUS, CAP = .105, .14, .085
OUTER_Z, BULGE_Z = .08, .022

def hex_ring(bm, radius, z):
    return [bm.verts.new((radius * math.cos(a), radius * math.sin(a), z))
        for a in (math.tau * i / 6 for i in range(6))]

bm = bmesh.new()
apex_top = bm.verts.new((0, 0, OUTER_Z + CAP))
ring_top = hex_ring(bm, OUTER_RADIUS, OUTER_Z)
ring_bulge_top = hex_ring(bm, BULGE_RADIUS, BULGE_Z)
ring_bulge_bottom = hex_ring(bm, BULGE_RADIUS, -BULGE_Z)
ring_bottom = hex_ring(bm, OUTER_RADIUS, -OUTER_Z)
apex_bottom = bm.verts.new((0, 0, -OUTER_Z - CAP))
bm.verts.ensure_lookup_table()

def band(a_ring, b_ring):
    for i in range(6):
        j = (i + 1) % 6
        bm.faces.new((a_ring[i], a_ring[j], b_ring[j], b_ring[i]))

band(ring_top, ring_bulge_top)
band(ring_bulge_top, ring_bulge_bottom)
band(ring_bulge_bottom, ring_bottom)
for i in range(6):
    j = (i + 1) % 6
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
