"""Festival kit (live-data-spec.md section 2.2 row 15; master-plan.md#M16):
four distinct ambient forms for festival days, each its own meaning so
nothing double-books diya, lantern or amber (M16's "one form, one meaning"
resolution). Ambient, ungated by data -- ornament for a festival day, never
a second reading of a data count that already has its own mesh:
  - RangoliDecal: a floor decal, ghat-landing.
  - ToranGarland: a mango-leaf toran strung across a doorway/ghat rail.
  - PaperKite:    a festival kite in PAPER TINTS -- never amber (M16: amber
                   is already spoken for by fleet-deepmal's niche flames and
                   this project's own live commit diyas; a second amber user
                   would break "one form, one meaning").
  - Gudi:         a Gudi Padwa festival pole (bamboo + inverted pot + cloth).

No diya in this kit (M16 -- a commit is already the floating diya; a
festival diya would be a second meaning for the same form). Nothing here is
named diya* and the kit exports exactly these four nodes, no sockets: an
ambient form has no data count to socket for.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python festival-kit.py
"""
from pathlib import Path
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'festival-kit'
sh.clear_scene()

# None of these four tones are in the shared PBR table or the brand-accent
# set (_shared.py is frozen, M42) -- festival colour is deliberately its own
# palette, never AMBER/CYAN/GREEN (those carry data claims, section 0.3).
rangoli_mat = sh.material('mat.rangoli', (.78, .18, .12), metal=0.0, rough=0.5)
toran_leaf_mat = sh.material('mat.toranLeaf', (.24, .42, .16), metal=0.0, rough=0.7)
kite_paper_mat = sh.material('mat.paperKite', (.92, .88, .74), metal=0.0, rough=0.65)
gudi_cloth_mat = sh.material('mat.gudiCloth', (.85, .35, .10), metal=0.0, rough=0.6)

# --- rangoli decal: a flat octagon disc laid on the ghat landing ---
rangoli_bm = sh.lathe([(0.0, 0.0), (0.14, 0.0)], steps=8, close_caps=True)
rangoli_bm = sh.canonical_order(rangoli_bm)
rangoli = sh.new_mesh_object('RangoliDecal', rangoli_bm, rangoli_mat)

# --- toran garland: a shallow catenary strand of mango-leaf cards, joined
# into one node (the same join-into-one-object pattern candidai-rahat's
# Wheel and room-chhatri-kit's ChhatriUnit use) ---
N_LEAVES = 9
leaf_objs = []
for i in range(N_LEAVES):
    t = i / (N_LEAVES - 1)
    x = (t - 0.5) * 0.5
    z = -0.04 * (1 - (2 * t - 1) ** 2)  # simple catenary-ish sag
    bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.025, radius2=0.0, depth=0.05,
                                     location=(x, 0, z))
    leaf = bpy.context.object
    leaf.rotation_euler = (1.5707963, 0, 0)
    leaf.data.materials.append(toran_leaf_mat)
    leaf_objs.append(leaf)

bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = leaf_objs[0]
for leaf in leaf_objs:
    leaf.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
bpy.ops.object.join()
toran = bpy.context.object
toran.name = 'ToranGarland'
toran.data.name = 'ToranGarland'
sh.canonicalize_object(toran)
bpy.ops.object.select_all(action='DESELECT')


# --- paper kite: a diamond card in paper tints (never amber, M16) ---
def kite_bm():
    bm = bmesh.new()
    half = 0.05
    v = [bm.verts.new(p) for p in (
        (0, -half * 1.3, 0), (half, 0, 0.01), (0, half * 1.3, 0), (-half, 0, 0.01))]
    bm.faces.new(v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return sh.canonical_order(bm)


paper_kite = sh.new_mesh_object('PaperKite', kite_bm(), kite_paper_mat)

# --- gudi: a bamboo pole with an inverted brass pot and a draped cloth,
# joined into one node ---
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.008, depth=0.55, location=(0, 0, 0.275))
pole = bpy.context.object
pole.data.materials.append(sh.pbr('mat.bark'))

POT_PROFILE = [(0.0, 0), (0.028, 0), (0.032, 0.02), (0.024, 0.045), (0.0, 0.05)]
pot_bm = sh.lathe(POT_PROFILE, steps=10)
pot_mesh = bpy.data.meshes.new('_gudiPot')
pot_bm.to_mesh(pot_mesh)
pot_bm.free()
pot_mesh.materials.append(sh.pbr('mat.brass'))
pot = bpy.data.objects.new('_gudiPot', pot_mesh)
bpy.context.collection.objects.link(pot)
pot.location = (0, 0, 0.60)

bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.05, radius2=0.005, depth=0.14,
                                 location=(0, 0.02, 0.46))
cloth = bpy.context.object
cloth.rotation_euler = (0.35, 0, 0)
cloth.data.materials.append(gudi_cloth_mat)

bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = pole
for o in (pole, pot, cloth):
    o.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
bpy.ops.object.join()
gudi = bpy.context.object
gudi.name = 'Gudi'
gudi.data.name = 'Gudi'
sh.canonicalize_object(gudi)
bpy.ops.object.select_all(action='DESELECT')

kit_objects = [rangoli, toran, paper_kite, gudi]
assert len(kit_objects) == 4, 'festival-kit exports exactly four ambient nodes (M16)'
assert not any('diya' in o.name.lower() for o in kit_objects), 'no diya in the festival kit (M16)'
sh.export_kit(ID, kit_objects)


def pack_glb(path):
    """Compress with meshopt via the pinned npx gltfpack@1.2.0 call (house pattern, M42:
    _shared.py is frozen, so this lives here)."""
    path = Path(path)
    tmp = path.with_suffix('.tmp.glb')
    subprocess.run(
        ['npx', '-y', 'gltfpack@1.2.0', '-cc', '-kn', '-i', str(path), '-o', str(tmp)],
        check=True,
    )
    tmp.replace(path)


pack_glb(sh.MODELS_OUT / f'{ID}.glb')
print(f'{ID.upper().replace("-", "_")}_PACKED')
