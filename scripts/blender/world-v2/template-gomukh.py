"""kmp-app-template gomukh (world-v2-spec.md landmark #6): a stylised
cow-mouth spring spout feeding the template's measured includeBuild stream,
which splits in two before the basin. No project page opens from this
landmark (hover label only), so the kit stays small: one head block and the
two named outlets the split reads from.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python template-gomukh.py
"""
from pathlib import Path
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'template-gomukh'
sh.clear_scene()

palestone = sh.pbr('mat.paleStone')

# --- gomukh head: a stylised wedge muzzle, wide at the wall (-Y) and
# tapering to a narrow twin-outlet snout (+Y), carved with a bevel so it
# reads as worked stone rather than a bare block. ---
bm = bmesh.new()
v = [bm.verts.new(p) for p in (
    (-0.22, -0.10, 0), (0.22, -0.10, 0), (0.22, -0.10, 0.30), (-0.22, -0.10, 0.30),
    (-0.07, 0.28, 0.06), (0.07, 0.28, 0.06), (0.07, 0.28, 0.18), (-0.07, 0.28, 0.18))]
bm.faces.new((v[0], v[1], v[2], v[3]))                 # wall face
bm.faces.new((v[7], v[6], v[5], v[4]))                 # snout face
bm.faces.new((v[0], v[4], v[5], v[1]))                 # underside
bm.faces.new((v[1], v[5], v[6], v[2]))                 # +X flank
bm.faces.new((v[2], v[6], v[7], v[3]))                 # top
bm.faces.new((v[3], v[7], v[4], v[0]))                 # -X flank
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.ops.bevel(bm, geom=[e for e in bm.edges if e.is_boundary], offset=0.012, segments=2, affect='EDGES')
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=list(bm.edges))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm = sh.canonical_order(bm)
gomukh_head = sh.new_mesh_object('GomukhHead', bm, palestone)

# --- the split: exactly two outlets (spec §5 #6: "2 edges -> splits in two
# before the basin"), a fixed structural fact of this one template kit, not
# a growing data count -> named sockets, not a pitch step. ---
spout_a = sh.socket('socket.spout.a', (-0.04, 0.28, 0.10), size=0.03)
spout_b = sh.socket('socket.spout.b', (0.04, 0.28, 0.10), size=0.03)

kit_objects = [gomukh_head, spout_a, spout_b]
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
