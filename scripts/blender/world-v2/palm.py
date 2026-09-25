"""World v2 coconut palm (world-v2-spec.md §6): a single leaning trunk built
from the same tapered-tube technique as banyan-neem.py, plus the socket the
runtime's frond cross-card instancing (P3-01b, foliage-atlas.py's atlas
texture) mounts at the crown. Budget: 4k tris / 120 KB.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python palm.py
"""
from pathlib import Path
import math
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'palm'
sh.clear_scene()
palm_bark = sh.pbr('mat.palmBark')


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _scale(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def _length(a):
    return math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])


def _normalize(a):
    length = _length(a)
    return (0.0, 0.0, 0.0) if length < 1e-9 else _scale(a, 1.0 / length)


def add_tube(bm, p0, p1, r0, r1, sides=6):
    """Capped tapered cylinder; identical technique to banyan-neem.py's
    add_tube (duplicated, not shared -- _shared.py is frozen, house pattern
    per template-gomukh.py's pack_glb)."""
    direction = _normalize(_sub(p1, p0))
    if direction == (0.0, 0.0, 0.0):
        return
    up_ref = (1.0, 0.0, 0.0) if abs(direction[2]) > 0.999 else (0.0, 0.0, 1.0)
    right = _normalize(_cross(up_ref, direction))
    up = _cross(direction, right)

    ring0, ring1 = [], []
    for i in range(sides):
        theta = 2 * math.pi * i / sides
        c, s = math.cos(theta), math.sin(theta)
        offset = _add(_scale(right, c), _scale(up, s))
        ring0.append(bm.verts.new(_add(p0, _scale(offset, r0))))
        ring1.append(bm.verts.new(_add(p1, _scale(offset, r1))))

    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((ring0[i], ring0[j], ring1[j]))
        bm.faces.new((ring0[i], ring1[j], ring1[i]))

    c0 = bm.verts.new(p0)
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((c0, ring0[j], ring0[i]))
    c1 = bm.verts.new(p1)
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((c1, ring1[i], ring1[j]))


# --- Trunk: 7 fixed segments curving from a buttressed base to a lean at the
# crown (real coconut palms lean, they are never a straight pole). A named,
# deterministic bend profile, not a growth simulation -- palms have one
# trunk, so space-colonisation (banyan-neem.py's job) would be overkill
# here. ---
SEGMENTS = 7
TRUNK_HEIGHT = 7.2
LEAN = 0.9  # total +X drift from base to crown, applied as an ease-in curve

points = []
radii = []
for s in range(SEGMENTS + 1):
    t = s / SEGMENTS
    z = TRUNK_HEIGHT * t
    x = LEAN * (t * t)  # ease-in: most of the lean happens near the crown
    points.append((x, 0.0, z))
    base_r = 0.20 if s == 0 else 0.16 - 0.11 * t  # buttress flare at the base
    radii.append(max(0.045, base_r))

bm = bmesh.new()
for s in range(SEGMENTS):
    add_tube(bm, points[s], points[s + 1], radii[s], radii[s + 1], sides=8)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm = sh.canonical_order(bm)
trunk_obj = sh.new_mesh_object('PalmTrunk', bm, palm_bark)

crown_socket = sh.socket('socket.frond', points[-1], size=0.15)

kit_objects = [trunk_obj, crown_socket]
sh.export_kit(ID, kit_objects)


def pack_glb(path):
    """Pinned npx gltfpack@1.2.0 (house pattern, M68)."""
    path = Path(path)
    tmp = path.with_suffix('.tmp.glb')
    subprocess.run(['npx', '-y', 'gltfpack@1.2.0', '-cc', '-kn', '-i', str(path), '-o', str(tmp)], check=True)
    tmp.replace(path)


pack_glb(sh.MODELS_OUT / f'{ID}.glb')
print(f'{ID.upper().replace("-", "_")}_PACKED')
