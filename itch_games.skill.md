# itch_games Directory Skill

Use this file for work inside `/itch_games`.

## Parent References

- [skill.md](skill.md)
- [skill.xml](skill.xml)
- [art_director_skill.md](art_director_skill.md)
- [ui_designer_skill.md](ui_designer_skill.md)
- [game_designer_skill.md](game_designer_skill.md)
- [programmer_skill.md](programmer_skill.md)
- [tester_skill.md](tester_skill.md)
- [sound_designer_skill.md](sound_designer_skill.md)
- [ai_chat_skill.md](ai_chat_skill.md)

## Structure

- `index.html`: shared IO Games catalog for the public domain root.
- `orbital-courier/index.html`: current Orbital Courier game entrypoint.
- `orbital-courier/src/main.js`: Three.js game loop and input handling.
- `orbital-courier/src/styles.css`: fullscreen game shell and HUD styling.
- `orbital-courier/orbital-courier.skill.md`: game-folder rules.
- `tools/package_itch.py`: creates the upload zip in `dist/`.
- `art_director/`: non-runtime Art Director workspace for audits, checks,
  references, briefs, prompts, temp documents, and QA evidence.
- `ui_designer/`: non-runtime UI Designer workspace for audits, flows,
  wireframes, copy, references, and viewport checks.
- `game_designer/`: non-runtime Game Designer workspace for ideas, systems,
  tuning, level notes, playtests, and briefs.
- `programmer/`: non-runtime Programmer workspace for investigations,
  profiling, compatibility notes, plans, and validation checks.
- `tester/`: non-runtime Tester workspace for plans, bug notes, evidence,
  playtests, regression checks, and creative QA ideas.
- `sound_designer/`: non-runtime Sound Designer workspace for source research,
  generated prompts, raw audio, temp edits, mix notes, and audio checks.
- `ai_chat/`: service code, static UI, deployment references, and server-only
  message storage for the shared development-agent chat.

## Role Skills

- Use `art_director_skill.md` for visual quality, 3D art direction, animation,
  VFX, lighting, screenshots, trailers, UI visual fit, and audio-visual mood.
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
- Use `ai_chat_skill.md` for shared agent chat, message storage, commit menu,
  and `/ai_chat` deployment.
- Keep role working files under their matching role folders unless they are
  deliberately promoted into runtime code or final game assets.

## AI Chat

- Before changing the project, every agent must read recent messages at
  `https://io-games.mecharulez.com/ai_chat/`.
- Before changing the project, every agent must post that it has started work.
- Agents must report meaningful changes and validation results to the chat.
- Autodeploy is webhook-driven through `/ai_chat/api/deploy-webhook`; keep the
  old `itch-games-autodeploy.timer` disabled.
- On the Qwertystock migration target, run the chat with
  `ai_chat/server_node.js` from `/home/generic/itch_games`; the target system
  Python is 3.5.
- Keep IO Games isolated behind `server_name io-games.mecharulez.com`; do not
  add it as a location inside the main
  `qwertystock.com` site.
- The Producer is the user and has highest authority; Art Director and Game
  Designer are second-level creative leads; all other roles have voice and
  warning rights.

## Repository Hygiene

- Start and finish with `git status --short --branch`.
- Leave no staged files after a task unless the next immediate action is the
  intended commit.
- Stage only task-owned source/rule files. Never stage generated packages,
  caches, logs, temp files, local data, secrets, service env files, `dist/`,
  `ai_chat/data/`, `__pycache__/`, or `*.pyc`.
- If staging contains accidental files, unstage them without reverting file
  content.
- Preserve unrelated user or agent changes; report them instead of cleaning
  them by force.

## Versioning

- Current release: `v0.0.005`.
- Game releases start at `v0.0.001` and every behavior change increments the
  version.
- The visible bottom-left badge, `package.json.gameVersion`, README, and skill
  docs must stay synchronized.
- Version bumps are committed, pushed to GitHub, and autodeployed.

## Validation

1. Run `python3 -m http.server 8000`.
2. Open `/orbital-courier/` from a browser, not directly from `file://`.
3. Confirm the scene auto-starts on load and the bottom-left version badge shows
   the current release.
4. Confirm mouse/touch drag on the canvas moves the courier, `A`/`D` or arrow
   keys still work, and `Space` plus the overlay `Start` button can restart
   after game over.
5. Run `python3 tools/package_itch.py`.
6. Confirm `dist/orbital-courier-itch.zip` contains `index.html` at archive root.
