# itch_games Directory Skill

Use this file for work inside `/itch_games`.

## Parent References

- [skill.md](skill.md)
- [skill.xml](skill.xml)

## Structure

- `index.html`: itch.io HTML5 entrypoint.
- `src/main.js`: Three.js game loop and input handling.
- `src/styles.css`: fullscreen game shell and HUD styling.
- `tools/package_itch.py`: creates the upload zip in `dist/`.

## Validation

1. Run `python3 -m http.server 8000`.
2. Open the game from a browser, not directly from `file://`.
3. Confirm the scene renders, controls move the courier, score changes, and no
   console errors are present.
4. Run `python3 tools/package_itch.py`.
5. Confirm `dist/orbital-courier-itch.zip` contains `index.html` at archive root.
