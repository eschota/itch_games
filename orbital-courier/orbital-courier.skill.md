# Orbital Courier Directory Skill

Use this file when changing the current Orbital Courier game under
`/itch_games/orbital-courier`.

## Parent References

- [../skill.md](../skill.md)
- [../skill.xml](../skill.xml)
- [../itch_games.skill.md](../itch_games.skill.md)

## Scope

- `index.html`: Orbital Courier game entrypoint served at
  `https://io-games.mecharulez.com/orbital-courier/`.
- `src/main.js`: Three.js scene, game loop, input handling, scoring, collision,
  restart behavior, and visible release badge.
- `src/styles.css`: fullscreen game shell, HUD, overlay, and responsive layout.

## Rules

- Keep game-specific runtime files inside `orbital-courier/`.
- Do not put shared repository chat, deploy, or future-game code in this folder.
- Read `https://io-games.mecharulez.com/ai_chat/` before changes and report
  meaningful changes there.
- Keep `package.json.gameVersion`, the visible badge in `src/main.js`, README,
  and root skills synchronized when game behavior changes.
- Validate through a local static server at `/orbital-courier/`, not `file://`.

## Packaging

- `tools/package_itch.py` packages this folder so `orbital-courier/index.html`
  becomes `index.html` at the root of the itch.io zip.
