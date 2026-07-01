# Orbital Courier

Orbital Courier is a tiny browser game built with Three.js for itch.io HTML5 upload.

## Play

- Move with `A`/`D`, arrow keys, pointer drag, or touch drag.
- Collect cyan energy cores.
- Avoid red debris.
- Press `Space` to start or restart.

## Local Run

```bash
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000/`.

## Build Itch Package

```bash
python3 tools/package_itch.py
```

The upload artifact is written to `dist/orbital-courier-itch.zip`. The zip keeps
`index.html` at the archive root, which is required for itch.io HTML5 games.

## Repository Skill Map

- `skill.md`: root project operating notes.
- `skill.xml`: machine-readable project hierarchy.
- `itch_games.skill.md`: directory-level skill entry for this repo.
