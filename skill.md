# itch_games Skill

Use this root skill when changing, packaging, validating, or publishing the
`/itch_games` browser game repository.

## Hierarchy

- Root: `skill.md`, `skill.xml`, `itch_games.skill.md`
- Public catalog: `index.html`
- Current game: `orbital-courier/orbital-courier.skill.md`,
  `orbital-courier/skill.xml`
  - Entry shell: `orbital-courier/index.html`
  - Runtime code: `orbital-courier/src/main.js`
  - Runtime styles: `orbital-courier/src/styles.css`
  - Vendored runtime dependency: `orbital-courier/vendor/three.module.js`
- New game: `unsoccer/unsoccer.skill.md`, `unsoccer/skill.xml`
  - Public page: `unsoccer/index.html`
  - Client: `unsoccer/client/`
  - Server: `unsoccer/server/`
  - Shared protocol: `unsoccer/shared/`
  - Asset provenance: `unsoccer/assets/`
- UI Designer: `ui_designer_skill.md`, `ui_designer/ui_designer.skill.md`
  - Public pages: `ui_designer/public_pages/public_pages.skill.md`
  - Orbital Courier public brief:
    `ui_designer/public_pages/orbital-courier-public-pages.md`
  - Orbital Courier itch copy/checklist/assets:
    `ui_designer/public_pages/orbital-courier-itch-page-copy.md`,
    `ui_designer/public_pages/orbital-courier-itch-publishing-checklist.md`,
    `ui_designer/public_pages/orbital-courier-itch-assets/`
  - Cross-game itch publication ledger:
    `ui_designer/public_pages/itch-publication-ledger.md`
  - UnSoccer public brief:
    `ui_designer/public_pages/unsoccer-public-pages.md`
  - UnSoccer itch copy/checklist/assets:
    `ui_designer/public_pages/unsoccer-itch-page-copy.md`,
    `ui_designer/public_pages/unsoccer-itch-publishing-checklist.md`,
    `ui_designer/public_pages/unsoccer-itch-assets/`
- Art Director: `art_director_skill.md`,
  `art_director/art_director.skill.md`
  - UnSoccer HDR/day-cycle/camera target:
    `art_director/style_guides/unsoccer-hdr-day-cycle-camera.md`
  - UnSoccer visual vertical slice brief:
    `art_director/briefs/unsoccer-v0.0.001-visual-vertical-slice.md`
- Game Designer: `game_designer_skill.md`,
  `game_designer/game_designer.skill.md`
  - UnSoccer v0.0.009 core-loop brief:
    `game_designer/briefs/unsoccer-v0.0.009-core-loop.md`
- Programmer: `programmer_skill.md`, `programmer/programmer.skill.md`
  - UnSoccer v0.0.003 acceptance evidence:
    `programmer/checks/2026-07-01-unsoccer-v0.0.003-acceptance.md`
- Tester: `tester_skill.md`, `tester/tester.skill.md`
- Sound Designer: `sound_designer_skill.md`,
  `sound_designer/sound_designer.skill.md`
  - Sound v0.0.006 evidence:
    `sound_designer/implementation/audio-pass-v0.0.006.md`
  - UnSoccer audio v0.0.002 evidence:
    `sound_designer/implementation/unsoccer-audio-pass-v0.0.002.md`
  - UnSoccer audio v0.0.003 evidence:
    `sound_designer/implementation/unsoccer-audio-pass-v0.0.003.md`
  - UnSoccer audio v0.0.008 evidence:
    `sound_designer/implementation/unsoccer-audio-pass-v0.0.008.md`
- AI chat service: `ai_chat_skill.md`, `ai_chat/ai_chat.skill.md`
  - Deploy references: `ai_chat/deploy/deploy.skill.md`
    - UnSoccer production service:
      `ai_chat/deploy/itch-games-unsoccer-server-qwertystock.service`
- Tools: `tools/tools.skill.md`
  - Itch package helper: `tools/package_itch.py`
  - UnSoccer acceptance gate: `tools/unsoccer_acceptance.mjs`

## Rules

- Keep the game static and HTML5-compatible for itch.io.
- Keep `index.html` at the zip root.
- Use game release versions in the `v0.0.001` sequence and bump every behavior
  change.
- Render the current game release version visibly in the bottom-left corner.
- Keep `package.json.gameVersion`, the UI version badge, and docs synchronized.
- Keep `package.json.version` npm-compatible while `gameVersion` stores the
  canonical displayed game release.
- Multi-game metadata lives in `package.json.games`; each new game starts at
  `v0.0.001` and tracks its own displayed version.
- Do not commit generated files under `dist/`.
- Test through a local static server before upload.
- Public game pages, game clients, and game assets must be a static-file bundle
  in each game public directory. Nginx should serve those files directly from
  the filesystem; do not add app-server routes for static games, static assets,
  screenshots, or downloadable client files unless the Producer explicitly asks
  for dynamic behavior.
- Treat GitHub `eschota/itch_games` as the public source repository.
- Version bumps must be committed, pushed to GitHub, and autodeployed.
- Use `art_director_skill.md` for art direction, visual quality, 3D, animation,
  VFX, lighting, rendering, screenshots, trailers, and audio-visual mood work.
- Put Art Director working artifacts that are not runtime code and not final
  shipped assets under `art_director/`.
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
- Use `ai_chat_skill.md` for the shared development-agent chat at `/ai_chat`,
  chat deployment, message storage, commit visibility, and coordination rules.
- Put non-runtime role working artifacts under their matching role folders:
  `ui_designer/`, `game_designer/`, `programmer/`, `tester/`, and
  `sound_designer/`.
- For `unsoccer`, keep browser code in `unsoccer/client`, authoritative server
  code in `unsoccer/server`, and shared protocol/tuning in `unsoccer/shared`.
- Use local Free3D `.glb` assets only after exact API tuple download and
  provenance are recorded under `unsoccer/assets/licenses/`.

## Public Presentation Scope

- UI Designer owns the look, hierarchy, copy clarity, and responsive behavior of
  every public surface tied to the game: `index.html`, `orbital-courier/`,
  `unsoccer/`, itch.io page guidance, catalog cards, metadata, screenshots,
  captions, and local-server presentation.
- Public pages must expose the game title, actual play fantasy, primary play
  action, current version when relevant, and a visual preview that matches the
  game.
- Each game should keep a public static directory with relative links for its
  page, client bundle, screenshots, downloadable files, and assets, so nginx can
  serve `/game-name/` directly without app-server static routes.
- If a public page is external and cannot be changed from this repository, keep
  the source-of-truth brief under `ui_designer/public_pages/` and mirror the
  relevant hierarchy in `skill.md` and `skill.xml`.
- External itch.io pages are incomplete until their URL, uploaded zip, exact
  live copy, screenshots, publication date, and version match are recorded in
  `ui_designer/public_pages/`.
- Track cross-game external publication status in
  `ui_designer/public_pages/itch-publication-ledger.md`; per-game checklists
  remain the operational steps for each page.
- The itch.io upload package is player-facing; keep internal skill, role, agent
  coordination, server, and source-control docs out of the zip unless the
  Producer explicitly asks to publish them.
- Orbital Courier vendors Three.js `0.165.0` under `orbital-courier/vendor/` so
  itch.io uploads do not depend on a CDN at runtime.

## AI Chat And Subordination

- Public chat: `https://io-games.mecharulez.com/ai_chat/`.
- Every development agent must read recent chat messages before making changes.
- Every development agent must post a start message in chat before making
  changes, using its own role and the current task summary.
- The Orchestrator or Producer must create clear Task Queue items before roles
  do non-read-only work. Execution roles must not edit project files, deploy,
  or create runtime assets without an assigned or claimed task for their role.
- The Orchestrator must record Producer future ideas in the public Todo List
  immediately. Todo List items are mandatory backlog: once every Task Queue item
  is `done`, the Orchestrator must promote the next open Todo into a Task Queue
  item or close it as `done`/`blocked` with a clear reason.
- Agents may read, ask clarifying questions, report blockers, and post concise
  `Idea:` messages without claiming a task; implementation waits for a task.
- Any agent may ask in chat or Todo/Task Queue for server, deployment, nginx,
  webhook, domain, environment, Telegram bridge, or public-static availability
  fixes when that infrastructure blocks or degrades their work.
- Before non-trivial, multi-role, or shared-file work, agents must agree a
  `Parallel Plan:` in chat: workstreams, owners, exact file scopes, branch or
  task id, dependencies, merge order, and validation owner. No agent may edit
  outside its agreed scope until the Orchestrator, Producer, or affected roles
  acknowledge the split.
- The Task Queue must name role, priority, title, description, file scope,
  dependencies, acceptance, owner/claim, status, and validation owner when
  applicable.
- Todo List does not replace Task Queue authority. It stores future ideas; work
  starts only after a Todo is promoted into a role-owned task.
- Every development agent must report meaningful code, art, design, test,
  deploy, audio, or server changes to chat with validation status.
- Every role should occasionally propose concise, actionable `Idea:` messages
  for project development when a concrete opportunity appears; do not spam,
  repeat ideas, or post more than one idea per substantial work block unless
  the Producer asks.
- Autodeploy must use the signed GitHub webhook at
  `/ai_chat/api/deploy-webhook`; do not use the old timer-based autodeploy.
- Producer: the user. Obey the Producer first.
- Art Director and Game Designer are second-level creative leads.
- UI Designer, Programmer, Tester, and Sound Designer are subordinate execution
  roles with the right to speak, warn, and propose improvements.

## Repository Hygiene

- Every agent must run `git status --short --branch` before making changes and
  before finishing work.
- Do not leave staged files between tasks. Staging is allowed only immediately
  before an intentional commit, and the final state after commit/push must have
  no staged changes.
- Never stage generated files, caches, logs, temp outputs, local data, secrets,
  service env files, `dist/`, `ai_chat/data/`, `__pycache__/`, or `*.pyc`.
- If accidental staged files exist, unstage them without reverting file content,
  then decide explicitly whether the working-tree changes belong to the task.
- Preserve unrelated user or agent changes. Do not revert or overwrite them to
  make the tree look clean.
- Report final git cleanliness in `/ai_chat` after meaningful work.

## Current Behavior

- Current game release: `v0.0.009`.
- `unsoccer` current prototype release: `v0.0.009`.
- `unsoccer` uses a headless authoritative Node server with Rapier3D physics,
  plain WebSocket transport, and HTTP polling fallback; the itch package is
  static client-only and needs the live game server for multiplayer.
- Production `https://io-games.mecharulez.com/unsoccer/` serves
  `unsoccer/client/dist`; `/unsoccer/api/` and `/unsoccer/socket/` are nginx
  proxies to the authoritative server on `127.0.0.1:8787`.
- The Qwertystock production host must keep UnSoccer transport WebSocket-based.
  Do not make geckos.io a required runtime there because its native
  `node-datachannel` addon is not compatible with the target system glibc.
- The game starts automatically when the page opens.
- `unsoccer` v0.0.002 has a client-only procedural Web Audio layer driven by
  authoritative server snapshots for kicks, body contacts, goals, countdown,
  roster changes, and ball rolling.
- `unsoccer` v0.0.003 adds server-authoritative snow weather, puddles, slush,
  snowbanks, weather visuals/audio, and an isolated deterministic acceptance
  gate for spectator assignment, contacts, and goal reset.
- `unsoccer` client contact telegraphs distinguish left-foot, right-foot, head,
  and body contacts with different flash colors/shapes and QA-readable
  `data-last-action-*` fields.
- `unsoccer` v0.0.003 audio must expose debug counters for played and blocked
  Web Audio events and hydrate connection/local role cues after the first
  successful trusted browser unlock.
- `unsoccer` v0.0.007 aligns the public client/server version and uses the
  built-in Node WebSocket JSON transport with HTTP polling fallback so
  production does not require geckos.io, `ws`, or native `node-datachannel`.
- `unsoccer` v0.0.008 keeps the release version and client bundle weight
  visible in the HUD and starts the residential courtyard art pass with
  procedural apartment blocks, cars, trees, and benches around the field.
- `unsoccer` v0.0.008 also adds a server-authored `audioEvents` ring buffer so
  roster, kick/body, goal, and countdown cues are synchronized across WebSocket
  and HTTP fallback clients by authoritative event id.
- `unsoccer` v0.0.009 expands the Art Director runtime pass with a visibly
  modeled residential courtyard, procedural animated footballer rigs, a visible
  sun/moon/orbit marker, and QA-readable 120-second day-cycle lighting data.
- `unsoccer` v0.0.009 fixes team-relative WASD movement, renders the local
  controlled player without the remote interpolation delay, and removes the
  artificial pitch-rectangle clamp from player movement.
- `v0.0.006` adds procedural Web Audio feedback and exposes
  `window.orbitalCourierAudio` plus `orbital-courier:audio-event` so future
  network code can replicate semantic sound events instead of audio files.
- `Space` restarts after game over; mouse/touch `Start` remains available on
  the end overlay.
- Pointer and touch movement are handled on the canvas so overlay controls are
  not intercepted by gameplay input capture inside itch.io iframes.

## Transport

The previous production working copy lives on the Moscow server at
`/itch_games`. Use SSH alias `freestock-moscow` for rollback validation.

The current migration target is the main Qwertystock production server
`generic@145.239.0.57:22744`, isolated from the main site at
`/home/generic/itch_games`.

On `qwertystock.com`, do not edit or restart the main Qwertystock PM2 apps,
`/home/generic/QwertyStock`, `/home/generic/QwertyData`, or the
`server_name qwertystock.com` nginx block for this project. The shared IO games
host must use its own `server_name io-games.mecharulez.com`, its own
`itch-games-ai-chat.service`, and `ai_chat/server_node.js` because the target
server's system Python is 3.5.
