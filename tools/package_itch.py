#!/usr/bin/env python3
"""Create itch.io HTML5 upload zips for games in this repository."""

from __future__ import annotations

import os
import json
import pathlib
import re
import shutil
import struct
import sys
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
ORBITAL_COURIER = "orbital-courier"
UNSOCCER = "unsoccer"

BLOCKED_PUBLIC_DOC_MARKERS = (
    ".git",
    "ai_chat",
    "skill",
    "designer",
    "programmer",
    "tester",
    "agent",
    "deploy",
)
TEXTURELESS_RUNTIME_ASSET_DIRS = (
    pathlib.Path("assets") / "characters",
    pathlib.Path("assets") / "environment",
    pathlib.Path("assets") / "balls",
    pathlib.Path("assets") / "vehicles",
)
BLOCKED_TEXTURE_FILE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".ktx2",
    ".ktx",
    ".basis",
    ".bmp",
    ".tga",
    ".tif",
    ".tiff",
    ".dds",
    ".hdr",
    ".exr",
}
BLOCKED_TEXTURE_REFERENCE_RE = re.compile(
    rb"\.(png|jpe?g|webp|bmp|tga|tiff?|dds|ktx2?|basis|hdr|exr)\b",
    re.IGNORECASE,
)

GAMES = {
    ORBITAL_COURIER: {
        "root": ROOT / ORBITAL_COURIER,
        "package": DIST / "orbital-courier-itch.zip",
        "include": [
            "orbital-courier/index.html",
            "LICENSE",
            "orbital-courier/src/main.js",
            "orbital-courier/src/styles.css",
            "orbital-courier/vendor/three.module.js",
            "orbital-courier/vendor/three-LICENSE.txt",
        ],
    },
    UNSOCCER: {
        "root": ROOT / "unsoccer" / "client" / "dist",
        "package": DIST / "unsoccer-itch.zip",
        "include_dir": ROOT / "unsoccer" / "client" / "dist",
    },
}


def iter_unsoccer_dist(path: pathlib.Path) -> list[pathlib.Path]:
    if not path.exists():
        raise FileNotFoundError(
            f"{path} is missing; run `npm run build:unsoccer` before packaging"
        )
    prune_unsoccer_unused_character_assets(path)
    assert_unsoccer_textureless_runtime_assets(path)
    return sorted(item for item in path.rglob("*") if item.is_file())


def prune_unsoccer_unused_character_assets(dist_root: pathlib.Path) -> None:
    character_dir = dist_root / "assets" / "characters" / "free3d"
    roster_path = character_dir / "roster.json"
    if not roster_path.exists():
        return
    roster = json.loads(roster_path.read_text(encoding="utf-8"))
    keep = {str(asset.get("guid")) for asset in roster.get("assets", [])}
    for child in character_dir.iterdir():
        if child.is_dir() and child.name not in keep:
            shutil.rmtree(child)


def read_glb_json(path: pathlib.Path) -> dict:
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise RuntimeError(f"{path} is not a GLB file")
    offset = 12
    while offset < len(data):
        length, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk = data[offset : offset + length]
        offset += length
        if chunk_type == b"JSON":
            return json.loads(chunk.decode("utf-8"))
    raise RuntimeError(f"{path} is missing a GLB JSON chunk")


def material_has_texture_reference(material: dict) -> bool:
    pbr = material.get("pbrMetallicRoughness") or {}
    return any(
        (
            pbr.get("baseColorTexture"),
            pbr.get("metallicRoughnessTexture"),
            material.get("normalTexture"),
            material.get("occlusionTexture"),
            material.get("emissiveTexture"),
        )
    )


def glb_vertex_pbr_problems(gltf: dict, relative: str) -> list[str]:
    normalized = f"/{relative}"
    requires_packed_pbr = "/assets/characters/" in normalized or "/assets/vehicles/" in normalized
    problems: set[str] = set()
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            attributes = primitive.get("attributes") or {}
            if "POSITION" not in attributes:
                continue
            if "COLOR_0" not in attributes:
                problems.add("missing-COLOR_0")
            if requires_packed_pbr and "TEXCOORD_1" not in attributes:
                problems.add("missing-TEXCOORD_1")
    return sorted(problems)


def assert_unsoccer_textureless_runtime_assets(dist_root: pathlib.Path) -> None:
    blocked_files: list[str] = []
    textured_fbx_files: list[str] = []
    bad_glbs: list[dict[str, object]] = []
    for relative_root in TEXTURELESS_RUNTIME_ASSET_DIRS:
        root = dist_root / relative_root
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(dist_root).as_posix()
            suffix = path.suffix.lower()
            if suffix in BLOCKED_TEXTURE_FILE_EXTENSIONS:
                blocked_files.append(relative)
            if suffix == ".fbx" and BLOCKED_TEXTURE_REFERENCE_RE.search(path.read_bytes()):
                textured_fbx_files.append(relative)
            if suffix == ".glb":
                gltf = read_glb_json(path)
                vertex_pbr_problems = glb_vertex_pbr_problems(gltf, relative)
                if (
                    gltf.get("images")
                    or gltf.get("textures")
                    or any(material_has_texture_reference(material) for material in gltf.get("materials", []))
                    or vertex_pbr_problems
                ):
                    bad_glbs.append({"file": relative, "vertexPbrProblems": vertex_pbr_problems})
    if blocked_files or textured_fbx_files or bad_glbs:
        raise RuntimeError(
            "UnSoccer runtime 3D assets must be textureless vertex/PBR; "
            f"texture_files={blocked_files}; textured_fbx={textured_fbx_files}; textured_glbs={bad_glbs}"
        )


def write_file(archive: zipfile.ZipFile, source: pathlib.Path, root: pathlib.Path) -> None:
    archive_name = source.relative_to(root)
    archive.write(source, str(archive_name))


def main() -> None:
    game_name = sys.argv[1] if len(sys.argv) > 1 else ORBITAL_COURIER
    if game_name not in GAMES:
        known = ", ".join(sorted(GAMES))
        raise SystemExit(f"unknown game {game_name!r}; expected one of: {known}")

    config = GAMES[game_name]
    game_root = config["root"]
    package = config["package"]
    DIST.mkdir(exist_ok=True)
    if package.exists():
        package.unlink()

    with zipfile.ZipFile(package, "w", zipfile.ZIP_DEFLATED) as archive:
        if game_name == ORBITAL_COURIER:
            for relative in config["include"]:
                path = ROOT / relative
                if not path.exists():
                    raise FileNotFoundError(path)
                try:
                    archive_name = path.relative_to(game_root)
                except ValueError:
                    archive_name = pathlib.Path(relative)
                archive.write(path, str(archive_name))
        else:
            for path in iter_unsoccer_dist(config["include_dir"]):
                write_file(archive, path, game_root)

    with zipfile.ZipFile(package) as archive:
        names = set(archive.namelist())
        if "index.html" not in names:
            raise RuntimeError("index.html is missing from archive root")
        blocked = sorted(
            name
            for name in names
            if name.lower().endswith(".md")
            or any(marker in name.lower() for marker in BLOCKED_PUBLIC_DOC_MARKERS)
        )
        if blocked:
            raise RuntimeError(f"internal files leaked into itch package: {blocked}")

    size_kb = os.path.getsize(package) / 1024
    print(f"wrote {package} ({size_kb:.1f} KiB)")


if __name__ == "__main__":
    main()
