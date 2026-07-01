import json
import mathutils
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "unsoccer" / "assets" / "models" / "balls" / "free3d" / "raw"
OUT_DIR = ROOT / "unsoccer" / "client" / "public" / "assets" / "balls" / "free3d"
PROVENANCE = ROOT / "unsoccer" / "assets" / "licenses" / "free3d-provenance.json"
ROSTER = OUT_DIR / "roster.json"

FALLBACK_COLORS = [
    (0.05, 0.06, 0.08, 1.0),
    (0.22, 0.37, 0.23, 1.0),
    (0.82, 0.79, 0.70, 1.0),
    (0.90, 0.35, 0.58, 1.0),
    (0.90, 0.10, 0.08, 1.0),
    (0.20, 0.52, 0.80, 1.0),
    (0.95, 0.68, 0.18, 1.0),
    (0.40, 0.26, 0.15, 1.0),
    (0.25, 0.95, 0.25, 1.0),
    (0.12, 0.24, 0.75, 1.0),
]


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for datablock in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.textures,
        bpy.data.armatures,
        bpy.data.actions,
    ):
        for item in list(datablock):
            datablock.remove(item)


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def ensure_color_attribute(obj):
    mesh = obj.data
    color = mesh.color_attributes.get("COLOR_0")
    if color is None:
        color = mesh.color_attributes.new(name="COLOR_0", type="BYTE_COLOR", domain="CORNER")
    mesh.color_attributes.active_color = color
    mesh.color_attributes.render_color_index = list(mesh.color_attributes).index(color)
    return color


def fill_fallback_colors(obj, color, index):
    primary = FALLBACK_COLORS[index % len(FALLBACK_COLORS)]
    secondary = (1.0, 1.0, 1.0, 1.0)
    mesh = obj.data
    for polygon in mesh.polygons:
        shade = primary if polygon.index % 3 else secondary
        for loop_index in polygon.loop_indices:
            color.data[loop_index].color = shade


def normalize_scene():
    objects = mesh_objects()
    if not objects:
        return

    min_corner = mathutils.Vector((float("inf"), float("inf"), float("inf")))
    max_corner = mathutils.Vector((float("-inf"), float("-inf"), float("-inf")))
    bpy.context.view_layer.update()
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ mathutils.Vector(corner)
            min_corner.x = min(min_corner.x, world.x)
            min_corner.y = min(min_corner.y, world.y)
            min_corner.z = min(min_corner.z, world.z)
            max_corner.x = max(max_corner.x, world.x)
            max_corner.y = max(max_corner.y, world.y)
            max_corner.z = max(max_corner.z, world.z)

    center = (min_corner + max_corner) * 0.5
    size = max((max_corner - min_corner).length, 0.001)
    scale = 0.84 / size
    for obj in objects:
        obj.location -= center
        obj.scale *= scale
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.select_set(False)


def replace_materials():
    material = bpy.data.materials.new("free3d_vertex_color_pbr")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.56
        bsdf.inputs["Metallic"].default_value = 0.0
    for obj in mesh_objects():
        obj.data.materials.clear()
        obj.data.materials.append(material)


def bake_vertex_colors(index):
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 8
    bpy.context.scene.render.bake.target = "VERTEX_COLORS"
    bpy.context.scene.render.bake.use_pass_direct = False
    bpy.context.scene.render.bake.use_pass_indirect = False
    bpy.context.scene.render.bake.use_pass_color = True
    bpy.context.scene.render.bake.margin = 2

    for obj in mesh_objects():
        color = ensure_color_attribute(obj)
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            bpy.ops.object.bake(type="DIFFUSE")
        except Exception:
            fill_fallback_colors(obj, color, index)
        obj.select_set(False)


def export_ball(source_path, out_path, index):
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source_path))
    if not mesh_objects():
        raise RuntimeError(f"No mesh in {source_path}")
    normalize_scene()
    bake_vertex_colors(index)
    replace_materials()
    for image in list(bpy.data.images):
        bpy.data.images.remove(image)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        export_copyright="Free3D Online source asset, optimized to vertex colors for UnSoccer",
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE",
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True,
    )


def main():
    data = json.loads(PROVENANCE.read_text(encoding="utf-8"))
    exported = []
    for asset in data.get("assets", []):
        source = ROOT / asset["localPath"]
        target_name = f"{asset['index'] + 1:02d}-{asset['guid']}-vertex.glb"
        target = OUT_DIR / target_name
        export_ball(source, target, asset["index"])
        exported.append(
            {
                "index": asset["index"],
                "guid": asset["guid"],
                "title": asset["title"],
                "src": f"/assets/balls/free3d/{target_name}",
                "source": asset["modelPageUrl"],
                "lod": asset["lod"],
                "format": "glb",
            }
        )

    ROSTER.write_text(
        json.dumps(
            {
                "version": "v0.0.011",
                "mode": "free3d-1k-glb-vertex-color-optimized",
                "texturePolicy": "Textures are baked or approximated into COLOR_0; runtime materials use vertex colors.",
                "assets": exported,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"exported": len(exported), "roster": str(ROSTER)}, indent=2))


if __name__ == "__main__":
    main()
