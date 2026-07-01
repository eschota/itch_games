# Orbital Courier

Orbital Courier is a tiny browser game built with Three.js for itch.io HTML5 upload.

## Play

- Move with `A`/`D`, arrow keys, pointer drag, or touch drag.
- Collect cyan energy cores.
- Avoid red debris.
- The run starts automatically when the page opens.
- Press `Space` or click/tap `Start` after a run ends to restart.

## Version

Current game release: `v0.0.002`.

Game releases use `v0.0.001`-style semantic project versioning. The already
published first build is treated as `v0.0.001`; this auto-start and input fix is
`v0.0.002`. The game renders the release version in the bottom-left corner.

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

## Versioning Rule

Every created game starts at `v0.0.001`. Every shipped change increments the
version, the current version must be visible in the bottom-left corner of the
game, and each version bump is expected to be committed, pushed to GitHub, and
autodeployed.
