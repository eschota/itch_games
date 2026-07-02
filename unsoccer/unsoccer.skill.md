# unsoccer Skill

Use this file when changing `unsoccer`, the Ragdoll Soccer II prototype.

## Parent References

- [../skill.md](../skill.md)
- [../skill.xml](../skill.xml)
- [../itch_games.skill.md](../itch_games.skill.md)

## Scope

- `index.html`: public Ragdoll Soccer II page served at `/unsoccer/` on the
  local/static host until the built client is promoted there.
- `client/`: Vite TypeScript browser client for rendering, input, HUD,
  procedural Web Audio, and asset loading.
- `client/src/environment-props.ts`: Art Director courtyard extension, dense
  procedural dressing, local Free3D environment GLB roster hydration, and
  model-count QA datasets.
- `server/`: Node authoritative game server using the MavonEngine stack shape:
  headless simulation, Rapier3D physics, and WebSocket transport.
- `shared/`: protocol constants, message types, and gameplay tuning shared by
  client and server.
- `assets/`: final local runtime assets and license/provenance manifests.

## Rules

- Current release: `v0.0.030`.
- Keep client and server separated; browser bundles must not import server-only
  modules.
- The server is authoritative for room assignment, teams, player physics, ball
  physics, goals, score, and reset after goal.
- First 4 connected clients are active players. Additional clients up to 32 are
  spectators/testers so QA can observe without displacing a player.
- Controls: WASD movement, `Shift` sprint, `Space` jump, left mouse foot kick,
  right mouse hand hit, middle mouse button head hit.
- `v0.0.002` engine pass must preserve the Producer requirements: Russian
  player-facing text, HDR-style environment lighting, visible sun, 120-second
  realtime day cycle, reactive lighting, inertial perspective camera over the
  controlled player, and distinct server-authoritative body/left-foot/right-foot
  ball contacts.
- `v0.0.002` audio pass keeps sound client-only and driven by authoritative
  `ServerState` diffs: kicks/body contacts, score, countdown, roster changes,
  and ball speed.
- `v0.0.003` audio pass adds Web Audio played/blocked debug counters and
  hydrates connection/local role cues after the first successful trusted browser
  unlock, while keeping gameplay cues driven by server snapshots.
- `v0.0.003` weather pass keeps snow/puddle/slush/snowbank physics
  server-authoritative and requires client visuals for any hazard that changes
  movement or ball collision.
- `v0.0.007` production hotfix aligns the visible client/server version and
  uses a dependency-free WebSocket JSON transport with HTTP polling fallback on
  the Qwertystock host.
- `v0.0.008` adds the always-visible version/weight badge and begins the
  residential courtyard visual pass with procedural apartment blocks, parked
  cars, trees, and benches while preserving weather-hazard readability.
- `v0.0.008` audio uses a server-authored `audioEvents` ring buffer in
  `ServerState` so roster, kick/body, goal, and countdown cues are synchronized
  across WebSocket and HTTP fallback clients by authoritative event id.
- `v0.0.009` is the runtime Art Director 3D/animation pass: expanded
  residential courtyard models, procedural animated footballer rigs, visible
  sun/moon/orbit marker, ambient/bounce lighting, and QA-readable art/day-cycle
  datasets.
- `v0.0.009` makes WASD team-relative, keeps the local controlled player
  responsive with a small client-side prediction lead, and removes artificial
  pitch bounds from player movement so only explicit gameplay colliders block
  players.
- `v0.0.009` also owns the player-facing UI/settings pass: HUD hierarchy,
  event/status/network panels, bottom toolbar, settings modal tabs,
  localStorage settings, remappable input, audio/graphics/network/accessibility
  controls, and QA-readable UI datasets/debug snapshot state. Keep
  `client/src/settings.ts`, `client/src/input-map.ts`, `client/src/main.ts`,
  `client/src/styles.css`, `client/src/audio.ts`, and `client/src/weather.ts`
  synchronized when changing this surface.
- `v0.0.010` is the unified 0010 release build. It preserves the v0.0.009
  runtime workstreams, frames the visible sun/moon marker for screenshots,
  stabilizes the network HUD numeric columns, synchronizes the current release
  version across package, client, server, shared, acceptance, public page, and
  skill surfaces, and keeps external itch.io publication blocked until the
  URL/upload evidence is recorded.
- `v0.0.011` is the Producer mechanics/art integration build. It doubles the
  field and courtyard footprint, starts authoritative time at 06:00 sunrise,
  rotates sun/moon from server day time, randomizes weather every 60-120s,
  adds dawn birds/day traffic audio and moving cars, adds sprint/stamina/
  exhaustion/jump plus foot/hand/head attacks that can drain player stamina,
  makes the ball bouncier for headers, adds thicker posts/crossbars with
  explicit rebound handling, removes the old camera-attached central blob, adds
  local-only visual cloth ripples for goal nets, and loads 10 local Free3D
  Online LowPoly 1k soccer-ball GLBs optimized to textureless vertex colors for
  the sideline ball rack.
- `v0.0.012` is the local lighting/weather correction build. It keeps the
  current scene size, uses server day time even when `qaTime=0` is present,
  makes 04:00-20:00 the bright daytime window, limits dark hours to 20:00-04:00,
  removes the old visible sun-path debug line from gameplay, prevents clear
  weather from showing precipitation particles, and makes rain/snow rare in
  the 60-120s weather rotation. It also replaces the simple net ripple with a
  client-only Verlet cloth grid, shows the active Free3D/vertex-color GLB ball
  on the field while removing that variant from the sideline rack, aligns the
  visible goal posts with the thicker server colliders, and acceptance-tests
  post rebounds plus the bouncier ball tuning for headers.
- `v0.0.013` is the rigged-character correction build. Runtime players use the
  local Free3D Online `6300420` skinned GLB, optimized from 10.73 MB raw to
  2.09 MB runtime with `KHR_mesh_quantization`, via `GLTFLoader`,
  `SkeletonUtils.clone`, and per-player `AnimationMixer`. The primitive
  procedural footballer is now only a loading/error fallback.
- `v0.0.014` is the textured-character correction build. Runtime players use
  the different Free3D `6299851/rigged_unity.glb` with WebP albedo/normal/ORM
  maps applied at load time and separate FBX clips for `idle`, `walk`, `run`,
  and `jump`, avoiding the previous single 44s `all_animations` clip autoplay.
- `v0.0.015` is the character-controller extraction build. Runtime players use
  `client/src/character-controller.ts` for reusable Free3D GLB/FBX loading,
  velocity-driven idle/walk/run/jump transitions with hysteresis and time
  scaling, and procedural bone-IK overlays for foot, hand, head, body, and jump
  strikes. `client/character-controller-test.html` is the local standalone
  validation page. The build also extends the authoritative day cycle to 300
  seconds, shortens true dark hours to 23:00-03:00 with twilight ramps at
  03:00-05:00 and 21:00-23:00, and adds four night-only floodlight masts with
  local volumetric beam meshes.
- `v0.0.016` thins goal posts/crossbars to half the previous radius, uses
  neutral post material instead of team-yellow/blue paint, scores goals only
  when the ball crosses the front goal-line plane from the field side, rejects
  back-net entries, and adds visible center-circle, center-spot, penalty-box,
  goal-area, and penalty-spot field markings.
- `v0.0.017` adds the local-player stamina HUD meter with ready/recovering/low/
  sprint/exhausted states, QA datasets for local stamina, and a longer orange
  hand-strike visual trail plus hand-action QA datasets.
- `v0.0.017` character input/strike correction uses middle mouse button for
  head hits, keeps mouse wheel from triggering attacks, sends foot/hand ball
  impulses forward along player yaw while preserving the limb-specific contact
  point, and alternates hand-hit visuals/contact side without adding a new
  network `KickKind`.
- `v0.0.018` camera correction keeps the runtime camera anchored to the
  controlled player, applies smoothed velocity lead for dynamic movement,
  removes ball-driven camera drift, and renders a large ball arrow plus smaller
  player arrows when targets are outside the camera view.
- `v0.0.018` character roster extension keeps `client/src/character-controller.ts`
  as the reusable loader/controller, expands local runtime characters to 11
  entries, and makes `client/character-controller-test.html` cycle the roster
  by arrow keys plus UI. Free3D entries use local 1k `rigged_unity.glb`, WebP
  albedo/normal/ORM maps, and separate FBX `idle`/`walk`/`run`/`jump` clips;
  AutoRig task entries may use a local textured `animations.glb` plus local FBX
  preview clips when full bundle/download endpoints are locked.
- `v0.0.019` goal-net correction keeps the net local-only but closes the goal
  cage visually with separate back, roof, left-side, and right-side Verlet
  panels per goal; `data-goal-net-panels` should be `8` for two goals.
- `v0.0.020` ball-size correction halves the shared authoritative
  `BALL_RADIUS` from `0.48` to `0.24`; do not scale only the mesh, because the
  server collider, scoring heights, contacts, and acceptance fixtures must stay
  consistent with the visible ball. Browser QA exposes this as
  `data-ball-radius="0.24"`.
- `v0.0.021` changes post-goal flow and half-size ball tuning. A scored goal
  opens a 5-second team celebration phase, blocks normal ball kicks during the
  reset sequence, then moves the ball back to kickoff over a 1-second
  server-authored flight before starting the kickoff countdown. `ServerState`
  exposes `goalReset.phase`, `remainingMs`, and `returnProgress`; browser QA
  mirrors this through `data-goal-reset-*`. The half-size ball keeps
  `BALL_RADIUS=0.24` but uses `BALL_DENSITY=3.6` and lower foot/hand/head/body
  impulses so normal hits no longer launch it like a runaway projectile.
- `v0.0.022` retargets Free3D character hand-strike IK: alternating hand hits
  keep logical left/right debug side, compensate the current roster's mirrored
  arm bones, and drive the punch forward at upper-chest/shoulder height.
  Runtime fallback hand-hit flash/trail targets must stay raised to match.
- `v0.0.022` also smooths keyboard movement at the authoritative server level:
  raw WASD axes are ramped, released axes decay instead of disappearing, the
  opposite active axis uses a faster takeover rate, and controlled movement
  velocity accelerates/brakes smoothly. Client prediction mirrors these
  constants and browser QA exposes `data-movement-smoothing`,
  `data-local-move-speed`, and `data-local-move-axis`.
- `v0.0.023` assigns player avatars through a server-side shuffled
  non-repeating deck sourced from `CHARACTER_ROSTER`. Do not overwrite
  `player.characterId` during role/team rebalancing; the assignment should stay
  stable for that runtime player.
- `v0.0.024` makes the player ground indicator a team marker: the ring and
  subtle ground halo use the current team color, and local browser QA exposes
  `data-local-team-marker` plus `data-local-team-marker-color`.
- `v0.0.024` adds a distinct `jumpRun` controller state for sprint/high-velocity
  jumps. Until a dedicated run-jump FBX is present in the runtime roster,
  `jumpRun` clones the normal jump clip and applies a stronger forward-leap IK
  overlay exposed through `data-player-rig-jump-style=run`.
- `v0.0.025` camera correction follows a lerped authoritative player offset,
  not skinned mesh or bone transforms, and derives dynamic lead from smoothed
  measured anchor velocity. Browser QA exposes
  `data-camera-anchor-smoothing`, `data-camera-anchor-offset`, and
  `data-camera-follow-speed`.
- `v0.0.025` adds server-authored `player.ragdoll`/`ragdollAt` when stamina
  reaches zero. Sprint exhaustion preserves previous movement inertia;
  stamina-emptying hits apply heavy knockback/lift; local prediction must not
  override ragdoll snapshots; browser QA exposes `data-player-rig-ragdoll` and
  `data-local-player-ragdoll`.
- `v0.0.026` widens night floodlight coverage: four masts keep local volumetric
  cone meshes but use a wider SpotLight angle, broader beam radius, per-mast
  white-temperature variation, and subtle deterministic flicker. Browser QA
  exposes `data-stadium-light-beam-angle`, `data-stadium-light-beam-radius`,
  `data-stadium-light-palette`, and `data-stadium-light-flicker`.
- `v0.0.027` makes player-ball contact height-aware: body bumps require
  vertical body overlap, foot/hand/head hits require vertical reach, and
  acceptance guards that jumps can clear the ball while unreachable high balls
  cannot be played by head input.
- `v0.0.028` extends the residential courtyard through
  `client/src/environment-props.ts`: it keeps the playable field bounds
  unchanged, adds outer roads/sidewalks/garden pockets, places 100+ procedural
  environment instances, and hydrates 8 local Free3D environment GLB assets
  from `client/public/assets/environment/free3d/roster.json`. Browser QA
  exposes `data-environment-model-instances`,
  `data-procedural-environment-instances`,
  `data-free3d-environment-instances`,
  `data-free3d-environment-asset-count`, and
  `data-free3d-environment-loaded`.
- `v0.0.029` doubles ordinary foot/hand/head ball-hit power and adds
  server-authored LMB left-foot charge from 2x tap power to 4x full power over
  one second. Held charge can fire once on ball contact before release, and
  browser QA exposes `data-local-kick-charge` plus
  `data-local-kick-charge-held`.
- `v0.0.029` also widens gameplay camera framing and adds visible sideline
  pennant/bench strips so the dense v0.0.028 courtyard dressing is visible in
  normal play while the playable pitch remains clear.
- `v0.0.030` makes striking more user-friendly without raising raw kick power:
  foot/hand/head ball hits have player-centered assist reach, LMB/left-foot
  clicks buffer for a short contact window, active strike inputs suppress
  same-frame passive body bump, and body-only ball contact uses a smaller,
  softer, less frequent nudge.
- `tools/unsoccer_acceptance.mjs` derives the expected version from
  `package.json.games.unsoccer.version`; keep it that way so version bumps do
  not require multiple acceptance edits.
- `npm run package:unsoccer` rebuilds before creating `dist/unsoccer-itch.zip`;
  do not replace it with a source-less zip step that can reuse stale dist.
- Server-confirmed left-foot, hand, head, jump, and body contacts must stay
  visually distinguishable in the client and expose QA-readable
  `data-last-action-*` fields on `document.documentElement`.
- `v0.0.003` server acceptance uses `UNSOCCER_TEST_MODE=1` only on an isolated
  local port. Never expose `/api/test/*` on a production multiplayer server.
- Run `npm run test:unsoccer:acceptance` before claiming spectator assignment,
  kick/body contacts, goal/reset behavior, or server-authored audioEvents are
  ready.
- Keep the itch.io package static. The zip contains the built client only; live
  multiplayer requires a separately deployed HTTPS/WebSocket server.
- Production uses `/unsoccer/socket/` as the WebSocket proxy path with the
  server's built-in Node `http`/`net`/`crypto` handshake and frame handling.
  Do not reintroduce geckos.io, `ws`, or native `node-datachannel` as required
  production transport dependencies on the Qwertystock host.
- Treat `index.html` as a UI Designer-owned public surface for catalog
  continuity, prototype status, itch.io page direction, and safe local-server
  presentation. It must never expose a directory listing.

## Free3D Asset Contract

- Use only the documented Free3D direct-download API with an explicit
  `FREE3D_API_TOKEN`/`F3D_API_TOKEN`, or tokenless public LowPoly 1k worker
  inventory files whose exact `paths.json` relative path is recorded.
- Do not guess asset paths or depend on remote assets at runtime.
- Runtime `.glb` assets must be optimized, textureless where possible, and
  documented with source GUID, model URL, inventory URL, direct worker URL,
  format, LOD, relative path, bytes, and download timestamp.
- Soccer-ball sources live under `assets/models/balls/free3d/raw`; optimized
  runtime GLBs and `roster.json` live under `client/public/assets/balls/free3d`.
- Free3D character runtime provenance lives in
  `assets/models/characters/roster.json`,
  `assets/licenses/free3d-provenance.json`, and
  `client/public/assets/characters/free3d/roster.json`.
- Character roster entries must stay synchronized with
  `shared/src/index.ts::CHARACTER_ROSTER`; do not add a character id there until
  the public roster entry, local textures, and local FBX clips are present.
- AutoRig task character provenance should record the canonical `/task?id=...`
  page, `/api/task/...` metadata, `/animations.glb` source, whether
  `/bundle.zip` or direct animation downloads were locked, and which local FBX
  preview clips were shipped.
