# Ragdoll Soccer II Itch.io Page Copy

Use this as paste-ready draft copy for the Ragdoll Soccer II itch.io project
page.

## Project Fields

Title:
`Ragdoll Soccer II`

Short description:
`Courtyard ragdoll soccer with charged kicks, weird rules, stamina, jumps, and fights.`

Classification:
`Game`

Kind of project:
`HTML`

Release status:
`In development`

Version:
`v0.0.029`

Suggested tags:
`soccer`, `football`, `multiplayer`, `physics`, `ragdoll`, `html5`, `browser`,
`sports`, `fighting`, `prototype`

## Short Positioning

`Backyard football with nonstandard rules and fights: charge the left-foot kick,
throw hand and head hits, manage stamina, jump into chaos, and watch exhausted
players ragdoll across a residential courtyard.`

## Long Description

`Ragdoll Soccer II is HTML5 multiplayer courtyard football where the match is
less about clean tactics and more about physical control: charged kicks, limb
hits, stamina, jumps, knockdowns, ragdoll recoveries, and goals that come from
messy server-backed physics. The field sits inside a dense residential block,
with apartment-courtyard props, weather, floodlights, audio ambience, and a
small-team street-match mood.`

`The rules are intentionally not standard football. LMB charges a left-foot
shot, ordinary foot/hand/head contacts hit harder in v0.0.029, RMB throws hand
strikes, the mouse wheel triggers head hits, Shift drains stamina for sprinting,
Space jumps, and stamina-emptying hits can send a player into ragdoll. The
first four connections join the match as players; later connections spectate.`

`Important HTML5 note: the itch.io upload is a static browser client. Live
multiplayer uses the deployed authoritative game server through WebSocket with
HTTP polling fallback. If that live server is unavailable or blocked from the
itch.io frame, the client may load without a playable shared match.`

## Controls

Move:
`W` / `A` / `S` / `D`

Sprint:
Hold `Shift`; stamina drains while sprinting and recovers when you slow down.

Jump:
`Space`

Charged left-foot kick:
Hold `LMB` to charge for up to one second, then release or touch the ball to
fire. v0.0.029 scales from 2x tap power to 4x full charge power.

Hand strike:
`RMB`

Head hit:
Mouse wheel

Players:
The first four connected clients play. Additional clients join as spectators.

## Feature Notes

- HTML5 client packaged with `index.html` at the zip root.
- Static itch.io upload uses the live multiplayer server for real matches.
- Separate authoritative Node/Rapier server owns physics, teams, stamina,
  ragdoll state, ball hits, goals, and reset flow.
- Courtyard football setting with dense residential environment dressing,
  day/weather lighting, floodlights, cars/props, and game-audio ambience.
- Nonstandard contact rules: stronger foot/hand/head ball hits, player stamina
  damage, exhaustion, jump hits, ragdoll knockdowns, and bouncy physics goals.
- v0.0.029 local browser evidence records visible badge `v0.0.029 / 83.79 MB`
  and charge QA fields in
  `tester/checks/2026-07-02-unsoccer-v0.0.029-kick-charge/browser-qa.json`.
- External itch.io publication is not complete until the public itch URL,
  uploaded zip, exact live page copy, screenshots, and embed smoke notes are
  recorded in `itch-publication-ledger.md`.

## Credits And Licenses

- Game source: `eschota/itch_games`.
- Rendering: Three.js client.
- Physics/server prototype: Rapier3D and built-in browser/server transports.
- Runtime character, environment, and audio asset provenance is tracked inside
  the repository; confirm the final license display before external
  publication.

## External Links

Confirmed repo-local links only:

Local public catalog:
`https://io-games.mecharulez.com/`

Local public prototype page:
`https://io-games.mecharulez.com/unsoccer/`

Project chat:
`https://io-games.mecharulez.com/ai_chat/`

External itch.io project URL:
Not recorded in this repository yet.

## Publishing Notes

- Current repo-local UnSoccer target is `v0.0.029`; `package.json` and
  `package.json.games.unsoccer.version` both record `v0.0.029`.
- `dist/unsoccer-itch.zip` exists locally for the orchestrator publication
  step, but this document does not claim it has been uploaded to itch.io.
- Do not claim the external itch.io page is live or complete until the external
  URL, uploaded zip, exact live copy, screenshots, and desktop/mobile embed
  smoke are recorded in `itch-publication-ledger.md`.
