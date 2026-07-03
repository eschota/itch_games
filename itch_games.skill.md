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
- `tools/hooks/hooks.skill.md`: local git-hook tooling rules.
- `tools/hooks/unsoccer_post_commit_autodeploy.ps1`: post-commit UnSoccer
  release helper used by the local `.git/hooks/post-commit` wrapper.
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
- `ui_designer/public_pages/unsoccer-ui-settings-redesign-v0.0.008.md`:
  original UI/settings brief, now recording the v0.0.009 runtime implementation
  status.
- `ui_designer/public_pages/unsoccer-ui-runtime-smoke-v0.0.009.json` and
  `ui_designer/public_pages/unsoccer-ui-runtime-smoke-v0.0.009.png`: headless
  Chrome UI runtime evidence for the v0.0.009 HUD/settings pass.
- `ui_designer/public_pages/unsoccer-ui-final-local-gate-v0.0.010-rerun.json`
  and matching PNGs: final local UI Designer gate evidence for the v0.0.010
  release build.
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
- `unsoccer/client/src/character-controller.ts`: reusable Free3D skinned
  character loader, velocity animation state machine, and procedural bone-IK
  strike overlays.
- `unsoccer/client/character-controller-test.html` and
  `unsoccer/client/src/character-controller-test.ts`: standalone local
  controller validation page that does not require the multiplayer server and
  cycles the local 11-character Free3D/AutoRig roster with arrow keys plus UI.
- `unsoccer/client/public/game-settings.html`: static schema-driven runtime
  admin page for `/api/game-settings` tuning with sliders, numbers,
  checkboxes, tooltips, apply/reload, and patch preview.
- `unsoccer/client/src/settings.ts`: UI/settings defaults, validation, local
  persistence, reset, and binding-conflict helpers.
- `unsoccer/client/src/input-map.ts`: key/mouse binding resolution, movement
  orientation/inversion, and `InputState` mapping.
- `unsoccer/client/src/audio.ts`: procedural Web Audio runtime for UnSoccer
  server-state-driven cues.
- `unsoccer/client/src/weather.ts`: weather visuals with runtime graphics/UI
  options for particles and reduced opacity.
- `unsoccer/server/`: authoritative Node/Rapier/WebSocket server.
- `unsoccer/game-settings.json`: runtime tuning source for UnSoccer gameplay,
  world, bot, lighting, and prop parameters.
- `unsoccer/shared/`: shared protocol, constants, gameplay tuning, and
  `GameSettings`/`GAME_SETTINGS_SCHEMA`.
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
- `game_designer/briefs/unsoccer-v0.0.009-core-loop.md`: UnSoccer Snowyard
  Pressure core-loop, weather-lane, stamina, sprint, super-shot, scoring, and
  role-handoff brief.
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
- `sound_designer/implementation/unsoccer-audio-pass-v0.0.008.md`: UnSoccer
  server-authored audioEvents ring buffer, client event cursor, and acceptance
  evidence.
- `sound_designer/checks/2026-07-01-unsoccer-v0.0.010-final-audio-gate.md`:
  final local v0.0.010 audio gate tied to deterministic acceptance and browser
  smoke.
- `ai_chat/`: service code, static UI, deployment references, and server-only
  message storage for the shared development-agent chat.
- `ai_chat/deploy/deploy.skill.md`: deployment reference rules for nginx,
  systemd, webhook deploy, and rollback notes.
- `ai_chat/deploy/itch-games-*-moscow.*`: Moscow mirror nginx, systemd, and
  webhook deploy references for `moscow-io-games.mecharulez.com`.

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
- On the Moscow mirror, run the chat with `ai_chat/server_node.js` from
  `/itch_games`, serve the independent host
  `moscow-io-games.mecharulez.com`, and keep its webhook deploy script pointed
  at `/usr/local/bin/itch-games-autodeploy-moscow.sh`.
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
- Stage only task-owned source/rule files. Never stage generated package zips,
  caches, logs, temp files, local data, secrets, service env files,
  `ai_chat/data/`, `__pycache__/`, or `*.pyc`. UnSoccer built
  `client/server/shared` dist artifacts are allowed only for an intentional fast
  production release.
- If staging contains accidental files, unstage them without reverting file
  content.
- Preserve unrelated user or agent changes; report them instead of cleaning
  them by force.

## Versioning

- Current release: `v0.0.053`.
- `unsoccer` release: `v0.0.053`.
- `unsoccer` v0.0.053 keeps the v0.0.052 gameplay contract and adds the
  hosted itch.io/itch.zone transport fallback so packaged iframe builds connect
  to the production WebSocket/API host.
- `unsoccer` v0.0.052 keeps stamina/combat/bot behavior locked: point-blank
  no-ball hits apply damage/ragdoll, stamina drains only from Shift and incoming
  damage, bot ids/roles/finite positions stay stable, and LMB+Shift possession
  shots are release-gated.
- Game releases start at `v0.0.001` and every behavior change increments the
  version.
- The visible bottom-left badge, `package.json.gameVersion`, README, and skill
  docs must stay synchronized. Multi-game versions also update
  `package.json.games`.
- Version bumps are committed, pushed to GitHub, and autodeployed.
- The local clone uses `git config core.hooksPath tools/hooks`; keep
  `tools/hooks/post-commit` and `tools/hooks/unsoccer_post_commit_autodeploy.ps1`
  secret-free and routed through GitHub push webhook deployment.
- Set `ITCH_IO_TARGET=owner/game:channel` to let the hook publish UnSoccer to
  itch.io after production becomes ready.

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
   `npm run test:unsoccer:acceptance`, `npm run package:unsoccer`, start
   `npm run server:unsoccer`, confirm `/api/health`, and open 4 clients with
   unique `name` query strings. `package:unsoccer` rebuilds first by contract
   and must not package stale client/server/shared dist output.
10. For UnSoccer audio, confirm `npm run test:unsoccer:acceptance` reports
  `websocket no-join has no phantom roster audio`, `websocket join audioEvents`,
  `server audioEvents roster`, and `server audioEvents kicks/body/goal/countdown`.
11. For UnSoccer runtime tuning, confirm `/api/game-settings` returns
    `settings`, `defaults`, `schema`, and `state.settingsRevision`, and confirm
    `unsoccer/client/public/game-settings.html` can load, edit, apply, and
    reload a setting through the same API. Any new tunable feature must update
    `GameSettings`, `DEFAULT_GAME_SETTINGS`, `GAME_SETTINGS_SCHEMA`,
    `unsoccer/game-settings.json`, and the admin page contract in the same
    change. The settings admin is Russian-facing, `GAME_SETTINGS_SCHEMA` must
    cover every JSON/defaults key, and acceptance must prove per-key apply and
    readback through `/api/game-settings`.
12. For UnSoccer communication/personalization QA, confirm `Enter` opens the
    compact bottom-right chat, repeated `Enter` sends and closes it, the
    profile strip can change nickname, skin, and `userPic`, mouse wheel opens a
    local-only 9-emotion wheel above the local player for a 2-second idle
    window, any click applies the selected emotion, and acceptance proves
    `PlayerSnapshot.emotion`, chat ring messages, profile state, alternating
    hand `lastActionSide`, and trailing-foot kicks.
13. For UnSoccer browser audio, confirm a real trusted click/touch/key makes
    `data-audio-context="running"`, `data-audio-unlocked="true"`, and
    `data-audio-played-events` increase; also inspect
    `data-audio-server-event-id` and `data-audio-server-primed`.
    Automation-only clicks may leave Chromium `AudioContext` suspended.
14. For UnSoccer UI/settings, confirm the v0.0.010 client shows
    `v0.0.010 / 0.61 MB`, opens `#settings-panel`, exposes settings/audio/
    graphics/remapping controls, and records a nonblank runtime screenshot plus
    JSON evidence under `ui_designer/public_pages/`; current final local
    evidence is
    `ui_designer/public_pages/unsoccer-ui-final-local-gate-v0.0.010-rerun.json`.
14. Confirm `/unsoccer/` never exposes a directory listing on local or
    production static hosts.
15. For UnSoccer v0.0.012 local QA, confirm browser datasets show
    `data-daylight="1.000"` during clear daytime, `data-dark-hours="20:00-04:00"`,
    `data-weather-particles-visible="false"`, `data-sun-path-visible="false"`,
    `data-active-ball-model="free3d-vertex-color-glb"`,
    `data-goal-net-mode="local-verlet-cloth-no-network"`, and
    `data-goal-post-radius="0.38"`.
16. For UnSoccer v0.0.013 character QA, confirm browser datasets show
    `data-player-rig="free3d-skinned-mixamo-character"`,
    `data-player-rig-asset="6300420"`, `data-player-rig-clip-count="1"`, and
    a visible skinned footballer instead of the primitive Capsule/Sphere/Box
    fallback.
16. For UnSoccer v0.0.014 character QA, confirm browser datasets show
    `data-player-rig-asset="6299851"`,
    `data-player-rig-mode="free3d-1k-skinned-glb-webp-textures-fbx-clips"`,
    `data-player-rig-textures="3"`, `data-player-rig-clip-count="4"`, and
    `data-player-rig-action` switches among `idle`, `walk`, `run`, and `jump`.
17. For UnSoccer v0.0.015 character-controller and lighting QA, open
    `/character-controller-test.html` from the Vite dev server or built client,
    confirm `data-character-controller-test="ready"`,
    `data-player-rig="free3d-skinned-character-controller"`,
    `data-player-rig-ik="procedural-bone-ik-overlay"`, and verify player feel
    for WASD, Shift sprint, Space jump, LMB foot, RMB hand, and MMB head
    strike. In the main game, confirm `data-day-cycle-length-seconds="300"`,
    `data-dark-hours="23:00-03:00"`, `data-stadium-lights="4"`, daytime
    `data-stadium-lights-on="0"`, and night
    `data-night-lighting="floodlight-masts-volumetric"` with four visible beam
    cones.
18. For UnSoccer v0.0.016 field/goal QA, confirm
    `data-goal-post-radius="0.19"`,
    `data-goal-post-material="neutral-white-metal"`, and
    `data-field-markings` includes `penalty-boxes`, `goal-areas`,
    `penalty-spots`, and `center-circle`; acceptance must prove that a ball
    entering the goal volume from behind does not score.
19. For UnSoccer v0.0.017 stamina/hand-feedback QA, confirm
    `data-local-stamina` is numeric for the local player,
    `data-local-stamina-state` changes through `ready`, `sprint`, `low`, or
    `exhausted`, and RMB/hand hit updates `data-last-hand-action-at` plus a
    visible orange hand-strike trail.
20. For UnSoccer v0.0.018 camera/offscreen QA, confirm
    `data-camera-mode="player-anchored-smooth"`, `data-camera-anchor` resolves
    to the local player id, `data-ball-offscreen` toggles when the ball leaves
    the view, and `data-offscreen-players` counts visible player arrows.
21. For UnSoccer v0.0.018 character roster QA, open
    `/character-controller-test.html`, cycle all 11 entries by arrow keys or UI,
    and confirm each entry reports `data-character-controller-test="ready"`,
    `data-player-rig-textures` greater than zero, `data-player-rig-clip-count="4"`,
    and `data-player-rig-ik="procedural-bone-ik-overlay"`.
22. For UnSoccer v0.0.019 goal-net QA, confirm
    `data-goal-net-mode="local-verlet-closed-goal-cloth-no-network"`,
    `data-goal-net-panels="8"` for two goals, and `data-goal-net-coverage`
    includes `back`, `roof`, `left-side`, and `right-side`.
23. For UnSoccer v0.0.020 ball-size QA, confirm the browser/server version is
    `v0.0.020`, `data-ball-radius="0.24"`, and the visible runtime ball is
    half the previous v0.0.019 diameter.
24. For UnSoccer v0.0.021 goal-reset and ball-balance QA, confirm
    `data-goal-reset-phase` moves through `celebration`, `returning`, and
    `kickoff`; after a goal the ball stays near the scored goal for 5 seconds,
    then flies to center for 1 second instead of teleporting; ordinary
    foot/hand/head/body hits must keep half-size ball speed below acceptance's
    runaway threshold.
25. For UnSoccer v0.0.022 movement QA, confirm
    `data-movement-smoothing="axis-inertia-accel-decel"` and keep the
    acceptance coverage for keyboard acceleration, released-axis fade, and
    faster opposite-axis takeover.
26. For UnSoccer v0.0.023 character assignment QA, confirm several players get
    `characterId` values from `CHARACTER_ROSTER` and the first roster deck does
    not repeat before the ready character pool is exhausted.
27. For UnSoccer v0.0.024 team marker QA, confirm the ground indicator circle
    under the local player has `data-local-team-marker` of `blue` or `orange`
    and `data-local-team-marker-color` matching the team color.
28. For UnSoccer v0.0.025 camera QA, confirm
    `data-camera-mode="player-anchored-lerp-anchor"`,
    `data-camera-anchor-smoothing="lerped-authoritative-player-offset-no-bone-follow"`,
    and that `data-camera-anchor-offset` remains bounded while the camera
    follows player movement without animation-driven bobble.
29. For UnSoccer v0.0.026 floodlight QA, force a night time through the local
    test API or `qaTime`, then confirm all four stadium lights are on,
    `data-stadium-light-beam-angle` is wider than 60 degrees,
    `data-stadium-light-beam-radius` is at least 13, `data-stadium-light-palette`
    lists four mast colors, and `data-stadium-light-flicker` rises above zero
    during observation.
30. For UnSoccer v0.0.027 player-ball contact QA, acceptance must prove an
    airborne player can clear a ground ball without body-bumping it and a head
    input cannot move a ball that is clearly above reachable head height.
31. For UnSoccer v0.0.028 environment QA, confirm the main game reports
    `data-environment="residential-courtyard-v028-free3d-dense"`,
    `data-environment-model-instances` of at least `100`,
    `data-free3d-environment-asset-count="8"`, and
    `data-free3d-environment-loaded="true"` while the field remains readable.
32. For UnSoccer v0.0.029 kick-power QA, acceptance must prove ordinary ball
    hits use the stronger 2x impulse, LMB/left-foot charge reaches a stronger
    capped 4x result after one second, and `data-local-kick-charge` rises while
    the local player holds LMB.
33. For UnSoccer v0.0.029 environment framing QA, take a main-game browser
    screenshot near a sideline and confirm the courtyard props are visible in
    the normal player camera while pitch markings and goal readability remain
    clear.
34. For UnSoccer v0.0.030 strike-feel QA, acceptance must prove active
    left-foot input beats same-frame body contact, left-foot assist reaches a
    ball just beyond the foot contact point, a short early LMB click buffers
    until the ball enters reach, and passive body bumps stay under the low body
    speed ceiling.
