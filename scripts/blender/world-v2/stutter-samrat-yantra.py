"""STUTTER Samrat Yantra (world-v2-spec.md landmark #8, idea-atlas.md SKY-4):
"the one true clock" — a Jantar Mantar sundial whose gnomon casts the real
Pune sun direction as a moon-white inlay on the quadrant, beside the baked
golden-hour shadow the valley's authored light already casts. This is
Stutter's premise ("a world replaying one moment") expressed as one honest
mechanic; no Stutter narrative, entity names or grief material belong in
this file (idea-atlas.md SKY-4 "Safety: yes, with care").

Kit: Gnomon (the triangular blade whose edge points along the equatorial
axis) + Quadrant (the curved dial it shadows) + a plane literally named
`shadowInlay`, the one node the runtime moves/hides by `sunPosition(now)`.
It carries no baked hour-marks (spec §5 #8: "unmarked" unless the
deterministic-step count is exported, which is Stutter-repo data this file
never reaches for).

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python stutter-samrat-yantra.py
"""
from pathlib import Path
import math
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'stutter-samrat-yantra'
sh.clear_scene()

plaster = sh.pbr('mat.plaster')
moon_white = sh.material('mat.moonWhite', (.92, .93, .95), metal=0.0, rough=0.25,
                          emission=(.92, .93, .95), emission_strength=0.4)

# --- gnomon: a thin right-triangle wedge (the equatorial blade), thicker at
# the base than the working edge so it reads as worked masonry, not a card ---
gnomon_bm = bmesh.new()
BASE, HEIGHT, THICK = 0.9, 0.7, 0.12
gv = [gnomon_bm.verts.new(p) for p in (
    (0, -THICK / 2, 0), (BASE, -THICK / 2, 0), (0, -THICK / 2, HEIGHT),
    (0, THICK / 2, 0), (BASE, THICK / 2, 0), (0, THICK / 2, HEIGHT))]
gnomon_bm.faces.new((gv[0], gv[1], gv[2]))                 # -Y face
gnomon_bm.faces.new((gv[5], gv[4], gv[3]))                 # +Y face
gnomon_bm.faces.new((gv[0], gv[3], gv[4], gv[1]))          # base
gnomon_bm.faces.new((gv[1], gv[4], gv[5], gv[2]))          # hypotenuse (shadow-casting edge)
gnomon_bm.faces.new((gv[2], gv[5], gv[3], gv[0]))          # back
bmesh.ops.recalc_face_normals(gnomon_bm, faces=gnomon_bm.faces)
bmesh.ops.bevel(gnomon_bm, geom=[e for e in gnomon_bm.edges if e.is_boundary], offset=0.01, segments=2, affect='EDGES')
bmesh.ops.recalc_face_normals(gnomon_bm, faces=gnomon_bm.faces)
bmesh.ops.dissolve_degenerate(gnomon_bm, dist=1e-5, edges=list(gnomon_bm.edges))
bmesh.ops.recalc_face_normals(gnomon_bm, faces=gnomon_bm.faces)
gnomon_bm = sh.canonical_order(gnomon_bm)
gnomon = sh.new_mesh_object('Gnomon', gnomon_bm, plaster)

# --- quadrant: a flat quarter-disc dial the gnomon's edge shadows onto,
# built as a bmesh fan so it stays a single clean face loop ---
QUAD_R, QUAD_STEPS = 1.1, 14
quad_bm = bmesh.new()
centre = quad_bm.verts.new((0, 0, 0))
rim = [quad_bm.verts.new((QUAD_R * math.cos(a), QUAD_R * math.sin(a), 0))
       for a in (math.pi / 2 * i / QUAD_STEPS for i in range(QUAD_STEPS + 1))]
for i in range(QUAD_STEPS):
    quad_bm.faces.new((centre, rim[i], rim[i + 1]))
bmesh.ops.recalc_face_normals(quad_bm, faces=quad_bm.faces)
quad_bm = sh.canonical_order(quad_bm)
quadrant = sh.new_mesh_object('Quadrant', quad_bm, plaster)
quadrant.rotation_euler = (0, 0, -math.pi / 4)

# --- shadowInlay: the one plane the runtime moves along the quadrant by the
# real sun azimuth; named exactly as this lane's task list quotes it, not
# prefixed socket.* since the runtime shows/hides and reorients its own mesh
# rather than instancing a prototype onto it. ---
inlay_bm = bmesh.new()
iw, il = 0.03, QUAD_R * 0.9
ivs = [inlay_bm.verts.new(p) for p in ((0, -iw / 2, 0.002), (il, -iw / 2, 0.002),
                                        (il, iw / 2, 0.002), (0, iw / 2, 0.002))]
inlay_bm.faces.new(ivs)
bmesh.ops.recalc_face_normals(inlay_bm, faces=inlay_bm.faces)
inlay_bm = sh.canonical_order(inlay_bm)
shadow_inlay = sh.new_mesh_object('shadowInlay', inlay_bm, moon_white)

kit_objects = [gnomon, quadrant, shadow_inlay]
sh.export_kit(ID, kit_objects)


def pack_glb(path):
    """Compress with meshopt via pinned npx gltfpack (house pattern, M42:
    _shared.py is frozen, so this lives here; mirrors
    kmp-foundation-keystone.py's compress_with_meshopt)."""
    path = Path(path)
    tmp = path.with_suffix('.tmp.glb')
    subprocess.run(
        ['npx', '-y', 'gltfpack@1.2.0', '-cc', '-kn', '-i', str(path), '-o', str(tmp)],
        check=True,
    )
    tmp.replace(path)


pack_glb(sh.MODELS_OUT / f'{ID}.glb')
print(f'{ID.upper().replace("-", "_")}_PACKED')
