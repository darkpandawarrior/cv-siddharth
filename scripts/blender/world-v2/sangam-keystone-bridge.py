"""Sangam keystone bridge: the KMP foundation as architecture. kmp-build-logic
is the keystone arch on kmp-toolkit piers, spanning the confluence where every
includeBuild stream meets (world-v2-spec.md landmark #1).

This is a KIT, not a baked assembly (spec §0.3 rule 2: "no GLB bakes a data
count"). The exported GLB carries one prototype each of voussoir, pier
course, keystone, deck segment, railing run and lamp socket, plus named
socket.* mount points the runtime instances against live data:
  - socket.arch_curve   : a Bezier the runtime samples for conventionPlugins
                          (18) voussoirs
  - socket.pier_a / _b  : course-stacking origins for providerModules (20)
  - socket.deck_curve   : a Bezier the runtime samples for modules (43) lamps
  - socket.lantern      : mount for the shared brass_diya_lantern prop
  - socket.inflow.NN    : tributary mounts under the arch (tributaries().length)

A separate, non-exported preview .blend assembles copies of the kit into a
representative span, purely so the render can be judged at landmark scale.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python sangam-keystone-bridge.py
"""
from pathlib import Path
import math
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'sangam-keystone-bridge'
sh.clear_scene()

sandstone = sh.pbr('mat.sandstone')
palestone = sh.pbr('mat.paleStone')
silver = sh.material('Brushed titanium', (.31, .38, .36), .82, .28)
amber_mat = sh.material('Anodized amber', (.8, .35, .085), .72, .26)


def drafted_block(w_bottom, w_top, depth, height, mat, inset=0.035, bevel=0.012):
    """A trapezoidal wedge (frustum in X, constant in Y) with a recessed
    drafted margin on both Y faces and softened edges — the voussoir/pier
    stone-cutting vocabulary, not a bare box."""
    bm = bmesh.new()
    hb, ht, hd = w_bottom / 2, w_top / 2, depth / 2
    v = [
        bm.verts.new((-hb, -hd, 0)), bm.verts.new((hb, -hd, 0)),
        bm.verts.new((hb, hd, 0)), bm.verts.new((-hb, hd, 0)),
        bm.verts.new((-ht, -hd, height)), bm.verts.new((ht, -hd, height)),
        bm.verts.new((ht, hd, height)), bm.verts.new((-ht, hd, height)),
    ]
    bm.faces.new((v[0], v[1], v[2], v[3]))
    bm.faces.new((v[7], v[6], v[5], v[4]))
    bm.faces.new((v[0], v[4], v[5], v[1]))
    front = bm.faces.new((v[1], v[5], v[6], v[2]))
    bm.faces.new((v[2], v[6], v[7], v[3]))
    back = bm.faces.new((v[3], v[7], v[4], v[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    res = bmesh.ops.inset_region(bm, faces=[front, back], thickness=inset, depth=0)
    bmesh.ops.inset_region(bm, faces=res['faces'], thickness=0, depth=-0.018)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect='EDGES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    out = sh.canonical_order(bm)
    return out


# --- arch geometry: derived, not guessed. A real voussoir's tangential width
# is set by its ring radius and the stone count so consecutive stones abut
# with only a hairline joint, rather than an arbitrary block scattered along
# an unrelated curve. PIER_COURSES/COURSE_H/ARCH_R/VOUSSOIR_H/N_ARCH_DEMO are
# also reused below for the preview assembly's placement math. ---
PIER_COURSES = 4
COURSE_H = 0.5
PIER_TOP = PIER_COURSES * COURSE_H       # springing height the arch sits on
ARCH_R = 3.0                             # mean ring radius
VOUSSOIR_H = 0.6                         # radial (per-stone) thickness
ARCH_DEPTH = 0.95                        # bridge thickness along Y
N_ARCH_DEMO = 9                          # representative stone count for the
                                          # preview render (live count is the
                                          # data-driven conventionPlugins=18;
                                          # this script ships a prototype +
                                          # socket.arch_curve, not a fixed N)
_r_out, _r_in = ARCH_R + VOUSSOIR_H / 2, ARCH_R - VOUSSOIR_H / 2
_half_ang = math.pi / (2 * N_ARCH_DEMO)
_JOINT = 0.96  # shrink slightly for a visible mortar line between stones
VOUS_W_TOP = 2 * _r_out * math.sin(_half_ang) * _JOINT
VOUS_W_BOT = 2 * _r_in * math.sin(_half_ang) * _JOINT

# --- voussoir: the tapered arch stone, instanced along socket.arch_curve ---
vous_bm = drafted_block(w_bottom=VOUS_W_BOT, w_top=VOUS_W_TOP, depth=ARCH_DEPTH,
                         height=VOUSSOIR_H, mat=sandstone)
voussoir = sh.new_mesh_object('Voussoir', vous_bm, sandstone)

# --- keystone: a wider voussoir carrying the reused kmp-foundation-keystone
# worked-wedge medallion on its exposed face (brief: "profile reused from
# scripts/blender/kmp-foundation-keystone.py") ---
KEY_W_BOT, KEY_W_TOP = VOUS_W_BOT * 1.25, VOUS_W_TOP * 1.35
KEY_H, KEY_DEPTH = VOUSSOIR_H * 1.15, ARCH_DEPTH + 0.08
key_bm = drafted_block(w_bottom=KEY_W_BOT, w_top=KEY_W_TOP, depth=KEY_DEPTH,
                        height=KEY_H, mat=sandstone)
keystone = sh.new_mesh_object('Keystone', key_bm, sandstone)
_key_face_y = KEY_DEPTH / 2

bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=.15, radius2=.27, depth=.16,
                                 rotation=(math.radians(90), 0, math.radians(45)),
                                 location=(0, _key_face_y + 0.02, KEY_H * 0.5))
medallion = bpy.context.object
medallion.name = 'KeystoneMedallion'
medallion.data.name = 'KeystoneMedallion'
bevel = medallion.modifiers.new('MedallionBevel', 'BEVEL')
bevel.width = .018
bevel.segments = 2
bpy.context.view_layer.objects.active = medallion
bpy.ops.object.modifier_apply(modifier=bevel.name)
sh.canonicalize_object(medallion)
medallion.data.materials.append(silver)
medallion.parent = keystone
for poly in medallion.data.polygons:
    poly.use_smooth = False

bpy.ops.mesh.primitive_cube_add(size=.11, location=(0, _key_face_y + 0.08, KEY_H * 0.5),
                                 rotation=(0, 0, math.radians(45)))
inlay = bpy.context.object
inlay.name = 'KeystoneInlay'
inlay.data.name = 'KeystoneInlay'
inlay.scale = (1, .5, 1)
inlay.data.materials.append(amber_mat)
inlay.parent = keystone
for poly in inlay.data.polygons:
    poly.use_smooth = False

# --- pier course: stacks to build both piers on socket.pier_a / _b ---
course_bm = drafted_block(w_bottom=1.7, w_top=1.7, depth=1.0, height=0.5, mat=palestone,
                           inset=0.05, bevel=0.014)
pier_course = sh.new_mesh_object('PierCourse', course_bm, palestone)

# --- deck segment: flagstone slab with two joint grooves ---
deck_bm = bmesh.new()
hw, hd, hh = 1.2, 1.7, 0.14
dv = [deck_bm.verts.new(p) for p in (
    (-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0),
    (-hw, -hd, hh), (hw, -hd, hh), (hw, hd, hh), (-hw, hd, hh))]
deck_bm.faces.new((dv[0], dv[1], dv[2], dv[3]))
top = deck_bm.faces.new((dv[7], dv[6], dv[5], dv[4]))
deck_bm.faces.new((dv[0], dv[4], dv[5], dv[1]))
deck_bm.faces.new((dv[1], dv[5], dv[6], dv[2]))
deck_bm.faces.new((dv[2], dv[6], dv[7], dv[3]))
deck_bm.faces.new((dv[3], dv[7], dv[4], dv[0]))
bmesh.ops.recalc_face_normals(deck_bm, faces=deck_bm.faces)
cuts = bmesh.ops.subdivide_edges(deck_bm, edges=[e for e in top.edges if abs(e.verts[0].co.y - e.verts[1].co.y) > 1e-4],
                                  cuts=2, use_grid_fill=True)
bmesh.ops.bevel(deck_bm, geom=[e for e in deck_bm.edges if e.is_boundary], offset=0.02, segments=2, affect='EDGES')
bmesh.ops.recalc_face_normals(deck_bm, faces=deck_bm.faces)
deck_bm = sh.canonical_order(deck_bm)
deck_segment = sh.new_mesh_object('DeckSegment', deck_bm, palestone)

# --- railing: turned balusters + cap rail + base plinth, one repeatable run.
# Each part is built as its own temp object then joined (world-monuments.py's
# join_as pattern), which is far more robust than merging raw bmeshes. ---
BALUSTER_PROFILE = [(.05, 0), (.08, .03), (.045, .09), (.075, .16), (.05, .24), (.05, .30)]
rail_parts = []
for x in (-0.55, 0.0, 0.55):
    b = sh.canonical_order(sh.lathe(BALUSTER_PROFILE, steps=8))
    obj = sh.new_mesh_object(f'_railpart_baluster_{x}', b, palestone)
    obj.location = (x, 0, 0.06)
    rail_parts.append(obj)

bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, .035))
plinth = bpy.context.object
plinth.scale = (1.72, .18, .07)
rail_parts.append(plinth)

bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, .375))
cap = bpy.context.object
cap.scale = (1.72, .1, .05)
rail_parts.append(cap)

bpy.context.view_layer.objects.active = rail_parts[0]
for p in rail_parts:
    p.select_set(True)
bpy.ops.object.join()
railing = bpy.context.object
railing.name = 'RailingRun'
sh.canonicalize_object(railing)
railing.data.materials.clear()
railing.data.materials.append(palestone)
bpy.ops.object.select_all(action='DESELECT')

# --- lamp socket: a turned stone post that mounts a data-instanced light ---
LAMP_PROFILE = [(.09, 0), (.11, .04), (.07, .14), (.10, .22), (.13, .26), (.02, .30)]
lamp_bm = sh.lathe(LAMP_PROFILE, steps=10)
lamp_bm = sh.canonical_order(lamp_bm)
lamp_post = sh.new_mesh_object('LampSocketPost', lamp_bm, palestone)
sh.socket('socket.lamp', (0, 0, 0.30), parent=lamp_post, size=0.05)

# --- named sockets the runtime samples for data counts ---
DECK_Z = PIER_TOP + _r_out + 0.14  # deck sits on the extrados at apex height
arch_curve_data = bpy.data.curves.new('socket.arch_curve', 'CURVE')
arch_curve_data.dimensions = '3D'
spline = arch_curve_data.splines.new('BEZIER')
spline.bezier_points.add(2)
pts = [(-ARCH_R, 0, PIER_TOP), (0, 0, PIER_TOP + ARCH_R), (ARCH_R, 0, PIER_TOP)]
for bp, co in zip(spline.bezier_points, pts):
    bp.co = co
    bp.handle_left_type = bp.handle_right_type = 'AUTO'
arch_curve = bpy.data.objects.new('socket.arch_curve', arch_curve_data)
bpy.context.collection.objects.link(arch_curve)

deck_curve_data = bpy.data.curves.new('socket.deck_curve', 'CURVE')
deck_curve_data.dimensions = '3D'
dspline = deck_curve_data.splines.new('POLY')
dspline.points.add(1)
dspline.points[0].co = (-ARCH_R - 1.4, 0, DECK_Z, 1)
dspline.points[1].co = (ARCH_R + 1.4, 0, DECK_Z, 1)
deck_curve = bpy.data.objects.new('socket.deck_curve', deck_curve_data)
bpy.context.collection.objects.link(deck_curve)

pier_a = sh.socket('socket.pier_a', (-ARCH_R, 0, 0), size=0.2)
pier_b = sh.socket('socket.pier_b', (ARCH_R, 0, 0), size=0.2)
lantern_socket = sh.socket('socket.lantern', (0, _key_face_y + 0.14, KEY_H * 0.5), size=0.08)
lantern_socket.parent = keystone
inflow_sockets = [sh.socket(f'socket.inflow.{i:02d}', (-2 + i * 1.0, -1.4, 0.05), size=0.1)
                  for i in range(5)]

kit_objects = [voussoir, keystone, pier_course, deck_segment, railing, lamp_post,
               arch_curve, deck_curve, pier_a, pier_b, *inflow_sockets]
sh.export_kit(ID, kit_objects)

# ---------------------------------------------------------------------------
# Preview-only assembly: duplicate the kit prototypes into a representative
# span so the render can be judged at landmark scale. NOT exported to the
# runtime GLB (spec §0.3 rule 2 — the shipped kit stays prototype + sockets).
# ---------------------------------------------------------------------------
MID = N_ARCH_DEMO // 2
preview_objs = []
for i in range(N_ARCH_DEMO):
    if i == MID:
        continue  # the keystone takes the apex slot
    t = i / (N_ARCH_DEMO - 1)
    ang = math.pi * (1 - t)
    x, z = ARCH_R * math.cos(ang), PIER_TOP + ARCH_R * math.sin(ang)
    dup = voussoir.copy()
    dup.data = voussoir.data.copy()
    dup.name = f'Voussoir_preview_{i}'
    dup.rotation_euler = (0, math.pi / 2 - ang, 0)
    dup.location = (x, 0, z)
    bpy.context.collection.objects.link(dup)
    preview_objs.append(dup)

dup = keystone.copy()
dup.data = keystone.data.copy()
dup.name = 'Keystone_preview'
dup.location = (0, 0, PIER_TOP + ARCH_R)
bpy.context.collection.objects.link(dup)
preview_objs.append(dup)
for child in list(keystone.children):
    cdup = child.copy()
    cdup.data = child.data.copy() if child.data else None
    cdup.name = child.name + '_preview'
    cdup.parent = dup
    bpy.context.collection.objects.link(cdup)
    preview_objs.append(cdup)

for side, base_x in (('a', -ARCH_R), ('b', ARCH_R)):
    for c in range(PIER_COURSES):
        cdup = pier_course.copy()
        cdup.data = pier_course.data.copy()
        cdup.name = f'PierCourse_preview_{side}_{c}'
        cdup.location = (base_x, 0, c * COURSE_H)
        bpy.context.collection.objects.link(cdup)
        preview_objs.append(cdup)

DECK_SPAN = ARCH_R + 1.0
for i, dx in enumerate((-3 * DECK_SPAN / 4, -DECK_SPAN / 4, DECK_SPAN / 4, 3 * DECK_SPAN / 4)):
    for row, ry in enumerate((-1.4, 1.4)):
        cdup = deck_segment.copy()
        cdup.data = deck_segment.data.copy()
        cdup.name = f'Deck_preview_{i}_{row}'
        cdup.location = (dx, ry, DECK_Z)
        bpy.context.collection.objects.link(cdup)
        preview_objs.append(cdup)

for dx in (-DECK_SPAN, -DECK_SPAN / 3, DECK_SPAN / 3, DECK_SPAN):
    for ry in (-2.3, 2.3):
        cdup = railing.copy()
        cdup.data = railing.data.copy()
        cdup.name = f'Railing_preview_{dx}_{ry}'
        cdup.location = (dx, ry, DECK_Z + 0.14)
        bpy.context.collection.objects.link(cdup)
        preview_objs.append(cdup)
    for ry in (-2.3, 2.3):
        cdup = lamp_post.copy()
        cdup.data = lamp_post.data.copy()
        cdup.name = f'Lamp_preview_{dx}_{ry}'
        cdup.location = (dx, ry, DECK_Z + 0.14)
        bpy.context.collection.objects.link(cdup)
        preview_objs.append(cdup)

# The original kit prototypes (still sitting at the world origin, overlapping
# each other by design — see the module docstring) would otherwise sit inside
# this preview span and read as visual noise. Hide them for the render only;
# they stay in the .blend that was already exported above.
for o in kit_objects:
    if o.type == 'MESH':
        o.hide_render = True
        for c in o.children:
            c.hide_render = True

preview_dir = sh.SHOWCASE / ID
preview_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(preview_dir / f'{ID}-preview.blend'))
print(f'{ID.upper().replace("-", "_")}_PREVIEW_SAVED')
