# Orbital Courier Public Pages Brief

Use this brief when designing or reviewing any public page tied to Orbital
Courier.

## Owned Surfaces

- Local catalog: `https://io-games.mecharulez.com/` and source `index.html`.
- Local game entry: `https://io-games.mecharulez.com/orbital-courier/` and
  source `orbital-courier/index.html`.
- Itch.io HTML5 game page: external publishing surface using
  `dist/orbital-courier-itch.zip`.
- Itch.io embed frame: game must stay readable and controllable inside the
  itch.io iframe.

## Page Direction

- First signal: `Orbital Courier`, not a generic repository label.
- Visual signal: show a real or faithful game-state preview with courier, core,
  and debris before long copy.
- Primary action: one clear play action above secondary links.
- Version: show `v0.0.006` where it helps QA and public support.
- Tone: short arcade copy, not a tutorial wall.

## Itch.io Page Copy Source

Canonical paste-ready fields live in
`orbital-courier-itch-page-copy.md`. Use this section only as the short design
source.

Title:
`Orbital Courier`

Short description:
`Collect energy cores, dodge debris, and keep the courier alive.`

Long description:
`Orbital Courier is a compact HTML5 arcade run about reading the lane, grabbing
cyan energy cores, and surviving red debris for a higher score. It runs in the
browser with keyboard, mouse, or touch input.`

Suggested tags:
`arcade`, `html5`, `browser`, `threejs`, `space`, `score-attack`

## Visual Checklist

- Catalog, game entry, and itch.io page use the same dark space base with cyan
  core, red debris, warm yellow accent, and off-white ship/readout colors.
- Page cards keep an 8px radius or less.
- Text remains inside buttons and cards at mobile widths.
- No public page relies on viewport-width font scaling.
- Screenshots or previews must reveal actual gameplay state, not only an
  abstract background.

## Acceptance

- Desktop and mobile catalog view show the game title, preview, and play action
  without overlap.
- Game entry still auto-starts and keeps the version badge visible.
- Itch package still contains `index.html` at zip root.
- Itch package contains `vendor/three.module.js` and does not require
  `cdn.jsdelivr.net` for Three.js at runtime.
- Itch package contains only the player-facing runtime files and license, not
  internal agent skill or coordination docs.
- Final storefront assets exist under `orbital-courier-itch-assets/`.
- Publishing checklist is updated in
  `orbital-courier-itch-publishing-checklist.md`.
- If the external itch.io page is changed manually, record the exact published
  copy, screenshots, and date in this folder.

## Itch.io Source References

- Creator getting started:
  https://itch.io/docs/creators/getting-started
- HTML5 uploads:
  https://itch.io/docs/creators/html5
- Designing your page:
  https://itch.io/docs/creators/design
- CSS customization guide:
  https://itch.io/docs/creators/css-guide
