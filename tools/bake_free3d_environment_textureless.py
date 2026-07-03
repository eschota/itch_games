import json
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "unsoccer" / "assets" / "models" / "environment" / "free3d" / "raw"
OUT_DIR = ROOT / "unsoccer" / "client" / "public" / "assets" / "environment" / "free3d"
ROSTER = OUT_DIR / "roster.json"


FALLBACK_COLORS = {
    "bench": (0.53, 0.32, 0.17, 1.0),
    "trash": (0.14, 0.18, 0.18, 1.0),
    "traffic": (1.0, 0.42, 0.12, 1.0),
    "ruins": (0.52, 0.55, 0.54, 1.0),
}


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


def fallback_color(kind):
    lowered = str(kind).lower()
    for key, color in FALLBACK_COLORS.items():
        if key in lowered:
            return color
    return (0.65, 0.68, 0.64, 1.0)


def fill_fallback_colors(obj, color, kind):
    primary = fallback_color(kind)
    secondary = tuple(min(1.0, channel * 1.18) for channel in primary[:3]) + (1.0,)
    mesh = obj.data
    for polygon in mesh.polygons:
        shade = secondary if polygon.index % 5 == 0 else primary
        for loop_index in polygon.loop_indices:
            color.data[loop_index].color = shade


def bake_vertex_colors(kind):
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
            fill_fallback_colors(obj, color, kind)
        obj.select_set(False)


def replace_materials(kind):
    material = bpy.data.materials.new(f"{kind}_vertex_color_pbr")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.78
        bsdf.inputs["Metallic"].default_value = 0.03 if "metal" in str(kind).lower() else 0.0
    for obj in mesh_objects():
        obj.data.materials.clear()
        obj.data.materials.append(material)


def export_asset(source_path, out_path, asset):
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source_path))
    if not mesh_objects():
        raise RuntimeError(f"No mesh in {source_path}")
    bake_vertex_colors(asset.get("kind") or asset.get("guid") or "environment")
    replace_materials(asset.get("kind") or asset.get("guid") or "environment")
    for image in list(bpy.data.images):
        bpy.data.images.remove(image)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        export_copyright="Free3D Online source asset, baked to textureless vertex PBR for UnSoccer",
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
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))
    exported = []
    for asset in roster.get("assets", []):
        source = RAW_DIR / Path(asset["src"]).name
        target = OUT_DIR / Path(asset["src"]).name
        export_asset(source, target, asset)
        exported.append(
            {
                **asset,
                "src": f"assets/environment/free3d/{target.name}",
                "bytes": target.stat().st_size,
                "texturePolicy": "no-runtime-textures",
            }
        )

    roster["version"] = "v0.0.034"
    roster["mode"] = "free3d-local-textureless-vertex-pbr-glb"
    roster["texturePolicy"] = "Texture maps are baked or approximated into COLOR_0. Runtime GLB files contain zero images and zero textures."
    roster["assets"] = exported
    ROSTER.write_text(json.dumps(roster, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"exported": len(exported), "roster": str(ROSTER)}, indent=2))


if __name__ == "__main__":
    main()
