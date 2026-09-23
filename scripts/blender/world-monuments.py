"""Low-poly landmark family, one named node per writing-world district.
Each object is a single mesh with a single material, so it drops straight
into an InstancedMesh geometry swap. Run with Blender --background
--python."""
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.showcase-work/blender-20260923/world-monuments'
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

def join_as(name, parts, mat, spread_x):
    """Join a list of primitive objects into a single named mesh, offset
    along X so the four monuments never overlap in the shared scene."""
    for obj in parts:
        obj.location.x += spread_x
    bpy.context.view_layer.objects.active = parts[0]
    for obj in parts:
        obj.select_set(True)
    bpy.ops.object.join()
    merged = bpy.context.object
    merged.name = name
    merged.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    return merged

# monument-canon: an obelisk. The founding lore, so it is the tallest and
# plainest silhouette.
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=.28, radius2=.16, depth=1.3, location=(0, 0, .65))
shaft = bpy.context.object
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=.16, radius2=0, depth=.22, location=(0, 0, 1.41))
tip = bpy.context.object
join_as('monument-canon', [shaft, tip], silver, spread_x=-3)

# monument-anthology: a stepped ziggurat, one step per published year band.
steps = []
for i, (size, height, z) in enumerate([(.62, .22, .11), (.46, .2, .32), (.32, .18, .51), (.2, .16, .68)]):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, z))
    step = bpy.context.object
    step.scale = (size, size, height)
    steps.append(step)
join_as('monument-anthology', steps, amber, spread_x=-1)

# monument-ink: a gate. Two pillars and a lintel, the threshold into a
# written world.
bpy.ops.mesh.primitive_cube_add(size=1, location=(-.34, 0, .55))
pillar_a = bpy.context.object
pillar_a.scale = (.11, .11, .55)
bpy.ops.mesh.primitive_cube_add(size=1, location=(.34, 0, .55))
pillar_b = bpy.context.object
pillar_b.scale = (.11, .11, .55)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.12))
lintel = bpy.context.object
lintel.scale = (.45, .13, .09)
join_as('monument-ink', [pillar_a, pillar_b, lintel], silver, spread_x=1)

# monument-excelsior: an open book on a lectern stand, two angled pages.
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=.2, radius2=.1, depth=.5, location=(0, 0, .25))
stand = bpy.context.object
bpy.ops.mesh.primitive_cube_add(size=1, location=(-.16, 0, .54))
page_a = bpy.context.object
page_a.scale = (.3, .22, .015)
page_a.rotation_euler = (0, .35, 0)
bpy.ops.mesh.primitive_cube_add(size=1, location=(.16, 0, .54))
page_b = bpy.context.object
page_b.scale = (.3, .22, .015)
page_b.rotation_euler = (0, -.35, 0)
join_as('monument-excelsior', [stand, page_a, page_b], amber, spread_x=3)

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'world-monuments.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/world-monuments.glb'),
    export_format='GLB', export_yup=True, use_selection=True)
print('WORLD_MONUMENTS_EXPORTED')
