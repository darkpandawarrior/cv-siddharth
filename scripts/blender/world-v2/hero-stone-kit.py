"""Hero stone kit (world-v2-spec.md landmark #12): a viragal-style carved
stone per case study, sitting on its parent employer's ghat at the
waterline. Carved registers = `approach.length`, which varies per case
study (3 to 8 items across the 5 case studies in
src/data/profile/caseStudies.ts) -- a growing/varying count, so per spec
section 0.3 rule 2 this kit never bakes a fixed register count. One stone
body plus one register-band prototype, spaced by a pitch socket the runtime
steps N times (the same idiom fleet-deepmal.py's niche_pitch and
socket.ring_pitch use for its own per-tier/per-niche counts).

Kit:
  - HeroStone:            the stone slab body, mat.sandstone (world-v2-spec.md
                           section 8 texture table: "hero stones" is a named
                           mat.sandstone consumer).
  - RegisterBand:          one carved horizontal register line, instanced up
                           the stone's face.
  - socket.register_pitch: the z-step + origin the runtime reads to place
                           `approach.length` RegisterBand instances.

Run with: blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python hero-stone-kit.py
"""
from pathlib import Path
import subprocess
import sys
import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _shared as sh

ID = 'hero-stone-kit'
sh.clear_scene()

sandstone = sh.pbr('mat.sandstone')

# --- stone body: a tall tapered slab, rounded top (the viragal silhouette:
# narrower at the crown than the base), box-then-bevel like template-gomukh's
# GomukhHead. ---
HALF_W, HALF_D, HEIGHT = 0.14, 0.05, 0.55
TOP_SHRINK = 0.72
bm = bmesh.new()
tw = HALF_W * TOP_SHRINK
v = [bm.verts.new(p) for p in (
    (-HALF_W, -HALF_D, 0), (HALF_W, -HALF_D, 0), (HALF_W, HALF_D, 0), (-HALF_W, HALF_D, 0),
    (-tw, -HALF_D * 0.8, HEIGHT), (tw, -HALF_D * 0.8, HEIGHT),
    (tw, HALF_D * 0.8, HEIGHT), (-tw, HALF_D * 0.8, HEIGHT))]
bm.faces.new((v[0], v[1], v[2], v[3]))
bm.faces.new((v[7], v[6], v[5], v[4]))
bm.faces.new((v[0], v[4], v[5], v[1]))
bm.faces.new((v[1], v[5], v[6], v[2]))
bm.faces.new((v[2], v[6], v[7], v[3]))
bm.faces.new((v[3], v[7], v[4], v[0]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.ops.bevel(bm, geom=[e for e in bm.edges if e.is_boundary], offset=0.015, segments=2, affect='EDGES')
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=list(bm.edges))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm = sh.canonical_order(bm)
hero_stone = sh.new_mesh_object('HeroStone', bm, sandstone)

# --- register band: a thin carved inset line across the stone's front
# face -- one prototype, instanced N times per case study by the runtime. ---
band_bm = bmesh.new()
bw, bh = HALF_W * 0.86, 0.025
bv = [band_bm.verts.new(p) for p in (
    (-bw, 0, -bh / 2), (bw, 0, -bh / 2), (bw, 0, bh / 2), (-bw, 0, bh / 2))]
band_bm.faces.new(bv)
bmesh.ops.recalc_face_normals(band_bm, faces=band_bm.faces)
band_bm = sh.canonical_order(band_bm)
register_band = sh.new_mesh_object('RegisterBand', band_bm, sandstone)
register_band.location = (0, -HALF_D - 0.002, HEIGHT * 0.2)

# --- pitch socket: origin + z-step for the runtime's register-band loop ---
register_pitch = sh.socket('socket.register_pitch', (0, -HALF_D - 0.002, HEIGHT * 0.12), size=0.03)

kit_objects = [hero_stone, register_band, register_pitch]
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
