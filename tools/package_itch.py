#!/usr/bin/env python3
"""Create the itch.io HTML5 upload zip for Orbital Courier."""

from __future__ import annotations

import os
import pathlib
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
PACKAGE = DIST / "orbital-courier-itch.zip"
INCLUDE = [
    "index.html",
    "README.md",
    "LICENSE",
    "skill.md",
    "skill.xml",
    "itch_games.skill.md",
    "art_director_skill.md",
    "art_director/art_director.skill.md",
    "ui_designer_skill.md",
    "ui_designer/ui_designer.skill.md",
    "game_designer_skill.md",
    "game_designer/game_designer.skill.md",
    "programmer_skill.md",
    "programmer/programmer.skill.md",
    "tester_skill.md",
    "tester/tester.skill.md",
    "sound_designer_skill.md",
    "sound_designer/sound_designer.skill.md",
    "ai_chat_skill.md",
    "ai_chat/ai_chat.skill.md",
    "src/main.js",
    "src/styles.css",
]


def main() -> None:
    DIST.mkdir(exist_ok=True)
    if PACKAGE.exists():
        PACKAGE.unlink()

    with zipfile.ZipFile(PACKAGE, "w", zipfile.ZIP_DEFLATED) as archive:
        for relative in INCLUDE:
            path = ROOT / relative
            if not path.exists():
                raise FileNotFoundError(path)
            archive.write(path, relative)

    with zipfile.ZipFile(PACKAGE) as archive:
        names = set(archive.namelist())
        if "index.html" not in names:
            raise RuntimeError("index.html is missing from archive root")

    size_kb = os.path.getsize(PACKAGE) / 1024
    print(f"wrote {PACKAGE} ({size_kb:.1f} KiB)")


if __name__ == "__main__":
    main()
