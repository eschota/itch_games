"""Bake Free3D character source textures into runtime GLB vertex colors.

The game must not ship runtime image textures. This script reads the local raw
Free3D character source folders, samples albedo/ORM textures by TEXCOORD_0, and
writes COLOR_0 plus TEXCOORD_1 packed roughness/metalness into the public GLBs.
"""

from __future__ import annotations

import json
import math
import pathlib
import struct
from dataclasses import dataclass
from typing import Any

from PIL import Image


ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW_ROOT = ROOT / "unsoccer" / "assets" / "models" / "characters" / "free3d" / "raw"
PUBLIC_ROOT = ROOT / "unsoccer" / "client" / "public" / "assets" / "characters" / "free3d"

COMPONENT_FLOAT = 5126
ARRAY_BUFFER = 34962
VEC_SIZES = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT4": 16,
}
COMPONENT_FORMATS = {
    5120: ("b", 1),
    5121: ("B", 1),
    5122: ("h", 2),
    5123: ("H", 2),
    5125: ("I", 4),
    5126: ("f", 4),
}


@dataclass
class Glb:
    json_doc: dict[str, Any]
    bin_chunk: bytearray


def align4(value: int) -> int:
    return (value + 3) & ~3


def read_glb(path: pathlib.Path) -> Glb:
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise RuntimeError(f"{path} is not a GLB")
    offset = 12
    json_doc: dict[str, Any] | None = None
    bin_chunk = bytearray()
    while offset < len(data):
        length, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk = data[offset : offset + length]
        offset += length
        if chunk_type == b"JSON":
            json_doc = json.loads(chunk.decode("utf-8"))
        elif chunk_type == b"BIN\x00":
            bin_chunk = bytearray(chunk)
    if json_doc is None:
        raise RuntimeError(f"{path} is missing JSON chunk")
    return Glb(json_doc=json_doc, bin_chunk=bin_chunk)


def write_glb(path: pathlib.Path, glb: Glb) -> None:
    json_bytes = json.dumps(glb.json_doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_bytes += b" " * (align4(len(json_bytes)) - len(json_bytes))
    bin_bytes = bytes(glb.bin_chunk)
    bin_bytes += b"\x00" * (align4(len(bin_bytes)) - len(bin_bytes))
    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    out = bytearray()
    out += b"glTF"
    out += struct.pack("<II", 2, total_length)
    out += struct.pack("<I4s", len(json_bytes), b"JSON")
    out += json_bytes
    out += struct.pack("<I4s", len(bin_bytes), b"BIN\x00")
    out += bin_bytes
    path.write_bytes(out)


def accessor_values(glb: Glb, accessor_index: int) -> list[tuple[float, ...]]:
    accessor = glb.json_doc["accessors"][accessor_index]
    view = glb.json_doc["bufferViews"][accessor["bufferView"]]
    component_type = accessor["componentType"]
    fmt, component_size = COMPONENT_FORMATS[component_type]
    item_size = VEC_SIZES[accessor["type"]]
    count = accessor["count"]
    accessor_offset = accessor.get("byteOffset", 0)
    view_offset = view.get("byteOffset", 0)
    stride = view.get("byteStride", component_size * item_size)
    normalized = bool(accessor.get("normalized"))
    values: list[tuple[float, ...]] = []
    for index in range(count):
        base = view_offset + accessor_offset + index * stride
        item = []
        for component in range(item_size):
            raw = struct.unpack_from("<" + fmt, glb.bin_chunk, base + component * component_size)[0]
            if normalized:
                raw = normalize_component(raw, component_type)
            item.append(float(raw))
        values.append(tuple(item))
    return values


def normalize_component(value: int | float, component_type: int) -> float:
    if component_type == 5120:
        return max(float(value) / 127.0, -1.0)
    if component_type == 5121:
        return float(value) / 255.0
    if component_type == 5122:
        return max(float(value) / 32767.0, -1.0)
    if component_type == 5123:
        return float(value) / 65535.0
    if component_type == 5125:
        return float(value) / 4294967295.0
    return float(value)


def srgb_to_linear(value: float) -> float:
    if value <= 0.04045:
        return value / 12.92
    return ((value + 0.055) / 1.055) ** 2.4


class Sampler:
    def __init__(self, path: pathlib.Path, srgb: bool) -> None:
        self.image = Image.open(path).convert("RGBA")
        self.srgb = srgb
        self.width, self.height = self.image.size
        self.pixels = self.image.load()

    def sample(self, uv: tuple[float, ...]) -> tuple[float, float, float, float]:
        u = uv[0] % 1.0
        v = uv[1] % 1.0
        x = u * (self.width - 1)
        y = (1.0 - v) * (self.height - 1)
        x0 = int(math.floor(x))
        y0 = int(math.floor(y))
        x1 = min(x0 + 1, self.width - 1)
        y1 = min(y0 + 1, self.height - 1)
        tx = x - x0
        ty = y - y0

        def px(ix: int, iy: int) -> tuple[float, float, float, float]:
            r, g, b, a = self.pixels[ix, iy]
            values = (r / 255.0, g / 255.0, b / 255.0, a / 255.0)
            if self.srgb:
                return (srgb_to_linear(values[0]), srgb_to_linear(values[1]), srgb_to_linear(values[2]), values[3])
            return values

        c00 = px(x0, y0)
        c10 = px(x1, y0)
        c01 = px(x0, y1)
        c11 = px(x1, y1)
        return tuple(
            c00[i] * (1 - tx) * (1 - ty)
            + c10[i] * tx * (1 - ty)
            + c01[i] * (1 - tx) * ty
            + c11[i] * tx * ty
            for i in range(4)
        )


def append_accessor(glb: Glb, values: list[tuple[float, ...]], accessor_type: str) -> int:
    item_size = VEC_SIZES[accessor_type]
    offset = align4(len(glb.bin_chunk))
    glb.bin_chunk += b"\x00" * (offset - len(glb.bin_chunk))
    payload = bytearray()
    for item in values:
        if len(item) != item_size:
            raise RuntimeError(f"Expected {item_size} components, got {len(item)}")
        payload += struct.pack("<" + "f" * item_size, *item)
    glb.bin_chunk += payload
    view_index = len(glb.json_doc.setdefault("bufferViews", []))
    glb.json_doc["bufferViews"].append(
        {
            "buffer": 0,
            "byteOffset": offset,
            "byteLength": len(payload),
            "target": ARRAY_BUFFER,
        }
    )
    accessor_index = len(glb.json_doc.setdefault("accessors", []))
    glb.json_doc["accessors"].append(
        {
            "bufferView": view_index,
            "componentType": COMPONENT_FLOAT,
            "count": len(values),
            "type": accessor_type,
        }
    )
    glb.json_doc["buffers"][0]["byteLength"] = len(glb.bin_chunk)
    return accessor_index


def strip_material_textures(gltf: dict[str, Any], avg_roughness: float, avg_metalness: float) -> None:
    gltf.pop("images", None)
    gltf.pop("textures", None)
    gltf.pop("samplers", None)
    for material in gltf.get("materials", []):
        material.pop("normalTexture", None)
        material.pop("occlusionTexture", None)
        material.pop("emissiveTexture", None)
        pbr = material.setdefault("pbrMetallicRoughness", {})
        pbr.pop("baseColorTexture", None)
        pbr.pop("metallicRoughnessTexture", None)
        pbr["baseColorFactor"] = [1, 1, 1, 1]
        pbr["roughnessFactor"] = max(0.04, min(1.0, avg_roughness))
        pbr["metallicFactor"] = max(0.0, min(1.0, avg_metalness))
        material["doubleSided"] = True
        material["extras"] = {
            **material.get("extras", {}),
            "texturePolicy": "textureless-vertex-pbr",
        }


def bake_character(guid: str) -> dict[str, Any]:
    raw_dir = RAW_ROOT / f"{guid}-textured-rig"
    public_dir = PUBLIC_ROOT / guid
    glb_path = public_dir / "rigged_unity.glb"
    if not raw_dir.exists() or not glb_path.exists():
        raise FileNotFoundError(f"Missing raw/public character assets for {guid}")
    albedo = Sampler(raw_dir / "albedo.png", srgb=True)
    orm_path = raw_dir / "orm.png"
    orm = Sampler(orm_path, srgb=False) if orm_path.exists() else None
    glb = read_glb(glb_path)
    roughness_values: list[float] = []
    metalness_values: list[float] = []
    color_accessors = 0
    vertex_colors = 0

    for mesh in glb.json_doc.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            attributes = primitive.setdefault("attributes", {})
            uv_accessor = attributes.get("TEXCOORD_0")
            position_accessor = attributes.get("POSITION")
            if uv_accessor is None or position_accessor is None:
                continue
            uv_values = accessor_values(glb, uv_accessor)
            vertex_count = glb.json_doc["accessors"][position_accessor]["count"]
            if len(uv_values) != vertex_count:
                raise RuntimeError(f"{guid}: UV count does not match POSITION count")
            colors: list[tuple[float, float, float, float]] = []
            packed_pbr: list[tuple[float, float]] = []
            for uv in uv_values:
                r, g, b, a = albedo.sample(uv)
                if orm:
                    ao, roughness, metalness, _ = orm.sample(uv)
                else:
                    ao, roughness, metalness = 1.0, 0.72, 0.04
                colors.append((r, g, b, max(0.18, min(1.0, ao * a))))
                packed_pbr.append((max(0.04, min(1.0, roughness)), max(0.0, min(1.0, metalness))))
                roughness_values.append(roughness)
                metalness_values.append(metalness)
            attributes["COLOR_0"] = append_accessor(glb, colors, "VEC4")
            attributes["TEXCOORD_1"] = append_accessor(glb, packed_pbr, "VEC2")
            color_accessors += 1
            vertex_colors += len(colors)

    avg_roughness = sum(roughness_values) / max(1, len(roughness_values))
    avg_metalness = sum(metalness_values) / max(1, len(metalness_values))
    strip_material_textures(glb.json_doc, avg_roughness, avg_metalness)
    glb.json_doc.setdefault("asset", {})["generator"] = "UnSoccer textureless character vertex-PBR baker"
    glb.json_doc.setdefault("extras", {})["texturePolicy"] = "textureless-vertex-pbr-no-runtime-images"
    write_glb(glb_path, glb)
    return {
        "guid": guid,
        "bytes": glb_path.stat().st_size,
        "colorAccessors": color_accessors,
        "vertexColors": vertex_colors,
        "avgRoughness": round(avg_roughness, 4),
        "avgMetalness": round(avg_metalness, 4),
    }


def main() -> None:
    roster_path = PUBLIC_ROOT / "roster.json"
    roster = json.loads(roster_path.read_text(encoding="utf-8"))
    results = []
    for asset in roster.get("assets", []):
        guid = str(asset["guid"])
        result = bake_character(guid)
        asset["texturePolicy"] = "baked-textureless-vertex-pbr-no-runtime-images"
        asset["vertexColorAccessors"] = result["colorAccessors"]
        asset["runtimeTextureCount"] = 0
        asset["byteSize"] = result["bytes"]
        results.append(result)
    roster["mode"] = "free3d-local-skinned-baked-textureless-vertex-pbr-fbx-clips-10-character-controller-ik"
    roster["texturePolicy"] = "Runtime character GLBs include baked COLOR_0 and TEXCOORD_1 PBR data and ship zero image textures."
    roster_path.write_text(json.dumps(roster, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
