"""Skills-orbit core: a bevel-inset gem-cut icosphere, amber over titanium.
Replaces the placeholder sphereGeometry(2.35,18,12) in SkillsOrbitScene, so it
is authored at the same 2.35 world-unit radius. Run with Blender
--background --python."""
from pathlib import Path
import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.showcase-work/blender-20260923/skills-core'
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

RADIUS = 2.35

bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=1, radius=RADIUS)
# Gem-cut: inset every facet and push its centre in slightly, so each face
# reads as a cut panel with a bevelled surround rather than a flat smooth
# ball.
bmesh.ops.inset_individual(bm, faces=list(bm.faces), thickness=RADIUS * .07, depth=-RADIUS * .018)
bm.faces.ensure_lookup_table()

mesh = bpy.data.meshes.new('SkillsCore')
mesh.materials.append(amber)
mesh.materials.append(silver)
bm.to_mesh(mesh)
bm.free()
core = bpy.data.objects.new('SkillsCore', mesh)
bpy.context.collection.objects.link(core)
# Split: the upper hemisphere reads amber (the measured, calibrated claim),
# the lower reads titanium (structural weight), same split logic as the
# torus-band palette in studio-orbit.py.
for poly in mesh.polygons:
    poly.material_index = 0 if poly.center.z >= 0 else 1

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'skills-core.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/skills-core.glb'), export_format='GLB', export_yup=True)
print('SKILLS_CORE_EXPORTED')
