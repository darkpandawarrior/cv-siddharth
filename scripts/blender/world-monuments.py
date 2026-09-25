"""Low-poly landmark family, one named node per writing-world district.
Each object is a single mesh with a single material, so it drops straight
into an InstancedMesh geometry swap. Run with Blender --background
--python."""
from pathlib import Path
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

# monument-canon: an obelisk on a stepped foot. The founding lore, so it is
# the tallest silhouette; the foot (silhouette pass) reads as a base rather
# than the shaft simply meeting the ground.
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, .05))
foot = bpy.context.object
foot.scale = (.42, .42, .1)
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=.28, radius2=.16, depth=1.3, location=(0, 0, .65 + .1))
shaft = bpy.context.object
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=.16, radius2=0, depth=.22, location=(0, 0, 1.41 + .1))
tip = bpy.context.object
join_as('monument-canon', [foot, shaft, tip], silver, spread_x=-3)

# monument-anthology: a stepped ziggurat, one step per published year band
# plus a slender capstone (silhouette pass) so the profile peaks sharply.
steps = []
for i, (size, height, z) in enumerate([
    (.62, .2, .1), (.48, .18, .29), (.36, .16, .45), (.26, .14, .59), (.14, .16, .72),
]):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, z))
    step = bpy.context.object
    step.scale = (size, size, height)
    steps.append(step)
join_as('monument-anthology', steps, amber, spread_x=-1)

# monument-ink: a gate. Two pillars with capital finials and a lintel, the
# threshold into a written world (silhouette pass: finials break the flat
# pillar tops).
bpy.ops.mesh.primitive_cube_add(size=1, location=(-.34, 0, .55))
pillar_a = bpy.context.object
pillar_a.scale = (.11, .11, .55)
bpy.ops.mesh.primitive_cube_add(size=1, location=(.34, 0, .55))
pillar_b = bpy.context.object
pillar_b.scale = (.11, .11, .55)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.12))
lintel = bpy.context.object
lintel.scale = (.45, .13, .09)
bpy.ops.mesh.primitive_cube_add(size=1, location=(-.34, 0, 1.005))
finial_a = bpy.context.object
finial_a.scale = (.15, .15, .045)
bpy.ops.mesh.primitive_cube_add(size=1, location=(.34, 0, 1.005))
finial_b = bpy.context.object
finial_b.scale = (.15, .15, .045)
join_as('monument-ink', [pillar_a, pillar_b, lintel, finial_a, finial_b], silver, spread_x=1)

# monument-excelsior: an open book on a lectern stand, two angled pages with
# a raised spine ridge between them (silhouette pass) so the book reads as
# bound rather than two floating slabs.
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
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, .58))
spine = bpy.context.object
spine.scale = (.03, .22, .05)
join_as('monument-excelsior', [stand, page_a, page_b, spine], amber, spread_x=3)

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'world-monuments.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/world-monuments.glb'),
    export_format='GLB', export_yup=True, use_selection=True)
compress_with_meshopt(ROOT / 'public/models/world-monuments.glb')
print('WORLD_MONUMENTS_EXPORTED')
