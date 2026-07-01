# itch_games Skill

Use this root skill when changing, packaging, validating, or publishing the
`/itch_games` browser game repository.

## Hierarchy

- Root skill: `skill.md`
- Machine map: `skill.xml`
- Directory skill: `itch_games.skill.md`
- Runtime entry: `index.html`
- Game code: `src/main.js`
- Styles: `src/styles.css`
- Itch package helper: `tools/package_itch.py`

## Rules

- Keep the game static and HTML5-compatible for itch.io.
- Keep `index.html` at the zip root.
- Do not commit generated files under `dist/`.
- Test through a local static server before upload.
- Treat GitHub `eschota/itch_games` as the public source repository.

## Transport

The production working copy lives on the Moscow server at `/itch_games`.
Use SSH alias `freestock-moscow` for server transport and validation.
