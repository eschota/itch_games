# itch_games Skill

Use this root skill when changing, packaging, validating, or publishing the
`/itch_games` browser game repository.

## Hierarchy

- Root skill: `skill.md`
- Machine map: `skill.xml`
- Directory skill: `itch_games.skill.md`
- Art director skill: `art_director_skill.md`
- Art director workspace: `art_director/art_director.skill.md`
- UI designer skill: `ui_designer_skill.md`
- UI designer workspace: `ui_designer/ui_designer.skill.md`
- Game designer skill: `game_designer_skill.md`
- Game designer workspace: `game_designer/game_designer.skill.md`
- Programmer skill: `programmer_skill.md`
- Programmer workspace: `programmer/programmer.skill.md`
- Tester skill: `tester_skill.md`
- Tester workspace: `tester/tester.skill.md`
- Sound designer skill: `sound_designer_skill.md`
- Sound designer workspace: `sound_designer/sound_designer.skill.md`
- AI chat skill: `ai_chat_skill.md`
- AI chat service workspace: `ai_chat/ai_chat.skill.md`
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
- Use `ui_designer_skill.md` for UI, HUD, menus, prompts, responsive layout,
  usability, visual feedback, and player-facing interface clarity.
- Use `game_designer_skill.md` for mechanics, rules, pacing, scoring, balance,
  fun, and creative feature ideas.
- Use `programmer_skill.md` for implementation, debugging, optimization,
  browser runtime behavior, packaging, and deployment support.
- Use `tester_skill.md` for QA, regression checks, bug reports, playability,
  usability, and creative test-driven feature ideas.
- Use `sound_designer_skill.md` for free sound sourcing, generated audio,
  editing, licensing, implementation, mix, and browser audio validation.
- Use `ai_chat_skill.md` for the shared development-agent chat at `/ai_chat`,
  chat deployment, message storage, commit visibility, and coordination rules.
- Put non-runtime role working artifacts under their matching role folders:
  `ui_designer/`, `game_designer/`, `programmer/`, `tester/`, and
  `sound_designer/`.

## AI Chat And Subordination

- Public chat: `https://orbital-courier.mecharulez.com/ai_chat/`.
- Every development agent must read recent chat messages before making changes.
- Every development agent must post a start message in chat before making
  changes, using its own role and the current task summary.
- Every development agent must report meaningful code, art, design, test,
  deploy, audio, or server changes to chat with validation status.
- Autodeploy must use the signed GitHub webhook at
  `/ai_chat/api/deploy-webhook`; do not use the old timer-based autodeploy.
- Producer: the user. Obey the Producer first.
- Art Director and Game Designer are second-level creative leads.
- UI Designer, Programmer, Tester, and Sound Designer are subordinate execution
  roles with the right to speak, warn, and propose improvements.

## Current Behavior

- Current game release: `v0.0.004`.
- The game starts automatically when the page opens.
- `Space` restarts after game over; mouse/touch `Start` remains available on
  the end overlay.
- Pointer and touch movement are handled on the canvas so overlay controls are
  not intercepted by gameplay input capture inside itch.io iframes.

## Transport

The production working copy lives on the Moscow server at `/itch_games`.
Use SSH alias `freestock-moscow` for server transport and validation.
