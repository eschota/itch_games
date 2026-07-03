# Ragdoll Soccer II Itch.io Page Copy

Use `../../unsoccer/meta.json` as the reusable RU/EN source of truth for public
Ragdoll Soccer II copy. This file stays as paste-ready itch.io field context
for the next public page refresh and must not diverge from the JSON.

## Project Fields

Title:
`Ragdoll Soccer II`

Project URL:
`https://eschotagmailcom.itch.io/ragdoll-soccer-ii`

Short description:
`Browser ragdoll soccer with bots, charged shots, stamina, knockdowns, RU/EN UI, and messy courtyard physics.`

Classification:
`Game`

Kind of project:
`HTML`

Release status:
`Prototype`

Version:
`v0.0.054`

Suggested tags:
`football`, `physics`, `browser`, `sports`, `soccer`, `ragdoll`, `html5`,
`multiplayer`, `prototype`, `bots`

## Short Positioning

`Full-contact arcade football in a browser: sprint, charge shots, jump into
tackles, ragdoll, and fight bots for the ball on a live server-backed 3D pitch.`

## Long Description

`Ragdoll Soccer II is a browser HTML5 physics soccer prototype about messy
street-football control: chase the ball, charge shots, sprint until stamina
bites back, jump into tackles, and knock players into ragdoll chaos.`

`The match runs on a live authoritative server with WebSocket plus HTTP polling
fallback. The itch.io build is the static browser client; for real multiplayer
it connects to the deployed game server.`

`Current source target: v0.0.054. This version adds automatic RU/EN player-facing
localization based on device/browser language, keeps generated English players
named Player instead of Russian text, and preserves the v0.0.053 itch-hosted
production server fallback.`

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
Middle mouse button.

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
  floodlights, audio ambience, bots, player emotions, chat, and HUD settings.
- Nonstandard contact rules: foot/hand/head hits, player stamina damage,
  exhaustion, jump hits, ragdoll knockdowns, and bouncy physics goals.

## Media Refresh Pack

- Itch cover: `ui_designer/public_pages/unsoccer-itch-assets/cover-630x500.png`.
- Embed background: `ui_designer/public_pages/unsoccer-itch-assets/embed-background-1280x720.png`.
- First gallery visual: `ui_designer/public_pages/unsoccer-itch-assets/screenshot-01-vk-art-1280x720.png`.
- Motion preview source: `unsoccer/store-assets/gameplay-preview-342x190.webm`.
- Public runtime page art: `unsoccer/store-assets/`.

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
- Current live uploaded build before this visual refresh: upload `#18187910`,
  build `#1768259`, version `v0.0.053`.
- Next upload target: `v0.0.054` after the orchestrator rebuilds/packages and
  publishes through butler.
- Current embed setting: 960 x 540, fullscreen enabled, mobile-friendly enabled,
  autostart disabled.
- Live full description previously needed manual restoration from this file.
  Recheck after the next dashboard save because the itch Redactor field did not
  persist reliably through the earlier Browser automation.
- Cover/background/gallery media from the refresh pack still need external
  itch.io upload and verification.
