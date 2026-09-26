"""Room chhatri kit (world-v2-spec.md landmark #17): one whitewashed
chhatri per `ROOM_PLACEMENTS` entry, placed at scaled z on its flank (the 8
rooms -- chess, weeb, anthology and the rest). A fixed room list, not a
live count (spec section 0.3 rule 2), so this kit is one reusable prototype the
runtime places 8 times, never 8 baked copies.

Kit:
  - ChhatriUnit: a domed pavilion on 4 pillars, the same lathed-dome +
    cylinder-pillar vocabulary as portfolio-twin-chhatri.py's ChhatriA/B.
  - socket.garland: where the runtime mounts the marigold-garland ambient
    artifact form (master-plan.md#M16: "artifact = marigold garland").

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python room-chhatri-kit.py
"""
from pathlib import Path
import math
import subprocess
import sys
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'room-chhatri-kit'
sh.clear_scene()

plaster = sh.pbr('mat.plaster')
palestone = sh.pbr('mat.paleStone')

PILLAR_R, PILLAR_H, ROOF_R = 0.05, 0.42, 0.30
N_PILLARS = 4

# --- dome roof: a lathed cupola profile, base flare then a rounded crown ---
DOME_PROFILE = [(0.0, PILLAR_H + 0.30), (ROOF_R * 0.55, PILLAR_H + 0.30),
                 (ROOF_R, PILLAR_H + 0.20), (ROOF_R * 0.92, PILLAR_H + 0.10),
                 (ROOF_R * 0.60, PILLAR_H + 0.02), (0.0, PILLAR_H + 0.02)]
dome_bm = sh.lathe(DOME_PROFILE, steps=16)
dome_bm = sh.canonical_order(dome_bm)
dome = sh.new_mesh_object('_dome', dome_bm, plaster)

# --- pillars: 4 lathed drums, joined with the dome into one ChhatriUnit,
# the same join-into-one-node pattern candidai-rahat's Wheel uses. ---
pillars = [dome]
for i in range(N_PILLARS):
    ang = i * math.tau / N_PILLARS + math.pi / 4  # offset 45deg, corners not axes
    x, y = ROOF_R * 0.72 * math.cos(ang), ROOF_R * 0.72 * math.sin(ang)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=PILLAR_R, depth=PILLAR_H,
                                         location=(x, y, PILLAR_H / 2))
    pillar = bpy.context.object
    pillar.data.materials.append(palestone)
    pillars.append(pillar)

bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = pillars[0]
for p in pillars:
    p.select_set(True)
bpy.ops.object.join()
chhatri = bpy.context.object
chhatri.name = 'ChhatriUnit'
chhatri.data.name = 'ChhatriUnit'
sh.canonicalize_object(chhatri)
bpy.ops.object.select_all(action='DESELECT')

# --- garland socket: one mount point under the dome crown for the
# marigold-garland ambient artifact form (M16) ---
garland_socket = sh.socket('socket.garland', (0, 0, PILLAR_H + 0.12), parent=chhatri, size=0.03)

kit_objects = [chhatri, garland_socket]
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
