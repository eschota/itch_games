#!/usr/bin/env python3
"""Create itch.io HTML5 upload zips for games in this repository."""

from __future__ import annotations

import os
import pathlib
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
    return sorted(item for item in path.rglob("*") if item.is_file())


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
