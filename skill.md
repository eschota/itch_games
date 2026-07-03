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
    `ui_designer/public_pages/unsoccer-itch-publication-v0.0.053.md`,
    `ui_designer/public_pages/unsoccer-itch-assets/`
  - UnSoccer Yandex Games assets and upload handoff:
    `ui_designer/public_pages/unsoccer-yandex-games-assets/`,
    `ui_designer/public_pages/unsoccer-yandex-games-upload-handoff-v0.0.052.md`,
    `ui_designer/public_pages/verify-yandex-upload-pack.mjs`
  - UnSoccer VK Play handoff:
    `ui_designer/public_pages/unsoccer-vkplay-release-gate.md`,
    `ui_designer/public_pages/unsoccer-vkplay-assets/`,
    `ui_designer/public_pages/prepare-vkplay-store-assets.py`,
    `ui_designer/public_pages/unsoccer-vkplay-upload-handoff-v0.0.052.md`,
    `ui_designer/public_pages/prepare-vkplay-upload-pack.mjs`
  - UnSoccer CrazyGames handoff:
    `ui_designer/public_pages/unsoccer-crazygames-upload-handoff-v0.0.053.md`,
    `ui_designer/public_pages/prepare-crazygames-upload-pack.mjs`
  - UnSoccer UI/settings runtime evidence:
    `ui_designer/public_pages/unsoccer-ui-settings-redesign-v0.0.008.md`,
    `ui_designer/public_pages/unsoccer-ui-runtime-smoke-v0.0.009.json`,
    `ui_designer/public_pages/unsoccer-ui-runtime-smoke-v0.0.009.png`,
    `ui_designer/public_pages/unsoccer-ui-final-local-gate-v0.0.010-rerun.json`
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
  - UnSoccer audio v0.0.010 final local gate:
    `sound_designer/checks/2026-07-01-unsoccer-v0.0.010-final-audio-gate.md`
- AI chat service: `ai_chat_skill.md`, `ai_chat/ai_chat.skill.md`
  - Deploy references: `ai_chat/deploy/deploy.skill.md`
    - UnSoccer production service:
      `ai_chat/deploy/itch-games-unsoccer-server-qwertystock.service`
    - Moscow mirror deploy references:
      `ai_chat/deploy/itch-games-io-games-moscow.conf`,
      `ai_chat/deploy/itch-games-ai-chat-moscow.service`,
      `ai_chat/deploy/itch-games-unsoccer-server-moscow.service`,
      `ai_chat/deploy/itch-games-autodeploy-moscow.sh`
- Tools: `tools/tools.skill.md`
  - Itch package helper: `tools/package_itch.py`
  - Itch.io publish transport: `tools/itch.skill.md`
    - UnSoccer butler publisher: `tools/publish_unsoccer_itch.ps1`
  - UnSoccer acceptance gate: `tools/unsoccer_acceptance.mjs`
  - Local git hooks: `tools/hooks/hooks.skill.md`
    - Tracked post-commit entrypoint: `tools/hooks/post-commit`
    - UnSoccer post-commit autodeploy:
      `tools/hooks/unsoccer_post_commit_autodeploy.ps1`

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
- `tools/unsoccer_acceptance.mjs` reads the expected UnSoccer version from
  `package.json.games.unsoccer.version`; do not reintroduce hard-coded release
  strings in the acceptance gate.
- `npm run package:unsoccer` must rebuild UnSoccer before writing
  `dist/unsoccer-itch.zip` so stale `unsoccer/*/dist` output cannot be
  published.
- Do not commit generated package zips under root `dist/`.
- Release commits may include built UnSoccer `unsoccer/client/dist`,
  `unsoccer/server/dist`, and `unsoccer/shared/dist` artifacts when production
  needs fast git-pull-and-restart deployment.
- Test through a local static server before upload.
- Public game pages, game clients, and game assets must be a static-file bundle
  in each game public directory. Nginx should serve those files directly from
  the filesystem; do not add app-server routes for static games, static assets,
  screenshots, or downloadable client files unless the Producer explicitly asks
  for dynamic behavior.
- Treat GitHub `eschota/itch_games` as the public source repository.
- GitHub repository settings, including webhooks, may be operated through the
  Codex in-app Browser when the logged-in GitHub session is available and
  `gh`/GitHub connector access is blocked. Record browser-driven changes in
  `/ai_chat` and verify with webhook deliveries or production health endpoints.
- Version bumps must be committed, pushed to GitHub, and autodeployed.
- This local clone uses `git config core.hooksPath tools/hooks`, where
  `tools/hooks/post-commit` runs
  `tools/hooks/unsoccer_post_commit_autodeploy.ps1`. Commits to `main` push to
  GitHub and let the signed webhook publish production. Clean source-only
  commits auto-create generated UnSoccer dist artifact commits before push;
  dirty-tree commits preserve local work and force the server rebuild path when
  committed dist is stale. Use `ITCH_GAMES_POST_COMMIT_AUTODEPLOY=0` or
  `[skip deploy]` only for intentional local-only commits.
- Set `ITCH_IO_TARGET=owner/game:channel` to let the post-commit hook publish
  UnSoccer to itch.io after production is ready. The butler publisher is
  `tools/publish_unsoccer_itch.ps1`; keep itch credentials out of the repo.
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
- Yandex Games upload staging for UnSoccer is incomplete until
  `node ui_designer/public_pages/verify-yandex-upload-pack.mjs --mode=live`
  passes with pinned SHA-256 for the numbered files and the Console draft has
  the archive/media files selected and saved.
- VK Play publication/update for UnSoccer is incomplete until
  `ui_designer/public_pages/unsoccer-vkplay-release-gate.md` passes: the local
  VK Play pack is regenerated, primary and Moscow live health both serve the
  target version, and the VK Play iframe URL uses
  `https://moscow-io-games.mecharulez.com/unsoccer/?source=vkplay&version={GAME_VERSION}`.
- CrazyGames submission for UnSoccer is incomplete until
  `node ui_designer/public_pages/prepare-crazygames-upload-pack.mjs` passes,
  the generated ZIP is selected in the CrazyGames `Upload files` field, the
  portal preview/QA step opens the expected build, and the final submit action
  succeeds.
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
- Never stage generated package zips, caches, logs, temp outputs, local data,
  secrets, service env files, `ai_chat/data/`, `__pycache__/`, or `*.pyc`.
  UnSoccer built `client/server/shared` dist artifacts are allowed only for an
  intentional fast production release.
- If accidental staged files exist, unstage them without reverting file content,
  then decide explicitly whether the working-tree changes belong to the task.
- Preserve unrelated user or agent changes. Do not revert or overwrite them to
  make the tree look clean.
- Report final git cleanliness in `/ai_chat` after meaningful work.

## Current Behavior

- Current game release: `v0.0.056`.
- `unsoccer` current prototype release: `v0.0.056`.
- `unsoccer` v0.0.056 enforces the textureless runtime asset contract: no
  image texture files in shipped character/environment/ball assets, no GLB
  images/textures/material texture maps, no FBX image references, runtime
  loaders reject texture maps, and acceptance/package gates prove it.
- `unsoccer` v0.0.055 adds the local `/admin` runtime settings entry, defaults
  bot fill to three active players, and shortens the active ball-strike trigger
  ranges while keeping them tunable in the Russian admin.
- `unsoccer` v0.0.054 mirrors orange-team left/right input in client code
  while preserving the current blue-team mapping and without changing the
  controls GUI.
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
- `v0.0.038` mobile controls use `#mobile-controls` with a draggable movement
  pad and action buttons for sprint, jump, left-foot charge, hand hit, and
  head hit. Browser QA can assert `data-mobile-last-directions`,
  `data-mobile-last-action`, and `data-resolved-input-*`.
- `v0.0.039` keeps WebSocket clients from joining into an empty local scene:
  after join, the client must receive state or fall back to HTTP polling, and a
  throttled fallback tick keeps roster, stamina HUD, and bot actors visible when
  the in-app browser throttles `requestAnimationFrame`.
- `v0.0.040` makes bot/runtime health inspectable during browser QA:
  `/api/health`, `/api/game-settings`, and `/api/bot-settings` expose bot
  totals, active bot count, target fill, runtime enablement, human clients, and
  test-mode state; the client mirrors snapshot/visible bot counters through
  `data-snapshot-active-bots`, `data-visible-bots`,
  `data-hidden-active-players`, and `data-bots-runtime-visible`.
- `v0.0.041` moves the HTTP fallback stale-player timeout to runtime settings
  as `httpClientStaleMs` and exposes it through `/api/health`, so closed or
  frozen HTTP tabs release active slots back to bots after 12 seconds by
  default instead of suppressing bot fill for the old hard-coded window.
- `v0.0.042` adds `websocketClientStaleMs` to runtime settings, schema,
  admin-facing settings, and `/api/health`, then uses it to close frozen
  WebSocket player slots before bot fill so stalled browser tabs cannot make
  bots disappear. Health now exposes `desiredBotPlayers`, `nonBotActiveSlots`,
  and `botFillSuppressionReason`, and the client retries connection flow after
  WebSocket disconnect when auto-reconnect is enabled.
- `v0.0.043` keeps stamina draining only from Shift and incoming full-hit
  damage, makes RMB/head input counters consume only after an accepted strike,
  and treats airborne LMB dash as swept player-hit reach for reliable jump-kick
  knockouts.
- `v0.0.044` keeps bot fill self-healing every tick, proves bot combat uses
  the same one-hit ragdoll rule as human combat, and makes possessed balls drop
  ownership and rebound when they hit another player.
- `v0.0.045` keeps bot attacks free while the bot is not exhausted/ragdolling,
  matching the stamina rule that only Shift sprint and incoming damage drain
  stamina.
- `v0.0.046` synchronizes `/api/test/bots` changes back into runtime game
  settings so local acceptance and QA cannot lose the intended ten-player bot
  fill when the settings file watcher reloads.
- `v0.0.047` stabilizes the skinned character IK/ragdoll visual layer and adds
  browser/server diagnostics for visible bot combat, stamina ranges, active
  ragdoll/strike counts, human/test slot pressure, and stale client slots.
- `v0.0.048` keeps exhausted players from firing jump/combat/possession
  inputs, fixes overlap-range player hits, reuses displaced bots from a dormant
  pool, exposes bot reuse/body diagnostics in health, and keeps exhausted team
  rings visible with a pulse instead of blinking out.
- `v0.0.049` hardens the acceptance gate for stamina, combat, and bots without
  changing runtime math: default friendly fire, one-hit knockout, zero jump
  cost, zero attacker hit cost, free head whiffs, and non-test ten-bot fill are
  all explicit release checks.
- `v0.0.050` makes WebSocket page reloads/closures release player slots through
  `/api/leave`, allows `/api/leave` to remove WebSocket players as well as HTTP
  players, and shortens default WebSocket stale cleanup to 12 seconds so bots
  immediately backfill instead of disappearing behind stale human slots. It
  also widens airborne LMB dash-kick swept hit reach for more reliable jump
  knockouts. Exhausted standing players cannot own/capture the ball; high
  aggression bots can finish exhausted opponents into ragdoll, while default
  bot combat pressure stays gated above the default aggression so football-only
  bot matches do not collapse.
- `v0.0.051` lets default-aggression bots visibly brawl again, moves bot combat
  aggression threshold and anti-collapse limits into runtime game settings, and
  acceptance proves one-hit bot knockout, stable bot ids, active bot fill, and
  no fill suppression.
- `v0.0.052` fixes point-blank no-ball strikes so visible overlap hits apply
  stamina damage/ragdoll, release-gates active bot ids/roles/finite positions,
  and covers LMB+Shift possession shots while preserving the Shift/damage-only
  stamina drain contract.
- `v0.0.053` keeps that gameplay contract and adds the hosted itch.io/itch.zone
  transport fallback so packaged iframe builds connect to the production
  UnSoccer WebSocket/API endpoints.
- `v0.0.055` makes `http://127.0.0.1:5195/admin` a first-class local admin
  entry for runtime tuning, defaults local/production bot fill to three active
  players, and lowers kickRange/footKickAssistRange/handKickAssistRange/
  headKickAssistRange to reduce too-distant ball strike triggers.
- `v0.0.056` strips stale Free3D FBX image references from character animation
  clips, removes the old transparent data-image fallback, rejects runtime
  texture maps in character/environment/ball loaders, and extends acceptance
  plus packaging to fail on texture files, GLB texture slots, or FBX image refs.
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
- `unsoccer` v0.0.009 also ships the UI Designer runtime pass: redesigned HUD
  hierarchy, event/status panels, bottom toolbar, settings modal tabs,
  localStorage-backed controls/audio/graphics/network/accessibility settings,
  remappable input via `client/src/settings.ts` and `client/src/input-map.ts`,
  and QA-readable UI datasets/debug state. Runtime smoke evidence lives under
  `ui_designer/public_pages/unsoccer-ui-runtime-smoke-v0.0.009.*`.
- `unsoccer` v0.0.010 is the unified 0010 release build: it keeps the v0.0.009
  art/UI/input/audioEvents runtime work, frames the visible sun/moon marker for
  screenshots, bumps every current version surface to `v0.0.010`, and treats
  the prepared itch/publication ledger as repo-side evidence rather than
  external itch.io publication proof. Local UI/Tester/Art/Sound gates passed
  before publication, with final UI evidence under
  `ui_designer/public_pages/unsoccer-ui-final-local-gate-v0.0.010-rerun.*` and
  Tester evidence under
  `tester/checks/2026-07-01-unsoccer-v0.0.010-local-release-gate/`. The
  network HUD uses fixed numeric columns and tabular numerals so live ping/
  snapshot counters do not resize the panel.
- `unsoccer` v0.0.011 is the Producer mechanics/art integration build: it
  doubles the field and surrounding courtyard, starts the authoritative day at
  06:00, rotates sun/moon by server day time, randomizes weather every 60-120s,
  adds dawn birds/day traffic audio and visible cars, adds stamina sprint,
  exhaustion, jump, foot/hand/head attacks, player stamina damage, bouncier ball
  physics, thicker post/crossbar rebounds, local-only goal net cloth ripples,
  and 10 Free3D Online LowPoly 1k soccer-ball GLB sources baked/exported as
  local textureless vertex-color runtime assets.
- `unsoccer` v0.0.012 is the local lighting/weather correction preview: it
  keeps the current scene size, makes server time drive lighting under
  `qaTime=0`, limits dark hours to 20:00-04:00, hides the old sun-path debug
  line, makes clear/dawn dry and bright, and weights weather changes toward
  clear/dawn so rain is rare. It also upgrades the local-only goal net visual
  to a Verlet cloth grid, keeps the active Free3D/vertex-color ball on the
  field while hiding that variant from the sideline rack, aligns visible goal
  posts with the thicker server colliders, and extends acceptance coverage for
  post rebounds plus bouncier heading physics.
- `unsoccer` v0.0.013 replaces the primary primitive player body with a local
  Free3D Online `6300420` rigged/skinned GLB character optimized from 10.73 MB
  to 2.09 MB with `KHR_mesh_quantization`. The procedural footballer remains
  only as a loading/error fallback while the runtime exposes
  `data-player-rig="free3d-skinned-mixamo-character"` when the real model is
  attached.
- `unsoccer` v0.0.014 replaces the white all-animation character runtime with
  a different textured Free3D `6299851` split pipeline: `rigged_unity.glb`,
  WebP albedo/normal/ORM maps, and separate FBX `idle`, `walk`, `run`, and
  `jump` clips selected by player speed/airborne state.
- `unsoccer` v0.0.015 extracts the skinned character runtime into
  `client/src/character-controller.ts`, adds `character-controller-test.html`
  for local controller validation without the multiplayer server, blends
  idle/walk/run/jump by velocity with hysteresis/time scaling, applies
  procedural bone-IK overlays for foot/hand/head/body/jump strikes instead of
  baked attack clips, extends the server-authoritative day cycle to 300 seconds,
  shortens true dark hours to 23:00-03:00, and adds night-only floodlight masts
  with local volumetric beam meshes around the field.
- `unsoccer` v0.0.016 halves goal post/crossbar radius, switches posts to
  neutral material, makes goal scoring depend on front goal-line plane crossing
  from the field side, rejects back-net entries, and improves field graphics
  with center-circle, center-spot, penalty-box, goal-area, and penalty-spot
  markings.
- `unsoccer` v0.0.017 adds the local stamina HUD meter and state labels, exposes
  stamina QA datasets, and makes hand hits visibly read through a longer orange
  strike trail plus hand-action datasets.
- `unsoccer` v0.0.018 makes the camera player-anchored with smoothed velocity
  lead, removes ball-driven camera drift, and adds HUD offscreen arrows for the
  ball and other players with QA datasets.
- `unsoccer` v0.0.018 character roster extension adds a local 11-character
  runtime roster: 10 Free3D characters with WebP textures and one AutoRig task
  character with embedded GLB textures; every entry has separate local FBX
  idle/walk/run/jump clips and standalone controller-test switching by arrow
  keys plus UI.
- `unsoccer` v0.0.019 extends the local-only Verlet goal net from the rear
  sheet into closed goals with back, roof, left-side, and right-side panels,
  while keeping net motion visual-only and off the network.
- `unsoccer` v0.0.020 halves the authoritative shared `BALL_RADIUS` from
  `0.48` to `0.24`; keep physics, client procedural/Free3D ball scale,
  sideline ball placement, and acceptance fixtures on the shared radius.
- `unsoccer` v0.0.021 keeps goals in a 5-second team celebration phase,
  blocks normal ball kicks during the reset sequence, returns the ball to
  kickoff over a 1-second server-authored flight, and only then starts the
  kickoff countdown. Never teleport the ball to center immediately after a
  goal. `ServerState.goalReset` and browser `data-goal-reset-*` datasets are
  the QA surface. v0.0.021 also keeps the half-size ball from becoming a
  runaway projectile through `BALL_DENSITY=3.6` and reduced normal hit
  impulses.
- `unsoccer` v0.0.022 retargets Free3D character hand-strike IK so alternating
  hand hits keep logical left/right side while compensating the current
  roster's mirrored arm bones, and the punch/flash target reads forward at
  upper-chest/shoulder height.
- `unsoccer` v0.0.022 also smooths keyboard movement: server-authoritative WASD
  axes ramp and decay, opposite axes take over faster than release decay, and
  controlled player velocity accelerates/brakes instead of snapping. Client
  prediction mirrors this and exposes `data-movement-smoothing`,
  `data-local-move-speed`, and `data-local-move-axis` for QA.
- `unsoccer` v0.0.023 assigns newly joined players random ready characters from
  `CHARACTER_ROSTER` through a shuffled non-repeating server deck and preserves
  `player.characterId` across room role/team rebalancing.
- `unsoccer` v0.0.024 uses team-colored ground marker rings/halos under players
  and exposes `data-local-team-marker` plus `data-local-team-marker-color` for
  browser QA.
- `unsoccer` v0.0.024 adds a distinct `jumpRun` controller state for
  sprint/high-velocity jumps. Until a dedicated run-jump FBX is present in the
  runtime roster, `jumpRun` clones the normal jump clip and applies a stronger
  forward-leap IK overlay exposed through `data-player-rig-jump-style=run`.
- `unsoccer` v0.0.025 makes the camera follow a lerped authoritative player
  offset instead of any animated character/bone transform, smooths measured
  camera velocity before lead, and exposes `data-camera-anchor-smoothing`,
  `data-camera-anchor-offset`, and `data-camera-follow-speed` for browser QA.
- `unsoccer` v0.0.025 adds server-authored `player.ragdoll`/`ragdollAt` when
  stamina reaches zero. Sprint exhaustion must preserve previous movement
  inertia; stamina-emptying hits must apply heavy knockback/lift; local
  prediction must not override ragdoll snapshots; browser QA exposes
  `data-player-rig-ragdoll` and `data-local-player-ragdoll`.
- `unsoccer` v0.0.026 widens night floodlight SpotLight beams and volumetric
  cone meshes, gives each mast a slightly different white temperature, and adds
  subtle deterministic flicker exposed through `data-stadium-light-flicker`,
  `data-stadium-light-beam-angle`, `data-stadium-light-beam-radius`, and
  `data-stadium-light-palette`.
- `unsoccer` v0.0.027 makes player-ball contact height-aware: body bumps only
  happen when the ball overlaps the player's vertical body span, and foot/hand/
  head hits must be within their vertical reach so jumps can clear the ball and
  head inputs cannot hit balls clearly above the player.
- `unsoccer` v0.0.028 extends the residential courtyard with local Free3D
  environment GLB props plus dense procedural dressing. Browser QA must confirm
  `data-environment-model-instances` is at least `100`,
  `data-free3d-environment-asset-count="8"`, and
  `data-free3d-environment-loaded="true"`.
- `unsoccer` v0.0.029 doubles ordinary foot/hand/head ball-hit power and adds
  server-authored LMB left-foot charge from 2x tap power to 4x full power over
  one second. A held charge can fire once on ball contact before release, and
  browser QA exposes `data-local-kick-charge` plus
  `data-local-kick-charge-held`.
- `unsoccer` v0.0.029 also widens gameplay camera framing and adds visible
  sideline pennant/bench strips so the dense v0.0.028 courtyard remains visible
  during ordinary play without placing props on the pitch.
- `unsoccer` v0.0.030 makes deliberate strikes easier to execute: active
  foot/hand/head hits get player-centered assist reach, LMB clicks buffer for a
  short ball-contact window, active strike inputs suppress same-frame passive
  body bump, and body-only ball contact is softer and less frequent.
- `unsoccer` v0.0.031 adds server-authoritative bots that fill active player
  slots to four, give humans priority by removing/backfilling bot actors on
  join/leave, expose `controller` metadata in snapshots, keep bot actors out of
  connected-client capacity, and provide a static `client/public/bot-tuning.html`
  page backed by `/api/bot-settings` for local save/apply tuning.
- `unsoccer` v0.0.032 uses `unsoccer/game-settings.json` as the runtime tuning
  source, with `GET/POST /api/game-settings`, `POST /api/game-settings/reload`,
  `ServerState.settings/settingsRevision`, and static
  `unsoccer/client/public/game-admin.html` schema-driven admin controls
  (`game-settings.html` remains the larger legacy surface). Every new UnSoccer
  feature with tunable gameplay/world/bot/audio/camera/lighting/prop/UI behavior
  must add the value to `GameSettings`, `DEFAULT_GAME_SETTINGS`,
  `GAME_SETTINGS_SCHEMA`, `game-settings.json`, and the admin page contract in
  the same change.
- The UnSoccer settings admin must stay Russian-facing. `GAME_SETTINGS_SCHEMA`
  must cover every key in `DEFAULT_GAME_SETTINGS`/`game-settings.json`, and
  acceptance must keep a full per-key `/api/game-settings` roundtrip check.
- `unsoccer` v0.0.033 adds the core personalization/communication layer:
  mouse-wheel opens a local-only 9-emotion wheel above the local player for a
  2-second idle window, continued wheel motion cycles the selection, and any
  mouse click applies the selected emotion. Applied emotions replicate to all
  clients above that player through `PlayerSnapshot.emotion`.
- `unsoccer` v0.0.033 adds compact bottom-right in-game chat and profile
  controls. `Enter` opens chat, repeated `Enter` sends and closes it, chat does
  not drive gameplay input while focused, and profile updates must cover
  nickname, `skinId`/`characterId`, and `userPic` across WebSocket and HTTP
  fallback.
- `unsoccer` v0.0.033 preserves body-side combat readability: hand punches are
  server-authoritative alternating right/left strikes, LMB foot kicks use the
  current server-authored trailing foot, and snapshots expose
  `lastActionSide`, `trailingFoot`, and `stancePhase` so character animation and
  acceptance can assert the resolved limb side instead of inferring from input.
- `unsoccer` v0.0.036+ makes stamina drain only from Shift sprint and
  incoming player-hit damage. Space jump, LMB/RMB attacks, and whiffs must
  never spend attacker stamina or block recovery; keep `playerStaminaJumpCost`
  and `playerStaminaHitCost` clamped to zero in settings.
- Local browser play servers for UnSoccer must run without
  `UNSOCCER_TEST_MODE`; that flag is only for isolated acceptance and prevents
  normal default bot fill unless `/api/test/bots` enables it.
- `v0.0.006` adds procedural Web Audio feedback and exposes
  `window.orbitalCourierAudio` plus `orbital-courier:audio-event` so future
  network code can replicate semantic sound events instead of audio files.
- `Space` restarts after game over; mouse/touch `Start` remains available on
  the end overlay.
- Pointer and touch movement are handled on the canvas so overlay controls are
  not intercepted by gameplay input capture inside itch.io iframes.

## Transport

The Moscow mirror working copy lives on `freestock-moscow:/itch_games` and is
served independently at `https://moscow-io-games.mecharulez.com/unsoccer/`.
Its DNS record is managed through Way `qwertystock_domain_api` for
`mecharulez.com` and points at `5.42.121.207`.

The current migration target is the main Qwertystock production server
`generic@145.239.0.57:22744`, isolated from the main site at
`/home/generic/itch_games`.

On `qwertystock.com`, do not edit or restart the main Qwertystock PM2 apps,
`/home/generic/QwertyStock`, `/home/generic/QwertyData`, or the
`server_name qwertystock.com` nginx block for this project. The shared IO games
host must use its own `server_name io-games.mecharulez.com`, its own
`itch-games-ai-chat.service`, and `ai_chat/server_node.js` because the target
server's system Python is 3.5.

The Moscow mirror must use its own `server_name
moscow-io-games.mecharulez.com`, its own `itch-games-ai-chat.service`, and the
Moscow deploy script installed as
`/usr/local/bin/itch-games-autodeploy-moscow.sh` from
`ai_chat/deploy/itch-games-autodeploy-moscow.sh`. Do not reuse Qwertystock
service paths or secrets across hosts; copy only server-side webhook secrets
into the target environment when configuring the GitHub webhook.

When GitHub settings access is blocked by sudo/2FA, the existing primary
`io-games.mecharulez.com` GitHub webhook may fan out to Moscow through
`/ai_chat/api/deploy-relay`. The primary service must set
`AI_CHAT_DEPLOY_RELAY_URLS=https://moscow-io-games.mecharulez.com/ai_chat/api/deploy-relay`,
and the Moscow service must allow only the primary host IP with
`AI_CHAT_DEPLOY_RELAY_ALLOW_IPS=145.239.0.57`.
