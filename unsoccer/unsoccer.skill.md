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

- Current release: `v0.0.003`.
- Keep client and server separated; browser bundles must not import server-only
  modules.
- The server is authoritative for room assignment, teams, player physics, ball
  physics, goals, score, and reset after goal.
- First 4 connected clients are active players. Additional clients up to 32 are
  spectators/testers so QA can observe without displacing a player.
- Controls: WASD movement, left mouse kick, right mouse kick, mouse wheel head
  hit.
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
- Server-confirmed left-foot, right-foot, head, and body contacts must stay
  visually distinguishable in the client and expose QA-readable
  `data-last-action-*` fields on `document.documentElement`.
- `v0.0.003` server acceptance uses `UNSOCCER_TEST_MODE=1` only on an isolated
  local port. Never expose `/api/test/*` on a production multiplayer server.
- Run `npm run test:unsoccer:acceptance` before claiming spectator assignment,
  kick/body contacts, or goal/reset behavior is ready.
- Keep the itch.io package static. The zip contains the built client only; live
  multiplayer requires a separately deployed HTTPS/WebSocket server.
- Production uses `/unsoccer/socket/` as the WebSocket proxy path. Do not
  reintroduce geckos.io as a required production dependency on the Qwertystock
  host; its native `node-datachannel` addon is not compatible with that target.
- Treat `index.html` as a UI Designer-owned public surface for catalog
  continuity, prototype status, itch.io page direction, and safe local-server
  presentation. It must never expose a directory listing.

## Free3D Asset Contract

- Use only the documented Free3D direct-download API and an explicit
  `FREE3D_API_TOKEN` environment variable.
- Do not guess asset paths or depend on remote assets at runtime.
- Runtime character assets should be optimized `.glb` files with documented
  source GUID, format, LOD, license/provenance, and download timestamp.
- Until per-model provenance is confirmed, ship procedural placeholder players
  and keep Free3D candidates in `assets/models/characters/roster.json`.
