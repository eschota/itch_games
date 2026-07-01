# Ragdoll Soccer II Itch.io Page Copy

Use this as paste-ready draft copy for the Ragdoll Soccer II itch.io project
page.

## Project Fields

Title:
`Ragdoll Soccer II`

Short description:
`A browser multiplayer soccer prototype with ragdoll players, physics goals, and server-backed chaos.`

Classification:
`Game`

Kind of project:
`HTML`

Release status:
`In development`

Version:
`v0.0.010` draft target only after the public route badge/meta, uploaded
package, API health, screenshots, and QA evidence all agree. Verification
snapshots are recorded in `itch-publication-ledger.md`; infrastructure-only or
partial release commits may advance without making that version safe for store
copy.

Suggested tags:
`soccer`, `football`, `multiplayer`, `physics`, `ragdoll`, `html5`, `browser`,
`prototype`

## Long Description

`Ragdoll Soccer II is an HTML5 multiplayer soccer prototype about physical
collisions, team goals, and messy server-backed ball control. The first four
connections join as players, later connections can spectate, and the match
state is driven by a separate authoritative Node/Rapier server with WebSocket
transport and HTTP polling fallback.`

`The itch.io upload contains the static browser client. Live multiplayer needs
the deployed game server or an explicit server URL supplied by the page/build
configuration. Treat the current page as a prototype listing until the package,
production route, and multiplayer server URL strategy all agree on the same
version.`

## Controls

Movement:
`W` / `A` / `S` / `D`

Kicks:
Left mouse kicks with the left foot. Right mouse kicks with the right foot.

Head hit:
Mouse wheel triggers a head hit.

Players:
The first four connected clients play. Additional clients join as spectators.

## Feature Notes

- HTML5 client packaged with `index.html` at the zip root.
- Separate authoritative multiplayer server for physics, teams, goals, and
  reset flow.
- Public page must state the server requirement before players expect a live
  match.
- Version/status copy must stay synchronized with the uploaded zip and the live
  production route.
- Full HUD/settings/remapping UI is implemented and carried into local runtime
  target `v0.0.010` with layout evidence in
  `unsoccer-ui-final-local-gate-v0.0.010-rerun.json`, but external itch.io copy
  must wait for uploaded package, live route proof, and synchronized visible
  runtime badge evidence.

## Credits And Licenses

- Game source: `eschota/itch_games`.
- Rendering: Three.js client.
- Physics/server prototype: Rapier3D and built-in browser/server transports.
- Runtime character assets are procedural placeholders unless a local asset
  provenance file says otherwise.

## External Links

Local public catalog:
`https://io-games.mecharulez.com/`

Local public prototype page:
`https://io-games.mecharulez.com/unsoccer/`

Project chat:
`https://io-games.mecharulez.com/ai_chat/`

## Publishing Notes

- Last recorded production snapshot is split as of 2026-07-01 at 13:34 UTC:
  API/server report `v0.0.008`, but public `/unsoccer/` HTML meta and visible
  badge still show `v0.0.007`.
- `v0.0.010` must not be used in external itch.io fields until public
  `/unsoccer/` HTML/meta, the visible badge, `/unsoccer/api/health`, the
  uploaded package, screenshots, and QA evidence all show the same `v0.0.010`
  game release.
- Current local source/build metadata targets `v0.0.010`. Local UI/Tester/Art
  browser gates passed after rebuild. Do not publish that version externally
  until it is committed, pushed, autodeployed, re-packaged, and verified against
  the public route, visible badge, API health, and screenshots.
- External itch.io project URL is not recorded yet.
