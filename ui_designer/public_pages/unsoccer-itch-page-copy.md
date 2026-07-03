# Ragdoll Soccer II Itch.io Page Copy

Use this as the source-of-truth copy for the public Ragdoll Soccer II itch.io
project page.

## Project Fields

Title:
`Ragdoll Soccer II`

Project URL:
`https://eschotagmailcom.itch.io/ragdoll-soccer-ii`

Short description:
`Browser ragdoll soccer with bots, charged shots, stamina, knockdowns, and messy courtyard physics.`

Classification:
`Game`

Kind of project:
`HTML`

Release status:
`Prototype`

Version:
`v0.0.053`

Suggested tags:
`football`, `physics`, `browser`, `fighting`, `sports`, `soccer`, `ragdoll`,
`html5`, `multiplayer`, `prototype`

## Short Positioning

`Street-football chaos in a browser: sprint, kick, jump, shove, ragdoll, and
fight bots for the ball on a live server-backed 3D pitch.`

## Long Description

`Ragdoll Soccer II is a browser HTML5 physics soccer prototype about messy
street-football control: chase the ball, charge shots, sprint until stamina
bites back, jump into tackles, and knock players into ragdoll chaos.`

`The match runs on a live authoritative server with WebSocket plus HTTP polling
fallback. The itch.io build is the static browser client; for real multiplayer
it connects to the deployed game server.`

`Current build: v0.0.053. This release keeps the ten-player bot fill visible,
fixes point-blank overlap strikes, supports possession shots with LMB + Shift,
keeps stamina drain tied to sprinting and incoming damage, and adds the
itch-hosted production server fallback.`

## Controls

Move:
`W` / `A` / `S` / `D`

Sprint / strong shot modifier:
Hold `Shift`.

Jump:
`Space`

Left-foot kick / possession shot:
`LMB`

Hand strike:
`RMB`

Head hit:
Mouse wheel / middle mouse input path in the in-game HUD.

Players:
The first connected players join the pitch; extra clients can spectate.

## Feature Notes

- HTML5 client packaged with `index.html` at the zip root.
- Itch.io page embeds the butler `html5` channel.
- Separate authoritative Node/Rapier server owns physics, teams, stamina,
  ragdoll state, ball hits, goals, and reset flow.
- The itch-hosted static client defaults to the production server at
  `https://io-games.mecharulez.com/unsoccer/` when running from
  `html-classic.itch.zone`.
- Courtyard football setting with dense environment dressing, weather,
  floodlights, audio ambience, bots, player emotions, and HUD settings.
- Nonstandard contact rules: foot/hand/head hits, player stamina damage,
  exhaustion, jump hits, ragdoll knockdowns, and bouncy physics goals.

## Credits And Licenses

- Game source: `eschota/itch_games`.
- Rendering: Three.js client.
- Physics/server prototype: Rapier3D and built-in browser/server transports.
- Runtime character, environment, and audio asset provenance is tracked inside
  the repository; keep final license display reviewed before store expansion.

## External Links

Public itch.io project:
`https://eschotagmailcom.itch.io/ragdoll-soccer-ii`

Local public catalog:
`https://io-games.mecharulez.com/`

Local public prototype page:
`https://io-games.mecharulez.com/unsoccer/`

Project chat:
`https://io-games.mecharulez.com/ai_chat/`

## Publishing Notes

- Public itch.io project id: `4740079`.
- Butler target: `eschotagmailcom/ragdoll-soccer-ii:html5`.
- Current uploaded build: upload `#18187910`, build `#1768248`, version
  `v0.0.052`.
- Next repo build target for upload is `v0.0.053`; upload it with butler before
  claiming the public itch.io page is on `v0.0.053`.
- Current embed setting: 960 x 540, fullscreen enabled, mobile-friendly enabled,
  autostart disabled.
- Cover/screenshots still need manual media upload or an itch media API path;
  the current browser automation can edit text/settings but cannot choose local
  files in itch.io upload dialogs.
