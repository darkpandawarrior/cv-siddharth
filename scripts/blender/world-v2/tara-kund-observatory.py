"""Tara Kund observatory: the Morkinstar fiction landmark, fenced off from
every measured claim (world-v2-spec.md landmark #19, §5.19). Seen from the
Sangam only as a pale spire on the far east ridge; entered only through its
own room sensor to /anthology (a later lane's wiring, not this file's job —
this script ships geometry only).

Kit, not a baked assembly (spec §0.3 rule 2 - no GLB bakes a data count):
  - TierRing:   a unit drum, runtime-scaled per tier. `anthology.seasons`
                (4, and could grow) stacks along socket.tier_pitch rather
                than shipping 4 fixed tiers as one baked mesh.
  - Dome:       the one-off starmap housing, lathed like the bridge/deepmal
                finials. Its own named node - "a named dome for the
                fictional starmap" (this lane's task 1) - is the mount the
                runtime seeds `anthology.starmap` points from, via
                socket.starfield.
  - BasePlinth: one-off foot, same footing as the bridge's SpandrelWall.

Palette (§5.19 fence: "moon-white and deep ground only, with no amber, cyan
or green, because those carry claims"): exactly two materials,
mat.moonWhite and mat.groundDeep. Neither name nor colour references
sh.AMBER / sh.CYAN / sh.GREEN.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python tara-kund-observatory.py
"""
from pathlib import Path
import math
import subprocess
import sys
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'tara-kund-observatory'
sh.clear_scene()

# Exactly two materials, per the fence (§5.19): a pale stone for the dome
# and a dark, deep-ground stone for the tiered base. Not sh.AMBER/CYAN/GREEN
# (those carry claims this fenced landmark must not make).
moon_white = sh.material('mat.moonWhite', (0.86, 0.85, 0.83), rough=0.42)
ground_deep = sh.material('mat.groundDeep', sh.DEEP, rough=0.92)

TIER_SIDES = 12

# --- tier ring: a unit straight drum (fleet-deepmal's TowerRing vocabulary).
# The runtime scales X/Y for the per-tier radius and Z for the tier height,
# stepping down socket.tier_pitch once per anthology.seasons entry - never a
# fixed tier count baked into this mesh. ---
bpy.ops.mesh.primitive_cylinder_add(vertices=TIER_SIDES, radius=1.0, depth=1.0,
                                     location=(0, 0, 0.5))
tier_ring = bpy.context.object
tier_ring.name = 'TierRing'
tier_ring.data.name = 'TierRing'
tier_ring.data.materials.append(ground_deep)
sh.canonicalize_object(tier_ring)
bpy.ops.object.select_all(action='DESELECT')

# --- base plinth: one-off stepped foot (same footing as the bridge's
# SpandrelWall / deepmal's BasePlinth - a whole-landmark piece, not a
# repeat-N prototype). ---
PLINTH_PROFILE = [(1.28, 0), (1.28, 0.09), (1.10, 0.16), (1.10, 0.26), (0.92, 0.32)]
plinth_bm = sh.lathe(PLINTH_PROFILE, steps=TIER_SIDES)
base_plinth = sh.new_mesh_object('BasePlinth', sh.canonical_order(plinth_bm), ground_deep)

# --- dome: the one-off starmap housing atop the tiers. Named 'Dome' - this
# lane's task 1 ("a named dome for the fictional starmap") - so the runtime
# can find it by node name and seed anthology.starmap's points from
# socket.starfield, mounted inside it. Onion-lathe profile, the same
# vocabulary the bridge's lamp post / deepmal's finial already use for a
# turned stone silhouette, just larger and rounder for a dome read. ---
DOME_PROFILE = [(0.0, 0), (0.62, 0), (0.66, 0.10), (0.60, 0.34), (0.38, 0.56),
                 (0.16, 0.68), (0.0, 0.74)]
dome_bm = sh.lathe(DOME_PROFILE, steps=TIER_SIDES)
dome = sh.new_mesh_object('Dome', sh.canonical_order(dome_bm), moon_white)

# --- named sockets the runtime samples ---
# tier_pitch: a pure delta vector (0, 0, tier_height), the same standalone
# convention as ghat-kit.py's socket.step_pitch / fleet-deepmal.py's
# socket.ring_pitch - not parented, so it stays a vector, not a location.
TIER_H = 0.62
tier_pitch = sh.socket('socket.tier_pitch', (0, 0, TIER_H), size=0.05)
# starfield: the anchor inside the dome the runtime seeds
# anthology.starmap.systems' points from, in the dome's own sky patch - one
# named mount, not one socket per star (the system count already grows
# with each new season, spec §0.3 rule 2's "no baked count" case exactly).
starfield = sh.socket('socket.starfield', (0, 0, 0.30), parent=dome, size=0.06)

kit_objects = [tier_ring, base_plinth, dome, tier_pitch]
sh.export_kit(ID, kit_objects)


def pack_glb(path):
    """Compress with meshopt via the pinned npx gltfpack@1.2.0 call (house
    pattern, M68: the exact pin, never added to package.json; mirrors
    fleet-deepmal.py's pack_glb, since _shared.py is frozen per M42)."""
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
# Preview-only: a representative 4-tier stack (anthology.seasons' current
# count) so the render can be judged at landmark scale. NOT exported (spec
# §0.3 rule 2). Look-dev target: heavy/world/concept/05-bridge-closeup.webp,
# 02-night-survey.webp (M69, not asserted in pixels - Tara Kund is the pale
# spire on the far ridge in the night-survey frame).
# ---------------------------------------------------------------------------
N_TIERS_PREVIEW = 4
R0, D_R = 1.28, 0.16
preview_objs = []
z_cursor = 0.32
for t in range(N_TIERS_PREVIEW):
    r_t = R0 - t * D_R
    dup = tier_ring.copy()
    dup.data = tier_ring.data.copy()
    dup.name = f'TierRing_preview_{t}'
    dup.scale = (r_t, r_t, TIER_H)
    dup.location = (0, 0, z_cursor)
    bpy.context.collection.objects.link(dup)
    preview_objs.append(dup)
    z_cursor += TIER_H

dup = dome.copy()
dup.data = dome.data.copy()
dup.name = 'Dome_preview'
dup.location = (0, 0, z_cursor)
bpy.context.collection.objects.link(dup)
preview_objs.append(dup)

dup = base_plinth.copy()
dup.data = base_plinth.data.copy()
dup.name = 'BasePlinth_preview'
bpy.context.collection.objects.link(dup)
preview_objs.append(dup)

for o in kit_objects:
    if o.type == 'MESH':
        o.hide_render = True
        for c in o.children:
            c.hide_render = True

preview_dir = sh.SHOWCASE / ID
preview_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(preview_dir / f'{ID}-preview.blend'))
print(f'{ID.upper().replace("-", "_")}_PREVIEW_SAVED')
