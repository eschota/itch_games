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
- `tools/tools.skill.md`: tooling folder rules.
- `tools/package_itch.py`: creates the player-facing upload zip in `dist/`.
- `tools/unsoccer_acceptance.mjs`: isolated deterministic acceptance gate for
  UnSoccer authoritative server mechanics.
- `ui_designer/public_pages/orbital-courier-public-pages.md`: public-page
  design brief for local catalog, game entry, and itch.io presentation.
- `ui_designer/public_pages/orbital-courier-itch-page-copy.md`,
  `ui_designer/public_pages/orbital-courier-itch-publishing-checklist.md`, and
  `ui_designer/public_pages/orbital-courier-itch-assets/`: Orbital Courier
  external itch.io page source and storefront assets.
- `ui_designer/public_pages/itch-publication-ledger.md`: cross-game external
  itch.io publication ledger for URLs, packages, screenshots, live copy, and
  version-match proof.
- `ui_designer/public_pages/unsoccer-public-pages.md`: public-page design brief
  for Ragdoll Soccer II local route and itch.io presentation.
- `ui_designer/public_pages/unsoccer-itch-page-copy.md`,
  `ui_designer/public_pages/unsoccer-itch-publishing-checklist.md`, and
  `ui_designer/public_pages/unsoccer-itch-assets/`: Ragdoll Soccer II external
  itch.io page source and storefront/public-page assets.
- `ui_designer/public_pages/public_pages.skill.md`: folder skill for public
  page briefs and itch.io presentation source-of-truth.
- `orbital-courier/index.html`: current Orbital Courier game entrypoint.
- `orbital-courier/src/main.js`: Three.js game loop and input handling.
- `orbital-courier/src/styles.css`: fullscreen game shell and HUD styling.
- `orbital-courier/vendor/`: vendored Orbital Courier browser runtime
  dependencies for offline/player-facing itch.io packaging.
- `orbital-courier/orbital-courier.skill.md`: game-folder rules.
- `unsoccer/`: Ragdoll Soccer II multiplayer soccer prototype.
- `unsoccer/index.html`: public prototype page served at `/unsoccer/`.
- `unsoccer/unsoccer.skill.md`: game-folder rules for the new prototype.
- `unsoccer/client/`: Vite TypeScript browser client.
- `unsoccer/client/src/main.ts`: Three.js scene, gameplay HUD, player action
  telegraphs, QA datasets, input, camera, and network state application.
- `unsoccer/client/src/audio.ts`: procedural Web Audio runtime for UnSoccer
  server-state-driven cues.
- `unsoccer/server/`: authoritative Node/Rapier/WebSocket server.
- `unsoccer/shared/`: shared protocol, constants, and gameplay tuning.
- `unsoccer/assets/`: local runtime assets plus Free3D roster/provenance files.
- `art_director/`: non-runtime Art Director workspace for audits, checks,
  references, briefs, prompts, temp documents, and QA evidence.
- `art_director/style_guides/unsoccer-hdr-day-cycle-camera.md`: Art Director
  visual target and acceptance for UnSoccer HDR lighting, day cycle, camera,
  and contact readability.
- `art_director/briefs/unsoccer-v0.0.001-visual-vertical-slice.md`: Art
  Director handoff brief for the first UnSoccer visual vertical slice.
- `ui_designer/`: non-runtime UI Designer workspace for audits, flows,
  wireframes, copy, references, and viewport checks.
- `game_designer/`: non-runtime Game Designer workspace for ideas, systems,
  tuning, level notes, playtests, and briefs.
- `programmer/`: non-runtime Programmer workspace for investigations,
  profiling, compatibility notes, plans, and validation checks.
- `programmer/checks/2026-07-01-unsoccer-v0.0.003-acceptance.md`: UnSoccer
  deterministic server acceptance evidence.
- `tester/`: non-runtime Tester workspace for plans, bug notes, evidence,
  playtests, regression checks, and creative QA ideas.
- `sound_designer/`: non-runtime Sound Designer workspace for source research,
  generated prompts, raw audio, temp edits, mix notes, and audio checks.
- `sound_designer/implementation/audio-pass-v0.0.006.md`: audio map,
  procedural provenance, implementation contract, and QA evidence for v0.0.006.
- `sound_designer/implementation/unsoccer-audio-pass-v0.0.002.md`: UnSoccer
  audio map, procedural provenance, implementation points, and QA evidence.
- `sound_designer/implementation/unsoccer-audio-pass-v0.0.003.md`: UnSoccer
  network audio sync, unlock diagnostics, and browser smoke evidence.
- `ai_chat/`: service code, static UI, deployment references, and server-only
  message storage for the shared development-agent chat.
- `ai_chat/deploy/deploy.skill.md`: deployment reference rules for nginx,
  systemd, webhook deploy, and rollback notes.

## Role Skills

- Use `art_director_skill.md` for visual quality, 3D art direction, animation,
  VFX, lighting, screenshots, trailers, UI visual fit, and audio-visual mood.
- Use `ui_designer_skill.md` for UI, HUD, menus, prompts, responsive layout,
  usability, visual feedback, player-facing interface clarity, local public
  pages, and itch.io presentation direction.
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
- The Orchestrator or Producer must create Task Queue items for role work
  before non-read-only implementation begins.
- Execution roles must not edit project files, deploy, or create runtime assets
  without an assigned or claimed task for their role; they may still read, ask
  questions, report blockers, and post concise `Idea:` messages.
- Before non-trivial, multi-role, or shared-file work, agents must agree a
  `Parallel Plan:` in chat with workstreams, owners, exact file scopes,
  branch/task id, dependencies, merge order, and validation owner.
- Agents must not edit outside their agreed scope until the Orchestrator,
  Producer, or affected roles acknowledge the split.
- Agents must report meaningful changes and validation results to the chat.
- Agents should occasionally propose concise, actionable `Idea:` messages for
  project development when a concrete opportunity appears; they must not spam,
  repeat ideas, or post more than one idea per substantial work block unless
  the Producer asks.
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

- Current release: `v0.0.006`.
- `unsoccer` release: `v0.0.003`.
- Game releases start at `v0.0.001` and every behavior change increments the
  version.
- The visible bottom-left badge, `package.json.gameVersion`, README, and skill
  docs must stay synchronized. Multi-game versions also update
  `package.json.games`.
- Version bumps are committed, pushed to GitHub, and autodeployed.

## Validation

1. Run `python3 -m http.server 8000`.
2. Open `/`, `/orbital-courier/`, and `/unsoccer/` from a browser, not directly
   from `file://`.
3. Confirm the catalog shows Orbital Courier and Ragdoll Soccer II with visible
   previews and public actions.
4. Confirm the scene auto-starts on load and the bottom-left version badge shows
   the current release.
5. Confirm mouse/touch drag on the canvas moves the courier, `A`/`D` or arrow
   keys still work, and `Space` plus the overlay `Start` button can restart
   after game over.
6. Run `python3 tools/package_itch.py`.
7. Confirm `dist/orbital-courier-itch.zip` contains `index.html` at archive root
   and `vendor/three.module.js`.
8. Confirm the itch package excludes internal `*skill*.md`, `skill.xml`, role,
   and agent coordination files.
9. For `unsoccer`, run `npm run build:unsoccer`,
   `npm run test:unsoccer:acceptance`, start
   `npm run server:unsoccer`, confirm `/api/health`, and open 4 clients with
   unique `name` query strings.
10. For UnSoccer audio, confirm a real trusted click/touch/key makes
    `data-audio-context="running"`, `data-audio-unlocked="true"`, and
    `data-audio-played-events` increase; automation-only clicks may leave
    Chromium `AudioContext` suspended.
11. Confirm `/unsoccer/` never exposes a directory listing on local or
    production static hosts.
