"""Loopdown kite masts (world-v2-spec.md landmark #10): "one lesson to four
platforms" as 4 fixed kite masts -- the platform count is the project's own
architecture, not a live count (like candidai-rahat's 5 fixed buckets), so
those 4 are baked sockets. Kites tethered to each mast are `writing.lessons`
(17, amber) and `writing.archive` (11, pale; undated ones tethered on the
north edge as in v1) -- that count DOES grow, so kites are a single
prototype-per-tier instanced along a per-mast tether socket, never baked.

Kit:
  - MastPost:       one bamboo-style mast, instanced at each of the 4 fixed
                     platform sockets.
  - KiteLesson:      an amber-tinted paper kite prototype (writing.lessons).
  - KiteArchive:      a pale-tinted paper kite prototype (writing.archive).
  - socket.mast.0-3: the 4 fixed platform mounts (a project architecture
                     fact, not a growing count -- single-digit index).
  - socket.tether:   ONE anchor, local to MastPost (the same local-prototype-
                     offset idiom as fleet-deepmal's socket.flame under
                     NicheUnit) -- the runtime applies it at each of the 4
                     socket.mast.N instance transforms, then steps along it
                     (tether z = created date) to place
                     KiteLesson/KiteArchive instances. A second literal
                     per-mast copy would collide on Blender's own duplicate-
                     name suffixing (socket.tether.001, .002...), which is
                     exactly the digit-suffix shape the data-count gate
                     bans -- so this stays one prototype, not four.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python loopdown-kite-masts.py
"""
from pathlib import Path
import math
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'loopdown-kite-masts'
sh.clear_scene()

bark = sh.pbr('mat.bark')
# Kite tints are not in the shared PBR table (_shared.py is frozen, M42):
# amber for the live lesson count (spec's own "17, amber"), pale for the
# undated archive -- neither is the AMBER *accent* colour re-tasked as
# decoration (section 0.3's ban), it is the same live/shipped-count semantic
# fleet-deepmal's niche flames already carry, just applied to this landmark.
kite_lesson_mat = sh.material('mat.kiteLesson', sh.AMBER, metal=0.0, rough=0.6)
kite_archive_mat = sh.material('mat.kiteArchive', (.82, .80, .74), metal=0.0, rough=0.7)

MAST_H = 0.85
N_MASTS = 4

# --- mast: a lathed tapered bamboo pole ---
MAST_PROFILE = [(0.02, 0), (0.018, MAST_H * 0.5), (0.012, MAST_H * 0.9), (0.006, MAST_H)]
mast_bm = sh.lathe(MAST_PROFILE, steps=8)
mast_bm = sh.canonical_order(mast_bm)
mast_post = sh.new_mesh_object('MastPost', mast_bm, bark)

# --- kite: a flat diamond card, the paper-kite vocabulary (2 triangles,
# folded slightly along the spine for a non-planar silhouette) ---
def kite_bm():
    bm = bmesh.new()
    half = 0.05
    v = [bm.verts.new(p) for p in (
        (0, -half * 1.3, 0), (half, 0, 0.01), (0, half * 1.3, 0), (-half, 0, 0.01))]
    bm.faces.new(v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return sh.canonical_order(bm)


kite_lesson = sh.new_mesh_object('KiteLesson', kite_bm(), kite_lesson_mat)
kite_archive = sh.new_mesh_object('KiteArchive', kite_bm(), kite_archive_mat)
kite_archive.location = (0.2, 0, 0)  # keep the two prototypes visually separated in the .blend

# --- ONE tether anchor, local to MastPost -- the runtime applies it at each
# of the 4 platform instances below (see the module docstring) ---
tether_socket = sh.socket('socket.tether', (0, 0, MAST_H * 0.92), parent=mast_post, size=0.02)

# --- 4 fixed platform sockets (a structural fact, not a live count) ---
mast_sockets = []
for i in range(N_MASTS):
    ms = sh.socket(f'socket.mast.{i}', (i * 0.5, 0, 0), size=0.04)
    mast_sockets.append(ms)

kit_objects = [mast_post, kite_lesson, kite_archive] + mast_sockets
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
