#!/usr/bin/env python3
"""Remove texture/video references from binary FBX animation clips.

UnSoccer ships character animations as FBX clips, but runtime assets must not
contain or request image textures. The source FBX clips exported from Blender can
still carry stale Texture/Video object nodes that point to PNG files even when
the game only needs animation curves. This strips those nodes and their
connections while preserving the animation data.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import struct
from dataclasses import dataclass, field
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_ROOT = ROOT / "unsoccer" / "client" / "public" / "assets" / "characters" / "free3d"
FBX_HEADER = b"Kaydara FBX Binary  \x00\x1a\x00"
IMAGE_REF_RE = re.compile(rb"\.(png|jpe?g|webp|bmp|tga|tiff?|dds|ktx2?|basis|hdr|exr)\b", re.IGNORECASE)


@dataclass
class Property:
    raw: bytes
    type_code: str
    value: Any = None


@dataclass
class Node:
    name: str
    properties: list[Property]
    children: list["Node"] = field(default_factory=list)
    has_child_block: bool = False


class FbxParseError(RuntimeError):
    pass


def null_record_length(version: int) -> int:
    return 25 if version >= 7500 else 13


def parse_property(data: bytes, offset: int) -> tuple[Property, int]:
    start = offset
    type_code = chr(data[offset])
    offset += 1
    value: Any = None
    if type_code == "Y":
        value = struct.unpack_from("<h", data, offset)[0]
        offset += 2
    elif type_code == "C":
        value = bool(data[offset])
        offset += 1
    elif type_code == "I":
        value = struct.unpack_from("<i", data, offset)[0]
        offset += 4
    elif type_code == "F":
        value = struct.unpack_from("<f", data, offset)[0]
        offset += 4
    elif type_code == "D":
        value = struct.unpack_from("<d", data, offset)[0]
        offset += 8
    elif type_code == "L":
        value = struct.unpack_from("<q", data, offset)[0]
        offset += 8
    elif type_code in {"S", "R"}:
        length = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        raw_value = data[offset : offset + length]
        offset += length
        value = raw_value.decode("utf-8", errors="ignore") if type_code == "S" else raw_value
    elif type_code in {"f", "d", "l", "i", "b", "c"}:
        _array_length, _encoding, compressed_length = struct.unpack_from("<III", data, offset)
        offset += 12 + compressed_length
    else:
        raise FbxParseError(f"Unsupported FBX property type {type_code!r} at {start}")
    return Property(raw=data[start:offset], type_code=type_code, value=value), offset


def parse_node(data: bytes, offset: int, version: int) -> tuple[Node | None, int]:
    record_size = null_record_length(version)
    if offset + record_size > len(data):
        return None, len(data)
    if version >= 7500:
        end_offset, prop_count, _prop_len = struct.unpack_from("<QQQ", data, offset)
        name_len_offset = offset + 24
        offset += 25
    else:
        end_offset, prop_count, _prop_len = struct.unpack_from("<III", data, offset)
        name_len_offset = offset + 12
        offset += 13
    name_length = data[name_len_offset]
    if end_offset == 0 and prop_count == 0 and name_length == 0:
        return None, offset
    name = data[offset : offset + name_length].decode("utf-8", errors="ignore")
    offset += name_length

    properties: list[Property] = []
    for _ in range(prop_count):
        prop, offset = parse_property(data, offset)
        properties.append(prop)

    children: list[Node] = []
    has_child_block = False
    while offset < end_offset:
        child, next_offset = parse_node(data, offset, version)
        offset = next_offset
        if child is None:
            has_child_block = True
            break
        children.append(child)
    return Node(name=name, properties=properties, children=children, has_child_block=has_child_block), end_offset


def read_fbx(path: pathlib.Path) -> tuple[bytes, int, list[Node]]:
    data = path.read_bytes()
    if not data.startswith(FBX_HEADER):
        raise FbxParseError(f"{path} is not a binary FBX")
    version = struct.unpack_from("<I", data, 23)[0]
    offset = 27
    nodes: list[Node] = []
    while offset < len(data):
        node, next_offset = parse_node(data, offset, version)
        offset = next_offset
        if node is None:
            break
        nodes.append(node)
    return data[:27], version, nodes


def first_int64(node: Node) -> int | None:
    if not node.properties:
        return None
    prop = node.properties[0]
    return int(prop.value) if prop.type_code == "L" else None


def collect_texture_object_ids(nodes: list[Node], removed: set[int]) -> None:
    for node in nodes:
        object_id = first_int64(node)
        if node.name in {"Texture", "Video"} and object_id is not None:
            removed.add(object_id)
        collect_texture_object_ids(node.children, removed)


def connection_references_removed_id(node: Node, removed: set[int]) -> bool:
    if node.name != "C":
        return False
    return any(prop.type_code == "L" and int(prop.value) in removed for prop in node.properties)


def strip_nodes(nodes: list[Node], removed: set[int]) -> tuple[list[Node], int]:
    stripped: list[Node] = []
    count = 0
    for node in nodes:
        object_id = first_int64(node)
        if node.name in {"Texture", "Video"} and object_id in removed:
            count += 1
            continue
        if connection_references_removed_id(node, removed):
            count += 1
            continue
        node.children, child_count = strip_nodes(node.children, removed)
        count += child_count
        stripped.append(node)
    return stripped, count


def build_node(node: Node, start_offset: int, version: int) -> bytes:
    name = node.name.encode("utf-8")
    properties = b"".join(prop.raw for prop in node.properties)
    record_size = null_record_length(version)
    header_size = 25 if version >= 7500 else 13
    cursor = start_offset + header_size + len(name) + len(properties)
    children = bytearray()
    for child in node.children:
        child_bytes = build_node(child, cursor + len(children), version)
        children += child_bytes
    if node.children or node.has_child_block:
        children += b"\x00" * record_size
    end_offset = cursor + len(children)
    if version >= 7500:
        header = struct.pack("<QQQB", end_offset, len(node.properties), len(properties), len(name))
    else:
        header = struct.pack("<IIIB", end_offset, len(node.properties), len(properties), len(name))
    return header + name + properties + bytes(children)


def write_fbx(path: pathlib.Path, header: bytes, version: int, nodes: list[Node]) -> None:
    output = bytearray(header)
    cursor = len(output)
    for node in nodes:
        node_bytes = build_node(node, cursor, version)
        output += node_bytes
        cursor += len(node_bytes)
    output += b"\x00" * null_record_length(version)
    path.write_bytes(output)


def strip_file(path: pathlib.Path, dry_run: bool = False) -> dict[str, Any]:
    path = path.resolve()
    before = path.read_bytes()
    header, version, nodes = read_fbx(path)
    removed_ids: set[int] = set()
    collect_texture_object_ids(nodes, removed_ids)
    stripped_nodes, removed_nodes = strip_nodes(nodes, removed_ids)
    if dry_run:
        after = before
    else:
        write_fbx(path, header, version, stripped_nodes)
        after = path.read_bytes()
    return {
        "file": str(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path),
        "version": version,
        "removedTextureVideoIds": len(removed_ids),
        "removedNodes": removed_nodes,
        "bytesBefore": len(before),
        "bytesAfter": len(after),
        "imageRefsBefore": len(IMAGE_REF_RE.findall(before)),
        "imageRefsAfter": len(IMAGE_REF_RE.findall(after)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="*", type=pathlib.Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    paths = args.paths or sorted(DEFAULT_ROOT.rglob("*.fbx"))
    results = [strip_file(path, dry_run=args.dry_run) for path in paths]
    print(json.dumps(results, indent=2))
    failures = [entry for entry in results if entry["imageRefsAfter"]]
    if failures:
        raise SystemExit(f"FBX texture references remain: {failures}")


if __name__ == "__main__":
    main()
