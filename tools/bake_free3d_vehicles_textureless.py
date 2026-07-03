"""Bake Free3D vehicle GLBs into local textureless vertex-PBR runtime assets."""

from __future__ import annotations

import argparse
import io
import json
import math
import pathlib
import re
import struct
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from PIL import Image


ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_RAW_ROOT = ROOT / ".codex_tmp" / "free3d_vehicle_raw"
PUBLIC_ROOT = ROOT / "unsoccer" / "client" / "public" / "assets" / "vehicles" / "free3d"
PROVENANCE_PATH = ROOT / "unsoccer" / "assets" / "models" / "vehicles" / "free3d" / "provenance.json"
LODS = ("10k", "1k")

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

VEHICLE_SOURCES: list[dict[str, Any]] = [
    {
        "guid": "6449614",
        "kind": "emerald-hypercar",
        "vehicleKind": "car",
        "title": "Emerald Hypercar model pack",
        "source": "https://free3d.online/model/6449614-emerald-hypercar-model-pack",
        "inventoryUrl": "https://worker-0001.free3d.online/storage/6449614_Emerald Hypercar model pack/paths.json",
        "scale": 4.6,
        "collider": {"halfWidth": 0.98, "halfLength": 2.05},
        "seatOffset": {"x": 0, "y": 0.95, "z": 0.1},
        "drive": "sport",
    },
    {
        "guid": "6451005",
        "kind": "silver-sports-car",
        "vehicleKind": "car",
        "title": "Sleek Silver Sports Car model pack",
        "source": "https://free3d.online/model/6451005-sleek-silver-sports-car-model-pack",
        "inventoryUrl": "https://worker-0001.free3d.online/storage/6451005_Sleek Silver Sports Car model pack/paths.json",
        "scale": 4.5,
        "collider": {"halfWidth": 0.96, "halfLength": 2.0},
        "seatOffset": {"x": 0, "y": 0.92, "z": 0.05},
        "drive": "sport",
    },
    {
        "guid": "6448105",
        "kind": "red-sports-car",
        "vehicleKind": "car",
        "title": "Sleek Red Sports Car model pack",
        "source": "https://free3d.online/model/6448105-sleek-red-sports-car-model-pack",
        "inventoryUrl": "https://worker-0001.free3d.online/storage/6448105_Sleek Red Sports Car model pack/paths.json",
        "scale": 4.5,
        "yawOffsetDeg": -90,
        "collider": {"halfWidth": 0.96, "halfLength": 2.0},
        "seatOffset": {"x": 0, "y": 0.92, "z": 0.05},
        "drive": "sport",
    },
    {
        "guid": "6451668",
        "kind": "urban-sports-car",
        "vehicleKind": "car",
        "title": "Sleek Urban Sports Car model pack",
        "source": "https://free3d.online/model/6451668-sleek-urban-sports-car-model-pack",
        "inventoryUrl": "https://worker-0001.free3d.online/storage/6451668_Sleek Urban Sports Car model pack/paths.json",
        "scale": 4.55,
        "yawOffsetDeg": -90,
        "collider": {"halfWidth": 0.98, "halfLength": 2.02},
        "seatOffset": {"x": 0, "y": 0.94, "z": 0.05},
        "drive": "balanced",
    },
    {
        "guid": "6451894",
        "kind": "silver-concept-car",
        "vehicleKind": "car",
        "title": "Futuristic Silver Car model pack",
        "source": "https://free3d.online/model/6451894-futuristic-silver-car-model-pack",
        "inventoryUrl": "https://worker-0001.free3d.online/storage/6451894_Futuristic Silver Car model pack/paths.json",
        "scale": 4.6,
        "yawOffsetDeg": -90,
        "collider": {"halfWidth": 1.0, "halfLength": 2.06},
        "seatOffset": {"x": 0, "y": 0.96, "z": 0.08},
        "drive": "balanced",
    },
    {
        "guid": "5885560",
        "kind": "steampunk-tractor",
        "vehicleKind": "tractor",
        "title": "Steampunk Tractor with Ornate Brass Details",
        "source": "https://free3d.online/model/5885560-steampunk-tractor-with-ornate-brass-details",
        "inventoryUrl": "https://worker-0001.free3d.online/storage/5885560_Steampunk Tractor with Ornate Brass Details/paths.json",
        "scale": 4.35,
        "collider": {"halfWidth": 1.12, "halfLength": 1.9},
        "seatOffset": {"x": 0, "y": 1.1, "z": -0.05},
        "drive": "tractor",
    },
    {
        "guid": "6512341",
        "kind": "camouflage-tank",
        "vehicleKind": "tank",
        "title": "Camouflage Tank model pack",
        "source": "https://free3d.online/model/6512341-camouflage-tank-model-pack",
        "inventoryUrl": "https://worker-0001.free3d.online/storage/6512341_Camouflage Tank model pack/paths.json",
        "scale": 5.5,
        "yawOffsetDeg": -90,
        "collider": {"halfWidth": 1.32, "halfLength": 2.36},
        "seatOffset": {"x": 0, "y": 1.28, "z": -0.15},
        "drive": "tank",
    },
]


@dataclass
class Glb:
    json_doc: dict[str, Any]
    bin_chunk: bytearray


class EmbeddedSampler:
    def __init__(self, glb: Glb, image_index: int, srgb: bool) -> None:
        image = glb.json_doc.get("images", [])[image_index]
        view = glb.json_doc["bufferViews"][image["bufferView"]]
        offset = int(view.get("byteOffset", 0))
        length = int(view.get("byteLength", 0))
        self.image = Image.open(io.BytesIO(bytes(glb.bin_chunk[offset:offset + length]))).convert("RGBA")
        self.srgb = srgb
        self.width, self.height = self.image.size
        self.pixels = self.image.load()

    def sample(self, uv: tuple[float, ...]) -> tuple[float, float, float, float]:
        u = uv[0] % 1.0
        v = uv[1] % 1.0
        x = u * (self.width - 1)
        y = v * (self.height - 1)
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


def align4(value: int) -> int:
    return (value + 3) & ~3


def srgb_to_linear(value: float) -> float:
    if value <= 0.04045:
        return value / 12.92
    return ((value + 0.055) / 1.055) ** 2.4


def clamp01(value: float) -> float:
    return min(1.0, max(0.0, value if math.isfinite(value) else 0.0))


def clean_url(url: str) -> str:
    parts = urllib.parse.urlsplit(url)
    path = urllib.parse.quote(urllib.parse.unquote(parts.path), safe="/")
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))


def read_remote_json(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(clean_url(url), timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def remote_file_url(inventory_url: str, relative_path: str) -> str:
    parts = urllib.parse.urlsplit(clean_url(inventory_url))
    base_path = parts.path.rsplit("/", 1)[0]
    path = f"{base_path}/{urllib.parse.quote(relative_path, safe='/')}"
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, path, "", ""))


def download_if_missing(url: str, path: pathlib.Path, force: bool = False) -> None:
    if not force and path.exists() and path.stat().st_size > 0:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(clean_url(url), timeout=180) as response:
        path.write_bytes(response.read())


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
        chunk = data[offset: offset + length]
        offset += length
        if chunk_type == b"JSON":
            json_doc = json.loads(chunk.decode("utf-8"))
        elif chunk_type == b"BIN\x00":
            bin_chunk = bytearray(chunk)
    if json_doc is None:
        raise RuntimeError(f"{path} is missing JSON chunk")
    return Glb(json_doc=json_doc, bin_chunk=bin_chunk)


def write_glb(path: pathlib.Path, glb: Glb) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
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


def image_sampler(glb: Glb, texture_info: dict[str, Any] | None, srgb: bool) -> EmbeddedSampler | None:
    if not texture_info:
        return None
    textures = glb.json_doc.get("textures", [])
    texture_index = texture_info.get("index")
    if not isinstance(texture_index, int) or texture_index < 0 or texture_index >= len(textures):
        return None
    source_index = textures[texture_index].get("source")
    if not isinstance(source_index, int):
        return None
    try:
        return EmbeddedSampler(glb, source_index, srgb)
    except Exception as error:
        print(f"warning: could not read embedded texture {source_index}: {error}")
        return None


def material_base_color(material: dict[str, Any] | None) -> tuple[float, float, float, float]:
    pbr = (material or {}).get("pbrMetallicRoughness", {})
    factor = pbr.get("baseColorFactor", [1, 1, 1, 1])
    values = [float(factor[i]) if i < len(factor) else 1.0 for i in range(4)]
    return (clamp01(values[0]), clamp01(values[1]), clamp01(values[2]), clamp01(values[3]))


def material_pbr_factor(material: dict[str, Any] | None, key: str, fallback: float) -> float:
    pbr = (material or {}).get("pbrMetallicRoughness", {})
    return clamp01(float(pbr.get(key, fallback)))


def bake_glb(source_path: pathlib.Path, output_path: pathlib.Path, source: dict[str, Any], lod: str) -> dict[str, Any]:
    glb = read_glb(source_path)
    materials = glb.json_doc.get("materials", [])
    roughness_values: list[float] = []
    metalness_values: list[float] = []
    vertex_count_total = 0
    color_accessors = 0
    triangle_count = 0

    for mesh in glb.json_doc.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            attributes = primitive.setdefault("attributes", {})
            position_accessor = attributes.get("POSITION")
            if position_accessor is None:
                continue
            vertex_count = glb.json_doc["accessors"][position_accessor]["count"]
            vertex_count_total += vertex_count
            indices_accessor = primitive.get("indices")
            if indices_accessor is not None:
                triangle_count += glb.json_doc["accessors"][indices_accessor]["count"] // 3
            else:
                triangle_count += vertex_count // 3

            uv_values = accessor_values(glb, attributes["TEXCOORD_0"]) if attributes.get("TEXCOORD_0") is not None else []
            material_index = primitive.get("material")
            material = materials[material_index] if isinstance(material_index, int) and material_index < len(materials) else None
            pbr = (material or {}).get("pbrMetallicRoughness", {})
            base_factor = material_base_color(material)
            roughness_factor = material_pbr_factor(material, "roughnessFactor", 0.78)
            metalness_factor = material_pbr_factor(material, "metallicFactor", 0.04)
            albedo_sampler = image_sampler(glb, pbr.get("baseColorTexture"), srgb=True)
            packed_sampler = image_sampler(glb, pbr.get("metallicRoughnessTexture"), srgb=False)

            colors: list[tuple[float, float, float, float]] = []
            packed_pbr: list[tuple[float, float]] = []
            for index in range(vertex_count):
                uv = uv_values[index] if index < len(uv_values) else (0.5, 0.5)
                if albedo_sampler:
                    r, g, b, a = albedo_sampler.sample(uv)
                    color = (
                        clamp01(r * base_factor[0]),
                        clamp01(g * base_factor[1]),
                        clamp01(b * base_factor[2]),
                        max(0.18, clamp01(a * base_factor[3])),
                    )
                else:
                    color = base_factor
                if packed_sampler:
                    mr = packed_sampler.sample(uv)
                    roughness = clamp01(mr[1] * roughness_factor)
                    metalness = clamp01(mr[2] * metalness_factor)
                else:
                    roughness = roughness_factor
                    metalness = metalness_factor
                colors.append(color)
                packed_pbr.append((max(0.04, roughness), metalness))
                roughness_values.append(roughness)
                metalness_values.append(metalness)
            attributes["COLOR_0"] = append_accessor(glb, colors, "VEC4")
            attributes["TEXCOORD_1"] = append_accessor(glb, packed_pbr, "VEC2")
            color_accessors += 1

    avg_roughness = sum(roughness_values) / max(1, len(roughness_values))
    avg_metalness = sum(metalness_values) / max(1, len(metalness_values))
    strip_material_textures(glb.json_doc, avg_roughness, avg_metalness)
    glb.json_doc.setdefault("asset", {})["generator"] = "UnSoccer textureless vehicle vertex-PBR baker"
    glb.json_doc.setdefault("extras", {})["texturePolicy"] = "textureless-vehicle-vertex-pbr-no-runtime-images"
    glb.json_doc["extras"]["free3dGuid"] = source["guid"]
    glb.json_doc["extras"]["vehicleKind"] = source["vehicleKind"]
    glb.json_doc["extras"]["vehicleLod"] = lod
    compact_binary(glb)
    write_glb(output_path, glb)
    return {
        "lod": lod,
        "src": output_path.relative_to(ROOT / "unsoccer" / "client" / "public").as_posix(),
        "bytes": output_path.stat().st_size,
        "triangles": triangle_count,
        "vertices": vertex_count_total,
        "colorAccessors": color_accessors,
        "avgRoughness": round(avg_roughness, 4),
        "avgMetalness": round(avg_metalness, 4),
    }


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


def compact_binary(glb: Glb) -> None:
    buffer_views = glb.json_doc.get("bufferViews", [])
    used_view_indices = {
        int(accessor["bufferView"])
        for accessor in glb.json_doc.get("accessors", [])
        if isinstance(accessor.get("bufferView"), int)
    }
    new_bin = bytearray()
    view_mapping: dict[int, int] = {}
    new_views: list[dict[str, Any]] = []
    for old_index, view in enumerate(buffer_views):
        if old_index not in used_view_indices:
            continue
        offset = align4(len(new_bin))
        new_bin += b"\x00" * (offset - len(new_bin))
        old_offset = int(view.get("byteOffset", 0))
        length = int(view.get("byteLength", 0))
        new_view = {key: value for key, value in view.items() if key not in {"byteOffset", "byteLength"}}
        new_view["byteOffset"] = offset
        new_view["byteLength"] = length
        new_bin += glb.bin_chunk[old_offset:old_offset + length]
        view_mapping[old_index] = len(new_views)
        new_views.append(new_view)
    for accessor in glb.json_doc.get("accessors", []):
        if isinstance(accessor.get("bufferView"), int):
            accessor["bufferView"] = view_mapping[int(accessor["bufferView"])]
    glb.json_doc["bufferViews"] = new_views
    glb.bin_chunk = new_bin
    glb.json_doc["buffers"] = [{"byteLength": len(glb.bin_chunk)}]


def pick_lod_glb(inventory: dict[str, Any], guid: str, lod: str) -> str:
    paths = [str(path) for path in inventory.get("paths", [])]
    folder_patterns = {
        "10k": [rf"uploads_files_{re.escape(guid)}_10k/", rf"uploads_files_{re.escape(guid)}_middlepoly/"],
        "1k": [rf"uploads_files_{re.escape(guid)}_1k/", rf"uploads_files_{re.escape(guid)}_lowpoly/"],
    }
    candidates = [
        path for path in paths
        if path.lower().endswith(".glb")
        and any(re.search(pattern, path.lower()) for pattern in folder_patterns.get(lod, []))
    ]
    if not candidates:
        raise FileNotFoundError(f"{guid}: missing {lod} GLB in inventory")
    candidates.sort(key=lambda path: (0 if "preview" in path.lower() else 1, len(path), path))
    return candidates[0]


def bake_source(source: dict[str, Any], force: bool, raw_root: pathlib.Path) -> dict[str, Any]:
    inventory = read_remote_json(source["inventoryUrl"])
    raw_dir = raw_root / source["guid"]
    public_entries: dict[str, dict[str, Any]] = {}
    remote_paths: dict[str, str] = {}
    for lod in LODS:
        remote_path = pick_lod_glb(inventory, source["guid"], lod)
        remote_paths[lod] = remote_path
        raw_path = raw_dir / f"{lod}.glb"
        download_if_missing(remote_file_url(source["inventoryUrl"], remote_path), raw_path, force=force)
        out_path = PUBLIC_ROOT / f"{source['guid']}-{source['kind']}-{lod}.glb"
        public_entries[lod] = bake_glb(raw_path, out_path, source, lod)

    return {
        "guid": source["guid"],
        "kind": source["kind"],
        "vehicleKind": source["vehicleKind"],
        "title": source["title"],
        "source": source["source"],
        "inventoryUrl": source["inventoryUrl"],
        "src10k": public_entries["10k"]["src"],
        "src1k": public_entries["1k"]["src"],
        "scale": source["scale"],
        "yawOffsetDeg": source.get("yawOffsetDeg", 0),
        "collider": source["collider"],
        "seatOffset": source["seatOffset"],
        "drive": source["drive"],
        "lods": public_entries,
        "remotePaths": remote_paths,
        "texturePolicy": "textureless-vertex-pbr-no-runtime-images",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Re-download source GLBs before baking.")
    parser.add_argument(
        "--raw-root",
        type=pathlib.Path,
        default=DEFAULT_RAW_ROOT,
        help="Download cache for original textured Free3D GLBs. Defaults outside tracked project assets.",
    )
    args = parser.parse_args()

    PUBLIC_ROOT.mkdir(parents=True, exist_ok=True)
    raw_root = args.raw_root.resolve()
    baked = [bake_source(source, force=args.force, raw_root=raw_root) for source in VEHICLE_SOURCES]
    roster = {
        "version": "v0.0.055",
        "mode": "free3d-local-textureless-vehicle-vertex-pbr-glb",
        "source": "https://free3d.online/api-embeddings/",
        "assets": [
            {key: value for key, value in asset.items() if key not in {"remotePaths"}}
            for asset in baked
        ],
        "texturePolicy": "Runtime vehicle GLBs include baked COLOR_0 and TEXCOORD_1 PBR data and ship zero image textures.",
    }
    (PUBLIC_ROOT / "roster.json").write_text(json.dumps(roster, indent=2) + "\n", encoding="utf-8")
    PROVENANCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    PROVENANCE_PATH.write_text(
        json.dumps(
            {
                "version": "v0.0.055",
                "runtimeRoster": "unsoccer/client/public/assets/vehicles/free3d/roster.json",
                "source": {
                    "apiSearch": "https://free3d.online/api-embeddings/",
                    "note": "Vehicle GLBs were resolved from public Free3D worker paths.json inventories and shipped locally as textureless vertex-PBR runtime assets.",
                },
                "assets": baked,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"assets": len(baked), "roster": str(PUBLIC_ROOT / "roster.json")}, indent=2))


if __name__ == "__main__":
    main()
