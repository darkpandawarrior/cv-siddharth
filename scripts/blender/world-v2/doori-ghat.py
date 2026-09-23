"""Doori ghat: the hillside landing on the amphitheatre bench, from which
Doori's includeBuild stream descends (world-v2-spec.md landmark #2).

Kit pieces: GhatTop (sandstone landing + whitewashed plaster parapet) and
SurveyPillar (a GSI-style triangulation pillar, 12 painted bands = the
projectStats.doori.cores count, baked here as a build-time snapshot rather
than instanced — unlike steps/bells/diyas/voussoirs/kites, a survey pillar's
bands are not in spec §0.3 rule 2's instanced list). The 13-flight descent
itself is NOT modelled here: it is instanced from ghat-kit.py's flight
prototype at runtime, mounted at socket.flights_top. socket.hero_stone marks
where the gps-accuracy case-study stone (hero-stone-kit.py) sits.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python doori-ghat.py
"""
from pathlib import Path
import math
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'doori-ghat'
sh.clear_scene()

sandstone = sh.pbr('mat.sandstone')
plaster = sh.pbr('mat.plaster')
STREAM_W = 3.6  # projectStats.doori.modules(36) * 0.1, the measured stream width this ghat feeds

# --- ghat top: a landing slab with a low coped edge, backed by a whitewashed
# retaining wall with a shallow string-course band (not a bare box). ---
bm = bmesh.new()
w, d, h = 4.2, 3.0, 0.32
v = [bm.verts.new(p) for p in (
    (-w / 2, -d / 2, 0), (w / 2, -d / 2, 0), (w / 2, d / 2, 0), (-w / 2, d / 2, 0),
    (-w / 2, -d / 2, h), (w / 2, -d / 2, h), (w / 2, d / 2, h), (-w / 2, d / 2, h))]
bm.faces.new((v[0], v[1], v[2], v[3]))
top = bm.faces.new((v[7], v[6], v[5], v[4]))
bm.faces.new((v[0], v[4], v[5], v[1]))
front = bm.faces.new((v[1], v[5], v[6], v[2]))
bm.faces.new((v[2], v[6], v[7], v[3]))
bm.faces.new((v[3], v[7], v[4], v[0]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.ops.inset_region(bm, faces=[front], thickness=0.08, depth=-0.02)
bmesh.ops.bevel(bm, geom=[e for e in bm.edges if e.is_boundary], offset=0.02, segments=2, affect='EDGES')
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm = sh.canonical_order(bm)
ghat_top = sh.new_mesh_object('GhatTop', bm, sandstone)

# Parapet: a whitewashed plaster wall along the back edge with a coped cap
# and a recessed string-course, built via lathe-style profile extruded as a
# ribbon so it reads as masonry rather than a slab.
bm2 = bmesh.new()
pw, pd, ph = w, 0.22, 0.55
pv = [bm2.verts.new(p) for p in (
    (-pw / 2, -pd / 2, h), (pw / 2, -pd / 2, h), (pw / 2, pd / 2, h), (-pw / 2, pd / 2, h),
    (-pw / 2, -pd / 2 - 0.03, h + ph - 0.06), (pw / 2, -pd / 2 - 0.03, h + ph - 0.06),
    (pw / 2, pd / 2 + 0.03, h + ph - 0.06), (-pw / 2, pd / 2 + 0.03, h + ph - 0.06),
    (-pw / 2, -pd / 2, h + ph), (pw / 2, -pd / 2, h + ph),
    (pw / 2, pd / 2, h + ph), (-pw / 2, pd / 2, h + ph))]
bm2.faces.new((pv[0], pv[1], pv[2], pv[3]))
bm2.faces.new((pv[0], pv[4], pv[5], pv[1]))
bm2.faces.new((pv[1], pv[5], pv[6], pv[2]))
bm2.faces.new((pv[2], pv[6], pv[7], pv[3]))
bm2.faces.new((pv[3], pv[7], pv[4], pv[0]))
bm2.faces.new((pv[4], pv[8], pv[9], pv[5]))
bm2.faces.new((pv[5], pv[9], pv[10], pv[6]))
bm2.faces.new((pv[6], pv[10], pv[11], pv[7]))
bm2.faces.new((pv[7], pv[11], pv[8], pv[4]))
bm2.faces.new((pv[11], pv[10], pv[9], pv[8]))
bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces)
bmesh.ops.bevel(bm2, geom=[e for e in bm2.edges if e.is_boundary], offset=0.015, segments=2, affect='EDGES')
bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces)
bm2 = sh.canonical_order(bm2)
parapet = sh.new_mesh_object('Parapet', bm2, plaster)

# --- survey pillar: lathed GSI-style triangulation pillar, 12 painted bands
# (projectStats.doori.cores) plus a pyramidal cap, on the landing. ---
PILLAR_PROFILE = []
base_r, shaft_r = 0.16, 0.10
n_bands = 12
band_h = 0.10
for i in range(n_bands):
    z0, z1 = i * band_h, i * band_h + band_h * 0.62
    r = shaft_r + (0.012 if i % 2 == 0 else 0.0)
    PILLAR_PROFILE.append((r, z0))
    PILLAR_PROFILE.append((r, z1))
shaft_top = n_bands * band_h
profile = [(base_r, 0.0), (base_r, 0.06), (shaft_r, 0.08)] + PILLAR_PROFILE + \
    [(shaft_r, shaft_top), (shaft_r * 1.35, shaft_top + 0.05), (0.01, shaft_top + 0.32)]
pillar_bm = sh.lathe(profile, steps=12)
pillar_bm = sh.canonical_order(pillar_bm)
survey_pillar = sh.new_mesh_object('SurveyPillar', pillar_bm, sandstone)
survey_pillar.location = (1.35, -0.55, h)

sh.socket('socket.flights_top', (0, -d / 2 - 0.05, h), rotation=(0, 0, 0), size=0.18)
sh.socket('socket.hero_stone', (-1.4, -d / 2 - 0.05, 0), size=0.15)
sh.socket('socket.stream_edge_l', (-STREAM_W / 2, -d / 2 - 1.2, -0.4), size=0.12)
sh.socket('socket.stream_edge_r', (STREAM_W / 2, -d / 2 - 1.2, -0.4), size=0.12)

kit_objects = [ghat_top, parapet, survey_pillar]
sockets = [bpy.data.objects['socket.flights_top'], bpy.data.objects['socket.hero_stone'],
           bpy.data.objects['socket.stream_edge_l'], bpy.data.objects['socket.stream_edge_r']]
sh.export_kit(ID, kit_objects + sockets)

preview_dir = sh.SHOWCASE / ID
preview_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(preview_dir / f'{ID}-preview.blend'))
print(f'{ID.upper().replace("-", "_")}_PREVIEW_SAVED')
