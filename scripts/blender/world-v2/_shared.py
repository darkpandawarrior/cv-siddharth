"""Shared helpers for the World v2 Blender landmark kits.

Every script in this directory does `sys.path.insert(0, str(Path(__file__).
resolve().parent))` then `import _shared as sh`. Kept here because all ~20
landmark scripts need the same PBR material names (bound by the runtime to
Poly Haven textures, see world-v2-spec.md §5), the same brand accent colours
(spec §0.3 — semantic, never reused for decoration), the same determinism
fix (spec §9's "determinism check runs each twice and diffs the bytes"), and
the same export footer. Reimplementing this per-script is what the ladder
calls out first (rung 2: reuse what's already here).

Run only through Blender: `blender --background --factory-startup
--disable-autoexec --python-exit-code 1 --python <script>`.
"""
from pathlib import Path
import math
import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[3]
SHOWCASE = ROOT / '.showcase-work/world-v2'
MODELS_OUT = ROOT / 'heavy/world/models'

# Brand accents (world-v2-spec.md §0.3): semantic, not decorative. Only use
# these four on the element the spec names for them.
AMBER = (0.949, 0.631, 0.239)   # fire / light / calibration
CYAN = (0.369, 0.902, 1.0)      # a *measured* connection
GREEN = (0.239, 0.863, 0.518)   # live / shipped
DEEP = (0.024, 0.031, 0.027)    # fog floor / night shadow / fallback matte

# PBR material *names* the runtime binds by string (spec §5): "Materials are
# exported by name only. The runtime binds shared Poly Haven textures by
# material name ... so no texture is duplicated across GLBs." The colours
# here are lookdev stand-ins for offline rendering/inspection only — the
# runtime replaces the texture, never the name, so the name is the contract.
PBR = {
    'mat.sandstone': ((.62, .50, .36), 0.0, .78),
    'mat.paleStone': ((.80, .76, .68), 0.0, .70),
    'mat.plaster': ((.87, .85, .80), 0.0, .55),
    'mat.planks': ((.34, .21, .12), 0.0, .62),
    'mat.bark': ((.23, .16, .10), 0.0, .88),
    'mat.roofTile': ((.55, .21, .13), 0.0, .58),
    'mat.clay': ((.56, .31, .19), 0.0, .82),
    'mat.brass': ((.71, .49, .17), .88, .30),
    'mat.laterite': ((.40, .21, .13), 0.0, .88),
    'mat.palmBark': ((.42, .31, .18), 0.0, .80),
}

_material_cache: dict[str, bpy.types.Material] = {}


def clear_scene() -> None:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block_type in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for block in list(block_type):
            if block.users == 0:
                block_type.remove(block)


def material(name, color, metal=0.0, rough=0.5, emission=None, emission_strength=0.0):
    """House pattern (kmp-foundation-keystone.py, studio-orbit.py): a single
    Principled BSDF, no texture nodes — texture binding is the runtime's job
    for the mat.* names, and accent materials stay flat-shaded PBR."""
    if name in _material_cache:
        return _material_cache[name]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if emission is not None:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = emission_strength
    _material_cache[name] = mat
    return mat


def pbr(name):
    """A shared mat.* material by its exact runtime-bound name."""
    color, metal, rough = PBR[name]
    return material(name, color, metal, rough)


def canonical_order(bm):
    """A modifier's evaluation order is keyed to internal heap pointers, so
    two runs of the same construction can emit identical geometry in a
    different element order. Rebuild a fresh bmesh with verts and faces
    inserted in a position-sorted, pure-Python order, so the exported GLB is
    byte-identical across runs, as the determinism gate requires (spec §9)."""
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    coords = [tuple(v.co) for v in bm.verts]
    faces_info = [([v.index for v in f.verts], f.material_index, f.smooth) for f in bm.faces]
    order = sorted(range(len(coords)), key=lambda i: tuple(round(c, 5) for c in coords[i]))
    remap = {old: new for new, old in enumerate(order)}
    out = bmesh.new()
    new_verts = [out.verts.new(coords[old]) for old in order]

    def rotate_to_min(loop):
        start = loop.index(min(loop))
        return loop[start:] + loop[:start]

    face_defs = sorted(
        (rotate_to_min([remap[i] for i in verts]), mat, smooth) for verts, mat, smooth in faces_info
    )
    for verts, mat, smooth in face_defs:
        face = out.faces.new(tuple(new_verts[i] for i in verts))
        face.material_index = mat
        face.smooth = smooth
    bmesh.ops.recalc_face_normals(out, faces=out.faces)
    bm.free()
    return out


def canonicalize_object(obj):
    """Apply canonical_order to an object built from bpy.ops primitives plus
    modifiers (as opposed to a hand-built bmesh, which is already ordered by
    construction)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    out = canonical_order(bm)
    out.to_mesh(obj.data)
    out.free()
    obj.data.update()


def new_mesh_object(name, bm, mat, smooth=True, collection=None):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    (collection or bpy.context.collection).objects.link(obj)
    return obj


def lathe(profile_xz, steps, close_caps=True):
    """Spin a 2D (radius, z) profile around +Z, `steps`-sided — the lathe
    technique from studio-orbit.py's hex plinth. Returns a fresh bmesh."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profile_xz]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1),
                    angle=math.tau, steps=steps, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    if close_caps:
        bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def socket(name, location, rotation=(0, 0, 0), parent=None, size=0.12):
    """A named empty the runtime reads to mount a data-count instance
    (spec §5: 'Named empties (socket.*) are where the runtime mounts
    data-count instances')."""
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = 'PLAIN_AXES'
    empty.empty_display_size = size
    empty.location = location
    empty.rotation_euler = rotation
    if parent is not None:
        empty.parent = parent
    bpy.context.collection.objects.link(empty)
    return empty


def bevel_apply(obj, width, segments=2):
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(35)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def tri_estimate(objects):
    """Cheap pre-export sanity count (sum of ngon fan triangulation). The
    real budget gate is inspect_asset.py's evaluated triangle count on the
    exported GLB; this just catches a gross overshoot before we render."""
    total = 0
    for obj in objects:
        if obj.type != 'MESH':
            continue
        total += sum(max(len(p.vertices) - 2, 0) for p in obj.data.polygons)
    return total


def export_kit(script_id, root_objects):
    """Save the .blend to the showcase scratch dir and export the given
    objects (only) as a Y-up GLB at heavy/world/models/<id>.glb, per the
    house pattern (kmp-foundation-keystone.py) and world-v2-spec.md §5."""
    out_dir = SHOWCASE / script_id
    out_dir.mkdir(parents=True, exist_ok=True)
    MODELS_OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / f'{script_id}.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in root_objects:
        obj.select_set(True)
        for child in obj.children_recursive:
            child.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(MODELS_OUT / f'{script_id}.glb'),
        export_format='GLB', export_yup=True, use_selection=True,
        export_image_format='NONE', export_apply=True,
    )
    tris = tri_estimate([o for o in root_objects if o.type == 'MESH'] +
                         [c for o in root_objects for c in o.children_recursive if c.type == 'MESH'])
    print(f'{script_id.upper().replace("-", "_")}_EXPORTED tris~={tris}')
