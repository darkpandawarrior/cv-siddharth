"""Fleet deepmal: the white-label fleet (`store.ts`) as a Maharashtrian stone
lamp tower (world-v2-spec.md landmark #13). Niches carry the fleet's own
count — `fleetStats.live` (88) lit amber, `delisted` (84) dark — stacked in
rings of 12, `ceil(172/12)` = 15 rings tall.

Kit, not a baked assembly (spec §0.3 rule 2 — no GLB bakes a data count):
  - TowerRing:  a unit tapered drum (cone primitive). The runtime scales each
                instance's (radius_bottom, radius_top, height) per tier — the
                taper ratio lives in socket.ring_pitch, not a fixed number.
  - NicheUnit:  one wall-mounted alcove (recess + pediment cap), instanced
                12-per-ring around socket.niche_pitch's angular step.
  - FlameCard:  the lit-niche emissive flame, instanced once per live count.
  - BasePlinth / Finial: the one-off top and bottom caps (whole-tower
    pieces, same footing as the bridge kit's SpandrelWall — not repeat-N).

Art-direction pass 2: the niche was a flat-lintel recess with a poked pyramid
pediment, and the preview's "lit" niches were geometry-only (an emissive
FlameCard mesh with no real light) — at landmark viewing distance that read
as a plain blocky stack with no niches or emissives at all. niche_bm() now
carves a genuine arched opening (a jamb-then-semicircle outline, the same
front/back-ring extrusion vocabulary the bridge's SpandrelWall uses), and
the preview places an actual warm (~2000-2200K, real Blender light
temperature, not a flat RGB guess) POINT light in every lit niche instead of
only a handful of tier-spine stand-ins.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python fleet-deepmal.py
"""
from pathlib import Path
import math
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'fleet-deepmal'
sh.clear_scene()

palestone = sh.pbr('mat.paleStone')
clay = sh.pbr('mat.clay')
flame_mat = sh.material('mat.deepmalFlame', sh.AMBER, metal=0.0, rough=0.4,
                         emission=sh.AMBER, emission_strength=5.5)

# --- tower ring: a unit straight drum, N=12-sided to match the niche pitch.
# The runtime (and this file's own preview) scales X/Y for the per-tier
# radius and Z for the tier height — one prototype, many tiers. Straight
# (not tapered) so the taper happens only as a *step* between tiers, which
# is what reads as "tiered tower" rather than one smooth cone. ---
TIER_SIDES = 12
bpy.ops.mesh.primitive_cylinder_add(vertices=TIER_SIDES, radius=1.0, depth=1.0,
                                     location=(0, 0, 0.5))
tower_ring = bpy.context.object
tower_ring.name = 'TowerRing'
tower_ring.data.name = 'TowerRing'
tower_ring.data.materials.append(palestone)
sh.canonicalize_object(tower_ring)
bpy.ops.object.select_all(action='DESELECT')

# --- tier collar: a thin coping ledge marking each tier boundary (the
# stacked-course datum lines a real deepmal reads by, spec item #13
# "tiered stone tower"). One prototype, instanced at every tier seam. ---
bpy.ops.mesh.primitive_cylinder_add(vertices=TIER_SIDES, radius=1.08, depth=0.07, location=(0, 0, 0.035))
tier_collar = bpy.context.object
tier_collar.name = 'TierCollar'
tier_collar.data.name = 'TierCollar'
tier_collar.data.materials.append(palestone)
sh.canonicalize_object(tier_collar)
bpy.ops.object.select_all(action='DESELECT')

# --- niche unit: a recessed ALCOVE WITH A TRUE ARCHED OPENING (art-direction
# fix — the previous flat lintel + poked pyramid read as a doorway, not the
# concept's arched lamp-niche), sized for a unit-radius ring (the runtime/
# preview positions it on the ring surface at instance scale). Built flush
# against a wall at x=0, alcove opening toward -Y. The opening's outline is
# jamb-up / semicircle-over / jamb-down (n_arc+3 points); a front ring at
# y=0 (the wall surface) and a recessed ring at y=-depth (the alcove floor,
# where the flame/light sits) are connected by "return" side faces around
# that whole outline — the same front-ring/back-ring extrusion vocabulary
# SpandrelWall already uses for the bridge's arch profile. ---
def niche_bm(n_arc=5):
    hw, depth = 0.075, 0.045
    spring_h = 0.055   # jambs rise this high before the arch springs
    r = hw
    apex_h = spring_h + r

    outline = [(-hw, 0.0)]
    for i in range(n_arc + 1):
        a = math.pi * i / n_arc
        outline.append((-r * math.cos(a), spring_h + r * math.sin(a)))
    outline.append((hw, 0.0))
    n = len(outline)

    bm = bmesh.new()
    front = [bm.verts.new((x, 0, z)) for x, z in outline]        # flush against the wall
    back = [bm.verts.new((x, -depth, z)) for x, z in outline]    # the alcove's own back face
    bm.faces.new(front)
    floor = bm.faces.new(back[::-1])   # will be inset into the visible recessed panel below
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))     # jambs + arch soffit + sill
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.inset_individual(bm, faces=[floor], thickness=0.008, depth=-0.015)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return sh.canonical_order(bm), apex_h


niche_geo, NICHE_APEX_H = niche_bm()
niche = sh.new_mesh_object('NicheUnit', niche_geo, palestone)
flame_socket = sh.socket('socket.flame', (0, -0.045, NICHE_APEX_H * 0.45), parent=niche, size=0.02)

# --- flame: a small emissive teardrop, instanced once per lit (live) niche ---
bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.018, radius2=0.001, depth=0.05,
                                 location=(0, 0, 0.025))
flame = bpy.context.object
flame.name = 'FlameCard'
flame.data.name = 'FlameCard'
flame.data.materials.append(flame_mat)
sh.canonicalize_object(flame)
bpy.ops.object.select_all(action='DESELECT')

# --- base plinth: an octagonal stepped foot, one-off whole-tower piece ---
PLINTH_PROFILE = [(1.35, 0), (1.35, 0.10), (1.15, 0.18), (1.15, 0.30), (0.95, 0.36), (0.95, 0.44)]
plinth_bm = sh.lathe(PLINTH_PROFILE, steps=TIER_SIDES)
plinth_bm = sh.canonical_order(plinth_bm)
base_plinth = sh.new_mesh_object('BasePlinth', plinth_bm, palestone)

# --- finial: a lathed kalash-pot spire for the crown, one-off ---
FINIAL_PROFILE = [(0.0, 0), (0.28, 0), (0.30, 0.10), (0.16, 0.22), (0.30, 0.34), (0.22, 0.46),
                   (0.10, 0.52), (0.10, 0.62), (0.0, 0.70)]
finial_bm = sh.lathe(FINIAL_PROFILE, steps=TIER_SIDES)
finial_bm = sh.canonical_order(finial_bm)
finial = sh.new_mesh_object('Finial', finial_bm, clay)

# --- named sockets the runtime samples for data counts ---
# ring_pitch: (dRadius_per_tier, dRadius_per_tier, tier_height) as the
# instance-scale step; niche_pitch: the 12-per-ring angular step in radians.
ring_pitch = sh.socket('socket.ring_pitch', (-0.04, -0.04, 0.62), size=0.05)
niche_pitch = sh.socket('socket.niche_pitch', (math.tau / 12, 0, 0), size=0.05)

kit_objects = [tower_ring, tier_collar, niche, flame, base_plinth, finial, ring_pitch, niche_pitch]
sh.export_kit(ID, kit_objects)

# ---------------------------------------------------------------------------
# Preview-only assembly: a representative 8-tier, 12-niche-per-ring tower
# (96 niches, ~55% lit to match fleetStats.live/(live+delisted)~=0.51), so
# the render can be judged at landmark scale. NOT exported (spec §0.3 rule 2).
# ---------------------------------------------------------------------------
N_TIERS = 8
NICHES_PER_RING = 12
LIT_RATIO = 0.51
R0, TIER_H, D_R, COLLAR_H = 1.35, 0.58, 0.115, 0.07  # base radius, tier height,
                                                       # per-tier radius STEP
                                                       # (straight drums, not a
                                                       # smooth cone taper)
preview_objs = []


def rot_z(theta, x, y):
    return x * math.cos(theta) - y * math.sin(theta), x * math.sin(theta) + y * math.cos(theta)


z_cursor = 0.44
for t in range(N_TIERS):
    r_t = R0 - t * D_R
    dup = tower_ring.copy()
    dup.data = tower_ring.data.copy()
    dup.name = f'TowerRing_preview_{t}'
    dup.scale = (r_t, r_t, TIER_H)
    dup.location = (0, 0, z_cursor)
    bpy.context.collection.objects.link(dup)
    preview_objs.append(dup)

    lit_here = round(NICHES_PER_RING * LIT_RATIO)
    niche_z = z_cursor + TIER_H * 0.45
    for n in range(NICHES_PER_RING):
        ang = n * math.tau / NICHES_PER_RING
        theta = ang + math.pi / 2
        ndup = niche.copy()
        ndup.data = niche.data.copy()
        ndup.name = f'Niche_preview_{t}_{n}'
        ndup.location = (r_t * math.cos(ang), r_t * math.sin(ang), niche_z)
        ndup.rotation_euler = (0, 0, theta)
        bpy.context.collection.objects.link(ndup)
        preview_objs.append(ndup)

        if n < lit_here:
            lx, ly, lz = flame_socket.location
            wx, wy = rot_z(theta, lx, ly)
            wz = ndup.location.z + lz
            fdup = flame.copy()
            fdup.data = flame.data.copy()
            fdup.name = f'Flame_preview_{t}_{n}'
            fdup.location = (ndup.location.x + wx, ndup.location.y + wy, wz)
            fdup.rotation_euler = ndup.rotation_euler
            bpy.context.collection.objects.link(fdup)
            preview_objs.append(fdup)

            # art-direction fix: a real light per lit niche, not just a
            # handful of tier-spine stand-ins — at landmark distance an
            # emissive-only mesh this small doesn't read as "lit". Warm oil-
            # lamp colour via Blender's own blackbody temperature (~2000-
            # 2200K, spec's exact range), not a hand-guessed RGB tint.
            niche_light = bpy.data.lights.new(f'NicheLight_{t}_{n}', 'POINT')
            niche_light.energy = 12
            niche_light.color = (1.0, 1.0, 1.0)
            niche_light.use_temperature = True
            niche_light.temperature = 2100
            niche_light.shadow_soft_size = 0.03
            niche_light.use_shadow = False
            light_obj = bpy.data.objects.new(f'NicheLight_{t}_{n}', niche_light)
            light_obj.location = (ndup.location.x + wx, ndup.location.y + wy, wz)
            bpy.context.collection.objects.link(light_obj)
            preview_objs.append(light_obj)

    cdup = tier_collar.copy()
    cdup.data = tier_collar.data.copy()
    cdup.name = f'TierCollar_preview_{t}'
    cdup.scale = (r_t, r_t, 1.0)
    cdup.location = (0, 0, z_cursor + TIER_H)
    bpy.context.collection.objects.link(cdup)
    preview_objs.append(cdup)

    z_cursor += TIER_H + COLLAR_H

top_z = z_cursor
dup = finial.copy()
dup.data = finial.data.copy()
dup.name = 'Finial_preview'
dup.location = (0, 0, top_z)
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
