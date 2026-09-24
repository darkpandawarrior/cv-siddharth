"""Sangam keystone bridge: the KMP foundation as architecture. kmp-build-logic
is the keystone arch on kmp-toolkit piers, spanning the confluence where every
includeBuild stream meets (world-v2-spec.md landmark #1).

Rebuild (world-v2 lookdev pass): a true semicircular arch alone read as a
stone hoop floating over the river — nothing carried the load down into the
water or filled the haunches, which is what actually reads as "bridge" at
a distance. Two pieces close that gap, both one-off whole-bridge geometry
(not data-count prototypes — there is exactly one of each per bridge, same
footing as arch_curve/deck_curve below, not the repeat-N-times footing that
voussoir/pier_course/lamp_post use):
  - SpandrelWall: the masonry infill between the arch's extrados and the
    deck line, built directly from ARCH_R/PIER_TOP/DECK_Z so it always
    matches this file's own arch, not a guessed curve.
  - CutwaterPier: a pointed prow on a pier face that splits river flow. One
    prototype, instanced at both piers x both faces (4x) in the preview —
    symmetric because the bridge's final rotation in the world scene isn't
    known here, so there's no honest single "upstream" face to pick.

Art-direction pass 2 (multi-arch): the single center span read as an
isolated stone hoop rather than "a bridge" in the golden-hour establishing
shot, next to the concept's 3-arch masonry crossing. The data-bound arch
(socket.arch_curve, conventionPlugins voussoirs) stays exactly one span —
that's kmp-build-logic's own identity, singular — but two smaller flanking
arches (VoussoirSide/KeystoneSide/SpandrelWallSide, same vocabulary at a
smaller ring radius, same PIER_TOP/DECK_Z so the deck stays flat) now frame
it, plus a coursed-stone parapet replacing the previous turned-baluster
railing and a mossy weathered tint on the waterline pier courses/cutwaters.

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
# Art-direction fix: 'Brushed titanium' / 'Anodized amber' were unrenamed
# materials-library defaults, off the spec §9/§5 approved mat.* list, so the
# runtime's by-name texture bind would silently fall back to a flat PBR
# value at load (critic finding #3). Both the medallion and the inlay are
# small brass fittings on a stone keystone, so mat.brass — already shared,
# already approved — is the correct rename, not a new name to add.
brass = sh.pbr('mat.brass')
# Weathering/moss on the waterline pier courses and cutwaters (art-direction
# fix) — a dull, desaturated olive, deliberately NOT spec §0.3's semantic
# GREEN accent (that colour is reserved for "live/shipped"; this is plain
# algae staining on stone, not a status signal).
moss_stone = sh.material('mat.pierMoss', (0.15, 0.18, 0.10), rough=0.88)


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
    # Art-direction fix: the inset+bevel combo on a tapered wedge collapses a
    # handful of near-zero-area corner triangles and zero-length edges where
    # the drafted margin meets the bevel ring (critic finding #3, 60
    # degenerate faces / 32 zero-length edges, almost certainly from this op
    # on Keystone/Voussoir). dissolve_degenerate removes exactly those
    # without touching the real topology.
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=list(bm.edges))
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
DECK_Z = PIER_TOP + _r_out + 0.14  # deck sits on the extrados at apex height;
                                    # defined here (not just at the sockets
                                    # below) because SpandrelWall needs it too

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
medallion.data.materials.append(brass)
medallion.parent = keystone
for poly in medallion.data.polygons:
    poly.use_smooth = False

bpy.ops.mesh.primitive_cube_add(size=.11, location=(0, _key_face_y + 0.08, KEY_H * 0.5),
                                 rotation=(0, 0, math.radians(45)))
inlay = bpy.context.object
inlay.name = 'KeystoneInlay'
inlay.data.name = 'KeystoneInlay'
inlay.scale = (1, .5, 1)
inlay.data.materials.append(brass)
inlay.parent = keystone
for poly in inlay.data.polygons:
    poly.use_smooth = False

# --- side arches: two smaller flanking spans (art-direction fix — a single
# arch read as "a stone hoop", not the concept's 3-arch masonry bridge). Same
# voussoir/keystone vocabulary as the center arch, scaled to a smaller ring
# radius and springing from the SAME PIER_TOP/DECK_Z so the deck stays flat
# — spandrel_wall_bm below (already generic in r_out) fills the extra height
# over the shorter arch, the same job it does for the center arch. No
# medallion: that worked-wedge is kmp-build-logic's own center-arch identity,
# not shared with a plain flanking span. ---
SIDE_ARCH_R = 1.8
N_SIDE_DEMO = 6
_side_r_out, _side_r_in = SIDE_ARCH_R + VOUSSOIR_H / 2, SIDE_ARCH_R - VOUSSOIR_H / 2
_side_half_ang = math.pi / (2 * N_SIDE_DEMO)
SIDE_VOUS_W_TOP = 2 * _side_r_out * math.sin(_side_half_ang) * _JOINT
SIDE_VOUS_W_BOT = 2 * _side_r_in * math.sin(_side_half_ang) * _JOINT

side_vous_bm = drafted_block(w_bottom=SIDE_VOUS_W_BOT, w_top=SIDE_VOUS_W_TOP, depth=ARCH_DEPTH,
                              height=VOUSSOIR_H, mat=sandstone)
side_voussoir = sh.new_mesh_object('VoussoirSide', side_vous_bm, sandstone)

SIDE_KEY_W_BOT, SIDE_KEY_W_TOP = SIDE_VOUS_W_BOT * 1.25, SIDE_VOUS_W_TOP * 1.35
SIDE_KEY_H, SIDE_KEY_DEPTH = VOUSSOIR_H * 1.15, ARCH_DEPTH + 0.08
side_key_bm = drafted_block(w_bottom=SIDE_KEY_W_BOT, w_top=SIDE_KEY_W_TOP, depth=SIDE_KEY_DEPTH,
                             height=SIDE_KEY_H, mat=sandstone)
side_keystone = sh.new_mesh_object('KeystoneSide', side_key_bm, sandstone)

# --- pier course: stacks to build both piers on socket.pier_a / _b ---
course_bm = drafted_block(w_bottom=1.7, w_top=1.7, depth=1.0, height=0.5, mat=palestone,
                           inset=0.05, bevel=0.014)
pier_course = sh.new_mesh_object('PierCourse', course_bm, palestone)

# --- spandrel wall: the masonry infill between the arch's extrados and the
# deck line (world-v2-spec.md landmark #1 rebuild). One whole-bridge piece,
# not a repeat-N prototype — built directly from this file's own arch
# geometry (_r_out/PIER_TOP/DECK_Z), so the fill can never drift out of sync
# with the arch it packs around. ---
def spandrel_wall_bm(r_out, pier_top, deck_z, depth, n=8):
    """Closed profile: the extrados hump (angle 0..pi, n+1 points) capped by
    the flat deck line, extruded solid along Y (the bridge's depth axis)."""
    pts = [(r_out * math.cos(math.pi * i / n), pier_top + r_out * math.sin(math.pi * i / n))
           for i in range(n + 1)]
    pts += [(-r_out, deck_z), (r_out, deck_z)]
    bm = bmesh.new()
    hd = depth / 2
    front = [bm.verts.new((x, -hd, z)) for x, z in pts]
    back = [bm.verts.new((x, hd, z)) for x, z in pts]
    npts = len(pts)
    for i in range(npts):
        j = (i + 1) % npts
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bm.faces.new(front[::-1])
    bm.faces.new(back)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return sh.canonical_order(bm)


spandrel_wall = sh.new_mesh_object('SpandrelWall', spandrel_wall_bm(_r_out, PIER_TOP, DECK_Z, ARCH_DEPTH), sandstone)
side_spandrel_wall = sh.new_mesh_object(
    'SpandrelWallSide', spandrel_wall_bm(_side_r_out, PIER_TOP, DECK_Z, ARCH_DEPTH), sandstone)

# --- cutwater: a pointed prow that splits river flow, one prototype instanced
# at both piers x both faces in the preview. ---
def cutwater_bm(width, depth_out, height):
    bm = bmesh.new()
    hw = width / 2
    v = [
        bm.verts.new((-hw, 0, 0)), bm.verts.new((hw, 0, 0)), bm.verts.new((0, -depth_out, 0)),
        bm.verts.new((-hw, 0, height)), bm.verts.new((hw, 0, height)), bm.verts.new((0, -depth_out, height)),
    ]
    bm.faces.new((v[0], v[1], v[4], v[3]))  # back, flush with the pier face
    bm.faces.new((v[1], v[2], v[5], v[4]))  # right slope
    bm.faces.new((v[2], v[0], v[3], v[5]))  # left slope
    bm.faces.new((v[3], v[4], v[5]))        # top cap
    bm.faces.new((v[2], v[1], v[0]))        # bottom cap
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.02, segments=2, affect='EDGES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return sh.canonical_order(bm)


cutwater = sh.new_mesh_object('CutwaterPier', cutwater_bm(width=1.5, depth_out=0.55, height=PIER_TOP), palestone)

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
# Art-direction fix: the deck read as "a blank white rectangle" (critic
# finding #3) — the arch got voussoir joints but the deck had none of its
# own coursing. Recess each paving cell slightly so the joint lines actually
# read as grooves, the same paving-seam vocabulary the voussoirs already use.
top_cells = [f for f in deck_bm.faces if all(abs(v.co.z - hh) < 1e-4 for v in f.verts)]
if top_cells:
    paving = bmesh.ops.inset_individual(deck_bm, faces=top_cells, thickness=0.03, depth=-0.008)
bmesh.ops.bevel(deck_bm, geom=[e for e in deck_bm.edges if e.is_boundary], offset=0.02, segments=2, affect='EDGES')
bmesh.ops.recalc_face_normals(deck_bm, faces=deck_bm.faces)
bmesh.ops.dissolve_degenerate(deck_bm, dist=1e-5, edges=list(deck_bm.edges))
bmesh.ops.recalc_face_normals(deck_bm, faces=deck_bm.faces)
deck_bm = sh.canonical_order(deck_bm)
deck_segment = sh.new_mesh_object('DeckSegment', deck_bm, palestone)

# --- parapet: a solid coursed-stone wall with a coping cap (art-direction
# fix: turned balusters read as a garden railing, not the concept's "coursed-
# stone parapet wall" — the same subdivide+inset paving-groove vocabulary
# the deck already uses below, applied here to the wall's two long faces
# instead of its top). ---
PARAPET_LEN, PARAPET_H, PARAPET_T = 1.72, 0.42, 0.16
rail_bm = bmesh.new()
_rhw, _rhd = PARAPET_LEN / 2, PARAPET_T / 2
rv = [rail_bm.verts.new(p) for p in (
    (-_rhw, -_rhd, 0.02), (_rhw, -_rhd, 0.02), (_rhw, _rhd, 0.02), (-_rhw, _rhd, 0.02),
    (-_rhw, -_rhd, PARAPET_H), (_rhw, -_rhd, PARAPET_H), (_rhw, _rhd, PARAPET_H), (-_rhw, _rhd, PARAPET_H))]
rail_bm.faces.new((rv[0], rv[1], rv[2], rv[3]))
rail_bm.faces.new((rv[7], rv[6], rv[5], rv[4]))
rfront = rail_bm.faces.new((rv[0], rv[4], rv[5], rv[1]))
rail_bm.faces.new((rv[1], rv[5], rv[6], rv[2]))
rback = rail_bm.faces.new((rv[2], rv[6], rv[7], rv[3]))
rail_bm.faces.new((rv[3], rv[7], rv[4], rv[0]))
bmesh.ops.recalc_face_normals(rail_bm, faces=rail_bm.faces)
for f in (rfront, rback):
    bmesh.ops.subdivide_edges(
        rail_bm, edges=[e for e in f.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1e-4],
        cuts=3, use_grid_fill=True)
courses = [f for f in rail_bm.faces if abs(f.normal.y) > 0.9]
bmesh.ops.inset_individual(rail_bm, faces=courses, thickness=0.012, depth=-0.006)
bmesh.ops.bevel(rail_bm, geom=[e for e in rail_bm.edges if e.is_boundary], offset=0.012, segments=2, affect='EDGES')
bmesh.ops.recalc_face_normals(rail_bm, faces=rail_bm.faces)
bmesh.ops.dissolve_degenerate(rail_bm, dist=1e-5, edges=list(rail_bm.edges))
bmesh.ops.recalc_face_normals(rail_bm, faces=rail_bm.faces)
railing = sh.new_mesh_object('RailingRun', sh.canonical_order(rail_bm), palestone)

bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, PARAPET_H + 0.03))
rail_cap = bpy.context.object
rail_cap.name = 'RailingCap'
rail_cap.data.name = 'RailingCap'
rail_cap.scale = (_rhw + 0.05, _rhd + 0.04, 0.035)
cap_bevel = rail_cap.modifiers.new('CapBevel', 'BEVEL')
cap_bevel.width = 0.01
cap_bevel.segments = 2
bpy.context.view_layer.objects.active = rail_cap
bpy.ops.object.modifier_apply(modifier=cap_bevel.name)
sh.canonicalize_object(rail_cap)
rail_cap.data.materials.append(palestone)
rail_cap.parent = railing
bpy.ops.object.select_all(action='DESELECT')

# --- lamp socket: a turned stone post that mounts a data-instanced light ---
LAMP_PROFILE = [(.09, 0), (.11, .04), (.07, .14), (.10, .22), (.13, .26), (.02, .30)]
lamp_bm = sh.lathe(LAMP_PROFILE, steps=10)
lamp_bm = sh.canonical_order(lamp_bm)
lamp_post = sh.new_mesh_object('LampSocketPost', lamp_bm, palestone)
sh.socket('socket.lamp', (0, 0, 0.30), parent=lamp_post, size=0.05)

# --- named sockets the runtime samples for data counts ---
# (DECK_Z is defined earlier, alongside _r_out — SpandrelWall needs it too)
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

kit_objects = [voussoir, keystone, side_voussoir, side_keystone, pier_course, spandrel_wall,
               side_spandrel_wall, cutwater, deck_segment, railing, lamp_post,
               arch_curve, deck_curve, pier_a, pier_b, *inflow_sockets]
sh.export_kit(ID, kit_objects)

# ---------------------------------------------------------------------------
# Preview-only assembly: duplicate the kit prototypes into a representative
# span so the render can be judged at landmark scale. NOT exported to the
# runtime GLB (spec §0.3 rule 2 — the shipped kit stays prototype + sockets).
# ---------------------------------------------------------------------------
preview_objs = []


def build_arch_group(cx, arch_r, n_demo, vous_proto, key_proto, spandrel_proto, tag):
    """One arch span: voussoir ring + keystone + 2 piers (with waterline
    moss) + 4 cutwaters + spandrel fill, all at world-x offset cx. Reused for
    the center span and both flanking spans (art-direction fix: multi-arch,
    not one stone hoop) — same assembly logic at a different (cx, arch_r)."""
    mid = n_demo // 2
    for i in range(n_demo):
        if i == mid:
            continue  # the keystone takes the apex slot
        t = i / (n_demo - 1)
        ang = math.pi * (1 - t)
        x, z = arch_r * math.cos(ang), PIER_TOP + arch_r * math.sin(ang)
        dup = vous_proto.copy()
        dup.data = vous_proto.data.copy()
        dup.name = f'Voussoir_preview_{tag}_{i}'
        dup.rotation_euler = (0, math.pi / 2 - ang, 0)
        dup.location = (cx + x, 0, z)
        bpy.context.collection.objects.link(dup)
        preview_objs.append(dup)

    dup = key_proto.copy()
    dup.data = key_proto.data.copy()
    dup.name = f'Keystone_preview_{tag}'
    dup.location = (cx, 0, PIER_TOP + arch_r)
    bpy.context.collection.objects.link(dup)
    preview_objs.append(dup)
    for child in list(key_proto.children):
        cdup = child.copy()
        cdup.data = child.data.copy() if child.data else None
        cdup.name = f'{child.name}_preview_{tag}'
        cdup.parent = dup
        bpy.context.collection.objects.link(cdup)
        preview_objs.append(cdup)

    for side, base_x in (('a', cx - arch_r), ('b', cx + arch_r)):
        for c in range(PIER_COURSES):
            cdup = pier_course.copy()
            cdup.data = pier_course.data.copy()
            cdup.name = f'PierCourse_preview_{tag}_{side}_{c}'
            cdup.location = (base_x, 0, c * COURSE_H)
            if c < 2:  # weathering/moss on the waterline courses (art-direction fix)
                cdup.data.materials[0] = moss_stone
            bpy.context.collection.objects.link(cdup)
            preview_objs.append(cdup)
        for face, rot in ((0.5, math.pi), (-0.5, 0)):  # both Y faces, apex pointing out
            cdup = cutwater.copy()
            cdup.data = cutwater.data.copy()
            cdup.data.materials[0] = moss_stone  # cutwaters sit at the waterline
            cdup.name = f'Cutwater_preview_{tag}_{side}_{face}'
            cdup.location = (base_x, face, 0)
            cdup.rotation_euler = (0, 0, rot)
            bpy.context.collection.objects.link(cdup)
            preview_objs.append(cdup)

    dup = spandrel_proto.copy()
    dup.data = spandrel_proto.data.copy()
    dup.name = f'SpandrelWall_preview_{tag}'
    dup.location = (cx, 0, 0)
    bpy.context.collection.objects.link(dup)
    preview_objs.append(dup)


# Side-span centers chosen so the flanking arch's outer pier sits right where
# the center arch's own pier does (ARCH_GAP is the solid masonry between the
# two abutting pier faces) — a continuous run of piers, not 3 isolated hoops.
ARCH_GAP = 0.6
SIDE_CX = ARCH_R + ARCH_GAP + SIDE_ARCH_R
build_arch_group(0.0, ARCH_R, N_ARCH_DEMO, voussoir, keystone, spandrel_wall, 'center')
build_arch_group(-SIDE_CX, SIDE_ARCH_R, N_SIDE_DEMO, side_voussoir, side_keystone, side_spandrel_wall, 'left')
build_arch_group(SIDE_CX, SIDE_ARCH_R, N_SIDE_DEMO, side_voussoir, side_keystone, side_spandrel_wall, 'right')

# Deck + parapet + lamps run continuously across all 3 spans (real bridges
# don't have an expansion joint at every pier), so these are sized off the
# whole bridge's half-width rather than one arch's own DECK_SPAN.
DECK_HALF_SPAN = SIDE_CX + SIDE_ARCH_R + 0.8
N_DECK_COLS = max(4, round(2 * DECK_HALF_SPAN / 2.3) + 1)
for i in range(N_DECK_COLS):
    dx = -DECK_HALF_SPAN + i * (2 * DECK_HALF_SPAN) / (N_DECK_COLS - 1)
    for row, ry in enumerate((-1.4, 1.4)):
        cdup = deck_segment.copy()
        cdup.data = deck_segment.data.copy()
        cdup.name = f'Deck_preview_{i}_{row}'
        cdup.location = (dx, ry, DECK_Z)
        bpy.context.collection.objects.link(cdup)
        preview_objs.append(cdup)

N_PARAPET = max(4, round(2 * DECK_HALF_SPAN / PARAPET_LEN) + 1)
for i in range(N_PARAPET):
    dx = -DECK_HALF_SPAN + i * (2 * DECK_HALF_SPAN) / (N_PARAPET - 1)
    for ry in (-2.3, 2.3):
        cdup = railing.copy()
        cdup.data = railing.data.copy()
        cdup.name = f'Railing_preview_{dx}_{ry}'
        cdup.location = (dx, ry, DECK_Z + 0.14)
        bpy.context.collection.objects.link(cdup)
        preview_objs.append(cdup)
        for child in list(railing.children):
            ccdup = child.copy()
            ccdup.data = child.data.copy() if child.data else None
            ccdup.name = f'{child.name}_preview_{dx}_{ry}'
            ccdup.parent = cdup
            bpy.context.collection.objects.link(ccdup)
            preview_objs.append(ccdup)
    if i % 2 == 0:
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
