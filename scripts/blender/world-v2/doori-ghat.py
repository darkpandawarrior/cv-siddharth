"""Doori ghat: the hillside landing on the amphitheatre bench, from which
Doori's includeBuild stream descends (world-v2-spec.md landmark #2).

Kit pieces: GhatTop (sandstone landing + whitewashed plaster parapet) and
SurveyPillar (a GSI-style triangulation pillar, 12 painted bands = the
projectStats.doori.cores count, baked here as a build-time snapshot rather
than instanced — unlike steps/bells/diyas/voussoirs/kites, a survey pillar's
bands are not in spec §0.3 rule 2's instanced list). SchemaPillarBase +
SchemaBand (P2-07e audit, idea-atlas REC-8): a second, distinct pillar for
Doori's schemaVersion (48, and growing with every Room migration) — this
one DOES follow rule 2, one SchemaBand prototype instanced along
socket.schema_pitch from socket.schema_bands_start, never a baked band
count. The 13-flight descent itself is NOT modelled here: it is instanced
from ghat-kit.py's flight prototype at runtime, mounted at
socket.flights_top. socket.hero_stone marks where the gps-accuracy
case-study stone (hero-stone-kit.py) sits.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python doori-ghat.py
"""
from pathlib import Path
import math
import subprocess
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

# --- ghat top: a landing built as 2 coursed stone tiers, not one solid slab
# (critic finding #1: a flat cream box "reads as a shipping pallet, not a
# riverside landmark"). The lower course is the full footprint at the step
# edge; the upper course sits set back toward the parapet, exposing a real
# coursing line/step between them, the way a ghat's landing is actually
# built up in stages rather than poured as one pad. ---
w, d, h = 4.2, 3.0, 0.32
H_LOWER, H_UPPER = 0.19, 0.13
UPPER_DEPTH_FRAC = 0.62  # the rear portion of the landing, nearer the parapet


def coursed_block(width, depth, height, y_offset, mat, front_face=False):
    bm = bmesh.new()
    hw, hd = width / 2, depth / 2
    y0, y1 = y_offset - hd, y_offset + hd
    v = [bm.verts.new(p) for p in (
        (-hw, y0, 0), (hw, y0, 0), (hw, y1, 0), (-hw, y1, 0),
        (-hw, y0, height), (hw, y0, height), (hw, y1, height), (-hw, y1, height))]
    bm.faces.new((v[0], v[1], v[2], v[3]))
    top_f = bm.faces.new((v[7], v[6], v[5], v[4]))
    bm.faces.new((v[0], v[4], v[5], v[1]))
    front = bm.faces.new((v[1], v[5], v[6], v[2]))
    bm.faces.new((v[2], v[6], v[7], v[3]))
    bm.faces.new((v[3], v[7], v[4], v[0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if front_face:
        bmesh.ops.inset_region(bm, faces=[front], thickness=0.08, depth=-0.02)
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges if e.is_boundary], offset=0.02, segments=2, affect='EDGES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return sh.canonical_order(bm)


lower_bm = coursed_block(w, d, H_LOWER, 0.0, sandstone, front_face=True)
lower = sh.new_mesh_object('_ghattop_lower', lower_bm, sandstone)

upper_depth = d * UPPER_DEPTH_FRAC
upper_y = d / 2 - upper_depth / 2  # flush with the back (parapet) edge
upper_bm = coursed_block(w, upper_depth, H_UPPER, upper_y, sandstone, front_face=False)
upper = sh.new_mesh_object('_ghattop_upper', upper_bm, sandstone)
upper.location.z = H_LOWER

bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = lower
lower.select_set(True)
upper.select_set(True)
bpy.ops.object.join()
ghat_top = bpy.context.object
ghat_top.name = 'GhatTop'
ghat_top.data.materials.clear()
ghat_top.data.materials.append(sandstone)
sh.canonicalize_object(ghat_top)
bpy.ops.object.select_all(action='DESELECT')
h = H_LOWER + H_UPPER  # total landing height, used below for the parapet/pillar seats

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
# The pillar and the flights socket both sit forward of the upper course
# (y < upper tier's front edge), so their resting height is the LOWER
# course's top, not the combined two-tier height `h` — placing them at `h`
# would float them 0.13 m above the actual surface there.
survey_pillar.location = (1.35, -0.55, H_LOWER)

# --- schema pillar: a SECOND, distinct pillar (idea-atlas.md#REC-8 "Doori's
# schema rings") - "a carved pillar with one band per schema version up to
# 48, distinct from the survey pillar's cores bands". schemaVersion is a
# live, growing count (it climbs with every Room migration), unlike the
# survey pillar's cores(12) which this file's own house pattern already
# treats as a fixed build-time snapshot (see the module docstring) - so this
# one follows spec §0.3 rule 2 properly: one SchemaBand prototype plus a
# pitch socket, never a baked band count. Mirrored on the landing's other
# side from SurveyPillar, same lower-course resting height. ---
SCHEMA_BASE_PROFILE = [(0.14, 0.0), (0.14, 0.05), (0.095, 0.07)]
schema_base_bm = sh.lathe(SCHEMA_BASE_PROFILE, steps=12)
schema_pillar_base = sh.new_mesh_object('SchemaPillarBase', sh.canonical_order(schema_base_bm), sandstone)
schema_pillar_base.location = (-1.35, -0.55, H_LOWER)

SCHEMA_BAND_H = 0.075
BAND_PROFILE = [(0.095, 0.0), (0.095, SCHEMA_BAND_H * 0.6), (0.11, SCHEMA_BAND_H * 0.75),
                (0.095, SCHEMA_BAND_H * 0.9)]
schema_band_bm = sh.lathe(BAND_PROFILE, steps=12)
schema_band = sh.new_mesh_object('SchemaBand', sh.canonical_order(schema_band_bm), sandstone)

schema_bands_start = sh.socket(
    'socket.schema_bands_start',
    (schema_pillar_base.location.x, schema_pillar_base.location.y,
     schema_pillar_base.location.z + 0.07),
    size=0.06)
# Pure delta vector (0, 0, one-band-step), the same standalone convention as
# ghat-kit.py's socket.step_pitch - not parented, so it stays a vector.
schema_pitch = sh.socket('socket.schema_pitch', (0, 0, SCHEMA_BAND_H), size=0.04)

sh.socket('socket.flights_top', (0, -d / 2 - 0.05, H_LOWER), rotation=(0, 0, 0), size=0.18)
sh.socket('socket.hero_stone', (-1.4, -d / 2 - 0.05, 0), size=0.15)
sh.socket('socket.stream_edge_l', (-STREAM_W / 2, -d / 2 - 1.2, -0.4), size=0.12)
sh.socket('socket.stream_edge_r', (STREAM_W / 2, -d / 2 - 1.2, -0.4), size=0.12)

kit_objects = [ghat_top, parapet, survey_pillar, schema_pillar_base, schema_band]
sockets = [bpy.data.objects['socket.flights_top'], bpy.data.objects['socket.hero_stone'],
           bpy.data.objects['socket.stream_edge_l'], bpy.data.objects['socket.stream_edge_r'],
           schema_bands_start, schema_pitch]
sh.export_kit(ID, kit_objects + sockets)


def pack_glb(path):
    """Compress with meshopt via the pinned npx gltfpack@1.2.0 call (house
    pattern, M68: the exact pin, never added to package.json; mirrors
    fleet-deepmal.py's pack_glb, since _shared.py is frozen per M42). This
    lane's task 3: pack every GLB."""
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
# Preview-only: mount a representative run of ghat-kit's Step prototype at
# socket.flights_top so this review render actually shows a ghat with
# steps, not a landing with an empty and nothing attached — which was
# finding #1's entire point ("do not review doori-ghat in isolation again
# until ghat-kit.py exists and both are re-exported with flights socketed
# in"). NOT part of the exported kit above; the runtime does this
# instancing from the live `features` (13) count, this is judgement-render
# only, so the pitch constants are duplicated from ghat-kit.py rather than
# imported (no runtime/script coupling across the two exported kits).
# ---------------------------------------------------------------------------
GHAT_KIT_GLB = sh.MODELS_OUT / 'ghat-kit.glb'
if GHAT_KIT_GLB.exists():
    bpy.ops.import_scene.gltf(filepath=str(GHAT_KIT_GLB))
    imported = list(bpy.context.selected_objects)
    step_proto = next((o for o in imported if o.name == 'Step'), None)
    flights_top = bpy.data.objects['socket.flights_top']
    STEP_RUN, STEP_RISE, N_STEPS_PREVIEW = 0.32, 0.16, 12

    def _dup_proto(proto, name):
        """A packed GLB (this lane's task 3) quantizes a named node's mesh
        onto an unnamed child (KHR_mesh_quantization) rather than keeping it
        on the node itself - proto.data is then None and the geometry lives
        on proto.children. Duplicate proto AND its children so a preview
        copy keeps its geometry either way, and position the returned
        (parent) object as before - a child's own local transform is
        relative to its parent, so it comes along for free."""
        dup = proto.copy()
        dup.data = proto.data.copy() if proto.data else None
        dup.name = name
        bpy.context.collection.objects.link(dup)
        for child in proto.children:
            cdup = child.copy()
            cdup.data = child.data.copy() if child.data else None
            cdup.name = f'{name}_{child.name}'
            cdup.parent = dup
            bpy.context.collection.objects.link(cdup)
        return dup

    if step_proto is not None:
        for i in range(N_STEPS_PREVIEW):
            dup = _dup_proto(step_proto, f'Step_preview_{i}')
            dup.location = (flights_top.location.x,
                             flights_top.location.y - i * STEP_RUN,
                             flights_top.location.z - i * STEP_RISE)
    for o in imported:
        o.hide_render = True
        o.hide_viewport = True

preview_dir = sh.SHOWCASE / ID
preview_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(preview_dir / f'{ID}-preview.blend'))
print(f'{ID.upper().replace("-", "_")}_PREVIEW_SAVED')
