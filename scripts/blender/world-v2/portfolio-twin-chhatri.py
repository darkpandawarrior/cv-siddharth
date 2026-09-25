"""Portfolio Twin chhatri (world-v2-spec.md landmark #7): "built twice, two
stacks" as two identical domed chhatris mirrored across a still pool. The
floor inlay tile count is live data (`repoStats.testFiles`, G14), so it is
never baked — one InlayTile prototype plus a `socket.floorInlay` pitch empty,
same trick as fleet-deepmal.py's niche_pitch. The site's own CI lights this
landmark (idea-atlas.md WORLD-7 "the site's own CI lights this landmark"),
so the tile carries its own accent material, `mat.siteCI`, distinct from the
shared Poly Haven `mat.*` set (§5's table) because nothing there is meant to
be runtime-lit by a build status.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python portfolio-twin-chhatri.py
"""
from pathlib import Path
import math
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'portfolio-twin-chhatri'
sh.clear_scene()

palestone = sh.pbr('mat.paleStone')
site_ci = sh.material('mat.siteCI', sh.AMBER, metal=0.0, rough=0.35,
                       emission=sh.AMBER, emission_strength=3.0)

PILLAR_PROFILE = [(.05, 0), (.06, .04), (.04, .5), (.055, .56), (.05, .60)]
DOME_PROFILE = [(0.0, 0), (.62, 0), (.64, .06), (.55, .30), (.30, .48), (.10, .58), (0.0, .62)]
PILLAR_R = 0.5


def build_chhatri(name):
    """One domed pavilion (ghat-kit.py's ChhatriPavilion vocabulary: 4
    lathed pillars, a lathed dome, a deck), joined into one named mesh."""
    parts = []
    for i in range(4):
        ang = i * math.pi / 2 + math.pi / 4
        px, py = PILLAR_R * math.cos(ang), PILLAR_R * math.sin(ang)
        p_bm = sh.canonical_order(sh.lathe(PILLAR_PROFILE, steps=8))
        p_obj = sh.new_mesh_object(f'_{name}_pillar_{i}', p_bm, palestone)
        p_obj.location = (px, py, 0)
        parts.append(p_obj)

    dome_obj = sh.new_mesh_object(f'_{name}_dome', sh.canonical_order(sh.lathe(DOME_PROFILE, steps=12)), palestone)
    dome_obj.location = (0, 0, 0.60)
    parts.append(dome_obj)

    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.68, depth=0.06, location=(0, 0, 0.03))
    deck = bpy.context.object
    deck.data.materials.append(palestone)
    parts.append(deck)

    bpy.context.view_layer.objects.active = parts[0]
    for p in parts:
        p.select_set(True)
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name
    sh.canonicalize_object(obj)
    bpy.ops.object.select_all(action='DESELECT')
    return obj


POOL_HALF_X = 1.6
chhatri_a = build_chhatri('ChhatriA')
chhatri_a.location = (-POOL_HALF_X, 0, 0)
chhatri_b = build_chhatri('ChhatriB')
chhatri_b.location = (POOL_HALF_X, 0, 0)

# --- still pool between them ---
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, 0, 0))
pool = bpy.context.object
pool.scale = (POOL_HALF_X * 1.3, 0.9, 1.0)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
pool.name = 'Pool'
pool.data.name = 'Pool'
pool.data.materials.append(palestone)
sh.canonicalize_object(pool)

# --- floor inlay: one lit tile prototype, `repoStats.testFiles` of them
# laid at runtime along socket.floorInlay's pitch (never baked here) ---
inlay_bm = bmesh.new()
hw = 0.05
iv = [inlay_bm.verts.new(p) for p in ((-hw, -hw, 0.001), (hw, -hw, 0.001), (hw, hw, 0.001), (-hw, hw, 0.001))]
inlay_bm.faces.new(iv)
bmesh.ops.recalc_face_normals(inlay_bm, faces=inlay_bm.faces)
inlay_bm = sh.canonical_order(inlay_bm)
inlay_tile = sh.new_mesh_object('InlayTile', inlay_bm, site_ci)

floor_inlay = sh.socket('socket.floorInlay', (0.14, 0.14, 0), size=0.02)

kit_objects = [chhatri_a, chhatri_b, pool, inlay_tile, floor_inlay]
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
