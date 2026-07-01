# itch_games Skill

Use this root skill when changing, packaging, validating, or publishing the
`/itch_games` browser game repository.

## Hierarchy

- Root skill: `skill.md`
- Machine map: `skill.xml`
- Directory skill: `itch_games.skill.md`
- Art director skill: `art_director_skill.md`
- Art director workspace: `art_director/art_director.skill.md`
- Runtime entry: `index.html`
- Game code: `src/main.js`
- Styles: `src/styles.css`
- Itch package helper: `tools/package_itch.py`

## Rules

- Keep the game static and HTML5-compatible for itch.io.
- Keep `index.html` at the zip root.
- Use game release versions in the `v0.0.001` sequence and bump every behavior
  change.
- Render the current game release version visibly in the bottom-left corner.
- Keep `package.json.gameVersion`, the UI version badge, and docs synchronized.
- Keep `package.json.version` npm-compatible while `gameVersion` stores the
  canonical displayed game release.
- Do not commit generated files under `dist/`.
- Test through a local static server before upload.
- Treat GitHub `eschota/itch_games` as the public source repository.
- Version bumps must be committed, pushed to GitHub, and autodeployed.
- Use `art_director_skill.md` for art direction, visual quality, 3D, animation,
  VFX, lighting, rendering, screenshots, trailers, and audio-visual mood work.
- Put Art Director working artifacts that are not runtime code and not final
  shipped assets under `art_director/`.

## Current Behavior

- Current game release: `v0.0.002`.
- The game starts automatically when the page opens.
- `Space` restarts after game over; mouse/touch `Start` remains available on
  the end overlay.
- Pointer and touch movement are handled on the canvas so overlay controls are
  not intercepted by gameplay input capture inside itch.io iframes.

## Transport

The production working copy lives on the Moscow server at `/itch_games`.
Use SSH alias `freestock-moscow` for server transport and validation.
