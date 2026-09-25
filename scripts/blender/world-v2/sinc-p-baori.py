"""SINC-P baori (world-v2-spec.md landmark #9, idea-atlas.md WORLD-9):
"tenant isolation, four layers" as a stepwell with 4 concentric descending
levels, one per property in SINC-P's public `docs/architecture.md`, and a
ring of 7 low pillars, one per model family in its ADR-0001 council. Only
the published architecture crosses (WORLD-9 "Safety: yes for the public
architecture. No student data, case content or aggregates, ever"): the four
level names below are exactly the four properties idea-atlas.md quotes, and
the one lit pillar is named for the one dissenting model family the README
already quotes publicly.

Kit: 4 named `level.*` rings (widest/shallowest to narrowest/deepest) + 7
`pillar.*` sockets ringing the rim, one of them `pillar.deepseek` (the
runtime lights this one cyan and hovers the published dissent line; the
other six are this lane's task list's generic "7 pillar sockets", not
individually named model families this repo has no public source for).

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python sinc-p-baori.py
"""
from pathlib import Path
import math
import subprocess
import sys
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'sinc-p-baori'
sh.clear_scene()

sandstone = sh.pbr('mat.sandstone')
palestone = sh.pbr('mat.paleStone')

# Outermost (tenant isolation, the entry level) to innermost (no automated
# outcomes, the deepest, most-guarded level) — the doc's own order, which
# idea-atlas.md WORLD-9 says the traversal gate enforces "reversing that
# order is precisely the bug".
LEVELS = [
    ('level.tenantIsolation', 1.6, 0.0),
    ('level.auditChainAtomicity', 1.25, -0.45),
    ('level.statutoryTrackPriority', 0.90, -0.90),
    ('level.noAutomatedOutcomes', 0.55, -1.35),
]
WALL_THICK = 0.10
STEPS = 8


def ring_bm(r_outer, r_inner):
    profile = [(r_inner, 0), (r_outer, 0), (r_outer, 0.30), (r_inner, 0.30)]
    return sh.lathe(profile, steps=STEPS, close_caps=False)


level_objects = []
for name, radius, z in LEVELS:
    bm = sh.canonical_order(ring_bm(radius, radius - WALL_THICK))
    obj = sh.new_mesh_object(name, bm, sandstone)
    obj.location = (0, 0, z)
    level_objects.append(obj)

# --- 7 pillars ringing the outer rim, fixed count (the ADR-0001 council
# size never changes without a new council), one lit for deepseek ---
PILLAR_R = LEVELS[0][1] + 0.18
pillar_sockets = []
for i in range(7):
    ang = i * math.tau / 7
    name = 'pillar.deepseek' if i == 0 else f'pillar.council.{i - 1}'
    s = sh.socket(name, (PILLAR_R * math.cos(ang), PILLAR_R * math.sin(ang), 0),
                  rotation=(0, 0, ang), size=0.05)
    pillar_sockets.append(s)

# --- one low pillar prototype (paleStone) the runtime instances at each
# pillar socket, tinted cyan only at pillar.deepseek ---
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.05, depth=0.40, location=(0, 0, 0.20))
pillar = bpy.context.object
pillar.name = 'Pillar'
pillar.data.name = 'Pillar'
pillar.data.materials.append(palestone)
sh.canonicalize_object(pillar)
bpy.ops.object.select_all(action='DESELECT')

kit_objects = level_objects + pillar_sockets + [pillar]
sh.export_kit(ID, kit_objects)


def pack_glb(path):
    """Compress with meshopt via the pinned npx gltfpack@1.2.0 call (house pattern, M42:
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
