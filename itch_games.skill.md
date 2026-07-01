# itch_games Directory Skill

Use this file for work inside `/itch_games`.

## Parent References

- [skill.md](skill.md)
- [skill.xml](skill.xml)
- [art_director_skill.md](art_director_skill.md)

## Structure

- `index.html`: itch.io HTML5 entrypoint.
- `src/main.js`: Three.js game loop and input handling.
- `src/styles.css`: fullscreen game shell and HUD styling.
- `tools/package_itch.py`: creates the upload zip in `dist/`.
- `art_director/`: non-runtime Art Director workspace for audits, checks,
  references, briefs, prompts, temp documents, and QA evidence.

## Art Direction

- Use `art_director_skill.md` for visual quality, 3D art direction, animation,
  VFX, lighting, screenshots, trailers, UI visual fit, and audio-visual mood.
- Keep Art Director working files under `art_director/` unless they are
  deliberately promoted into runtime code or final game assets.

## Versioning

- Current release: `v0.0.002`.
- Game releases start at `v0.0.001` and every behavior change increments the
  version.
- The visible bottom-left badge, `package.json.gameVersion`, README, and skill
  docs must stay synchronized.
- Version bumps are committed, pushed to GitHub, and autodeployed.

## Validation

1. Run `python3 -m http.server 8000`.
2. Open the game from a browser, not directly from `file://`.
3. Confirm the scene auto-starts on load and the bottom-left version badge shows
   the current release.
4. Confirm mouse/touch drag on the canvas moves the courier, `A`/`D` or arrow
   keys still work, and `Space` plus the overlay `Start` button can restart
   after game over.
5. Run `python3 tools/package_itch.py`.
6. Confirm `dist/orbital-courier-itch.zip` contains `index.html` at archive root.
