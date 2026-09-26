"""Misc kit: mooring post + signal lamp (the prototypes gaddi-ghat's
socket.mooring.NN empties were built for but had nothing to mount, art-
direction critic finding #2), plus this lane's (P2-07d) own additions --
kite, bell, marigold garland, paper lantern and a surveyor's peg -- each a
standalone instance prototype with nothing landmark-specific baked in, so
whichever socket or stream binds it just mounts the node by name.

Kit pieces:
  - MooringPost / mooringLamp: a weathered-plank bollard with a brass ring,
    and a thin post topped with an emissive glass head. The lamp's emission
    colour is the `ships`/green semantic (spec §0.3) that gaddi-ghat's
    mooring points use; a landmark whose mooring lamps carry a different
    semantic swaps the runtime material, not this kit.
  - kite, bell: plain ambient misc props (spec §6 row 6) -- no governed
    form, no live count, so no accent colour.
  - garland: a marigold-bud strand for the "artifact" form (living-ledger-
    spec §10 C7: "Artifacts become floating marigold garlands (ambient)").
    Amber is the marigold/fire-light semantic (spec §0.3 rule 3 names
    marigolds explicitly), so this is the one misc-kit node besides the
    lamp glow allowed an accent colour.
  - lantern: a paper lantern for the "lantern" form (a visitor, C6: "Ghosts
    ... appear as faint paper lanterns"). Cyan is "a measured connection"
    (spec §0.3) -- a live visitor's own realtime presence -- which fits this
    node better than amber (already fully spoken for by fire/light/diyas).
  - peg: a surveyor's stake for the future-slot "reserved" form (living-
    ledger-spec §8.2: "a surveyor's peg (a thin stake with an amber
    outline...)") -- the amber band is built into the geometry itself
    rather than left to a runtime outline shader.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python misc-kit.py
"""
from pathlib import Path
import math
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'misc-kit'
sh.clear_scene()

planks = sh.pbr('mat.planks')
brass = sh.pbr('mat.brass')
lamp_glow = sh.material('mat.mooringLampGlow', sh.GREEN, metal=0.0, rough=0.3,
                         emission=sh.GREEN, emission_strength=2.6)

# --- mooring post: a lathed timber bollard with a brass ring ---
POST_PROFILE = [(0.06, 0), (0.09, 0.02), (0.09, 0.30), (0.12, 0.34), (0.10, 0.38), (0.03, 0.44)]
post_bm = sh.lathe(POST_PROFILE, steps=10)
post_bm = sh.canonical_order(post_bm)
mooring_post = sh.new_mesh_object('MooringPost', post_bm, planks)

RING_PROFILE = [(0.10, 0), (0.115, 0.01), (0.115, 0.025), (0.10, 0.035)]
ring_bm = sh.lathe(RING_PROFILE, steps=12, close_caps=False)
ring_bm = sh.canonical_order(ring_bm)
ring = sh.new_mesh_object('MooringRing', ring_bm, brass)
ring.rotation_euler = (math.radians(90), 0, 0)
ring.location = (0.10, 0, 0.30)
ring.parent = mooring_post

# --- signal lamp: a thin post, a lantern head, and a small emissive core so
# the glow reads at landmark distance without an actual light data-block
# (offline preview stays lookdev-only, per the house pattern) ---
lamp_parts = []
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.025, depth=0.5, location=(0, 0, 0.25))
post = bpy.context.object
lamp_parts.append(post)

bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.06, depth=0.10, location=(0, 0, 0.55))
head = bpy.context.object
lamp_parts.append(head)

bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = lamp_parts[0]
for p in lamp_parts:
    p.select_set(True)
bpy.ops.object.join()
lamp_post = bpy.context.object
lamp_post.name = 'mooringLamp'
lamp_post.data.materials.clear()
lamp_post.data.materials.append(brass)
sh.canonicalize_object(lamp_post)
bpy.ops.object.select_all(action='DESELECT')

bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.045, location=(0, 0, 0.60))
glow = bpy.context.object
glow.name = 'mooringLampGlow'
glow.data.name = 'mooringLampGlow'
glow.data.materials.append(lamp_glow)
sh.canonicalize_object(glow)
glow.parent = lamp_post

# --- kite: a flat diamond card, plain cloth tint -- an ambient misc prop,
# never the amber/cyan/green accents (no live count behind this one) ---
kite_mat = sh.material('mat.miscKite', (.80, .32, .22), rough=.6)


def kite_bm():
    bm = bmesh.new()
    half = 0.05
    verts = [bm.verts.new(p) for p in (
        (0, -half * 1.3, 0), (half, 0, 0.01), (0, half * 1.3, 0), (-half, 0, 0.01))]
    bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return sh.canonical_order(bm)


kite = sh.new_mesh_object('kite', kite_bm(), kite_mat)

# --- bell: a lathed brass shell, no clapper -- plenty at landmark distance ---
BELL_PROFILE = [(0.0, 0.05), (0.026, 0.048), (0.032, 0.03), (0.028, 0.006), (0.010, -0.006)]
bell_bm = sh.canonical_order(sh.lathe(BELL_PROFILE, steps=8))
bell = sh.new_mesh_object('bell', bell_bm, brass)

# --- garland: a marigold-bud strand, joined into one node (the same join-
# into-one-object idiom festival-kit's ToranGarland uses) ---
garland_mat = sh.material('mat.marigold', sh.AMBER, metal=0.0, rough=0.6)
N_BUDS = 5
bud_parts = []
for i in range(N_BUDS):
    t = i / (N_BUDS - 1)
    x = (t - 0.5) * 0.36
    z = -0.03 * (1 - (2 * t - 1) ** 2)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=0, radius=0.020, location=(x, 0, z))
    bud_parts.append(bpy.context.object)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = bud_parts[0]
for b in bud_parts:
    b.select_set(True)
bpy.ops.object.join()
garland = bpy.context.object
garland.name = 'garland'
garland.data.name = 'garland'
garland.data.materials.clear()
garland.data.materials.append(garland_mat)
sh.canonicalize_object(garland)
bpy.ops.object.select_all(action='DESELECT')

# --- lantern: a paper lantern, cyan glow (a measured connection -- a live
# visitor's own presence, spec §0.3) ---
lantern_mat = sh.material('mat.paperLanternShell', (.94, .90, .78), metal=0.0, rough=0.7,
                           emission=sh.CYAN, emission_strength=1.4)
LANTERN_PROFILE = [(0.0, 0.0), (0.020, 0.006), (0.032, 0.024), (0.032, 0.048), (0.018, 0.066), (0.0, 0.072)]
lantern_bm = sh.canonical_order(sh.lathe(LANTERN_PROFILE, steps=8))
lantern = sh.new_mesh_object('lantern', lantern_bm, lantern_mat)

# --- peg: a surveyor's stake with an amber cap band (the "amber outline"
# living-ledger-spec §8.2 calls for, built into the geometry) ---
peg_amber_mat = sh.material('mat.surveyPegOutline', sh.AMBER, metal=0.0, rough=0.4,
                             emission=sh.AMBER, emission_strength=2.0)
PEG_PROFILE = [(0.010, 0.0), (0.008, 0.28), (0.012, 0.30), (0.008, 0.32)]
peg_bm = sh.canonical_order(sh.lathe(PEG_PROFILE, steps=6))
peg_stake = sh.new_mesh_object('_pegStake', peg_bm, sh.pbr('mat.bark'))

CAP_PROFILE = [(0.008, 0.32), (0.015, 0.325), (0.015, 0.345), (0.0, 0.35)]
cap_bm = sh.canonical_order(sh.lathe(CAP_PROFILE, steps=6))
peg_cap = sh.new_mesh_object('_pegCap', cap_bm, peg_amber_mat)

bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = peg_stake
for o in (peg_stake, peg_cap):
    o.select_set(True)
bpy.ops.object.join()
peg = bpy.context.object
peg.name = 'peg'
peg.data.name = 'peg'
sh.canonicalize_object(peg)
bpy.ops.object.select_all(action='DESELECT')

kit_objects = [mooring_post, lamp_post, kite, bell, garland, lantern, peg]
sh.export_kit(ID, kit_objects)


def pack_glb(path):
    """Compress with meshopt via the pinned npx gltfpack@1.2.0 call (house pattern, M42:
    _shared.py is frozen, so this lives here; master-plan.md#M68)."""
    path = Path(path)
    tmp = path.with_suffix('.tmp.glb')
    subprocess.run(
        ['npx', '-y', 'gltfpack@1.2.0', '-cc', '-kn', '-i', str(path), '-o', str(tmp)],
        check=True,
    )
    tmp.replace(path)


pack_glb(sh.MODELS_OUT / f'{ID}.glb')
print(f'{ID.upper().replace("-", "_")}_PACKED')

# ---------------------------------------------------------------------------
# Preview-only assembly: post + lamp side by side, at landmark scale.
# ---------------------------------------------------------------------------
post_dup = mooring_post.copy()
post_dup.data = mooring_post.data.copy()
post_dup.name = 'MooringPost_preview'
post_dup.location = (-0.5, 0, 0)
bpy.context.collection.objects.link(post_dup)
for child in mooring_post.children:
    cdup = child.copy()
    cdup.data = child.data.copy()
    cdup.name = child.name + '_preview'
    cdup.parent = post_dup
    bpy.context.collection.objects.link(cdup)

lamp_dup = lamp_post.copy()
lamp_dup.data = lamp_post.data.copy()
lamp_dup.name = 'mooringLamp_preview'
lamp_dup.location = (0.5, 0, 0)
bpy.context.collection.objects.link(lamp_dup)
for child in lamp_post.children:
    cdup = child.copy()
    cdup.data = child.data.copy()
    cdup.name = child.name + '_preview'
    cdup.parent = lamp_dup
    bpy.context.collection.objects.link(cdup)

for o in kit_objects:
    o.hide_render = True
    for c in o.children:
        c.hide_render = True

preview_dir = sh.SHOWCASE / ID
preview_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(preview_dir / f'{ID}-preview.blend'))
print(f'{ID.upper().replace("-", "_")}_PREVIEW_SAVED')
