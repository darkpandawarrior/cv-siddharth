"""Deterministic studio sculpture. Run with Blender --background --python."""
from pathlib import Path
import math
import bpy

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

# Open sculptural bands: broad enough to catch the softbox, thin in silhouette.
for i, (radius, rotation, mat) in enumerate([
    (2.35, (math.radians(64), math.radians(15), 0), silver),
    (2.16, (math.radians(110), math.radians(-36), .35), amber),
    (1.98, (math.radians(28), math.radians(68), -.4), silver),
]):
    bpy.ops.mesh.primitive_torus_add(major_segments=160, minor_segments=12,
        location=(0, 0, 0), major_radius=radius, minor_radius=.038)
    obj = bpy.context.object
    obj.name = f'Orbit_band_{i}'
    obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.use_smooth = True
    for j in range(2):
        angle = .7 + j * math.pi
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=.085)
        marker = bpy.context.object
        marker.name = f'Signal_inset_{i}_{j}'
        marker.parent = obj
        marker.location = (radius * math.cos(angle), radius * math.sin(angle), 0)
        marker.data.materials.append(mint)
        for poly in marker.data.polygons: poly.use_smooth = True

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'studio-orbit.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/studio-orbit.glb'), export_format='GLB', export_yup=True)
print('STUDIO_ORBIT_EXPORTED')
