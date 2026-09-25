"""Misc kit: mooring post + signal lamp, the prototypes gaddi-ghat's
socket.mooring.NN empties were built for but had nothing to mount (art-
direction critic finding #2 — "no mooring posts, no lamps despite 3
socket.mooring.NN empties being present"). Spec §6 also assigns kite and
bell to this file's budget; those aren't built here because no landmark in
this review needs them yet (the bell/toran and kite/masts pieces
aren't part of this pass) — adding them now would be exactly the unrequested
scaffolding the ladder says to skip. Add them in the same file when their
landmark is actually built.

Kit pieces:
  - MooringPost: a weathered-plank bollard with a brass mooring ring.
  - SignalLamp:  a thin post topped with an emissive glass head. The
    emission colour here is the `ships`/green semantic (spec §0.3) that
    gaddi-ghat's mooring points use; a landmark whose mooring lamps carry a
    different semantic swaps the runtime material, not this kit.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python misc-kit.py
"""
from pathlib import Path
import math
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
lamp_post.name = 'SignalLampPost'
lamp_post.data.materials.clear()
lamp_post.data.materials.append(brass)
sh.canonicalize_object(lamp_post)
bpy.ops.object.select_all(action='DESELECT')

bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.045, location=(0, 0, 0.60))
glow = bpy.context.object
glow.name = 'SignalLampGlow'
glow.data.name = 'SignalLampGlow'
glow.data.materials.append(lamp_glow)
sh.canonicalize_object(glow)
glow.parent = lamp_post

kit_objects = [mooring_post, lamp_post]
sh.export_kit(ID, kit_objects)

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
lamp_dup.name = 'SignalLampPost_preview'
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
