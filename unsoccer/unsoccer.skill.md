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
- `server/`: Node authoritative game server using the MavonEngine stack shape:
  headless simulation, Rapier3D physics, and WebSocket transport.
- `shared/`: protocol constants, message types, and gameplay tuning shared by
  client and server.
- `assets/`: final local runtime assets and license/provenance manifests.

## Rules

- Current release: `v0.0.014`.
- Keep client and server separated; browser bundles must not import server-only
  modules.
- The server is authoritative for room assignment, teams, player physics, ball
  physics, goals, score, and reset after goal.
- First 4 connected clients are active players. Additional clients up to 32 are
  spectators/testers so QA can observe without displacing a player.
- Controls: WASD movement, `Shift` sprint, `Space` jump, left mouse foot kick,
  right mouse hand hit, mouse wheel head hit.
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
