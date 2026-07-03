# Ragdoll Soccer II Public Pages Brief

Use this brief when designing or reviewing any public page tied to `unsoccer`.

## Owned Surfaces

- Local catalog: `https://io-games.mecharulez.com/` and source `index.html`.
- Public prototype page: `https://io-games.mecharulez.com/unsoccer/` and
  source `unsoccer/index.html`.
- Browser client shell: `unsoccer/client/index.html`.
- Itch.io HTML5 game page: external publishing surface using
  `dist/unsoccer-itch.zip` after `npm run build:unsoccer`.
- Promoted copy source: `unsoccer/meta.json` stores RU/EN marketing text for
  the catalog, `/unsoccer/`, and external store listings.

## Page Direction

- First signal: `Ragdoll Soccer II`, with `unsoccer` as the project key.
- Visual signal: the VK/store-art poster family with blue/orange teams, ball
  impact, stadium lights, and contact energy; do not fall back to the old
  CSS-only placeholder field on public store-facing surfaces.
- Primary status: playable client requires a separately deployed multiplayer
  server; never hide that constraint on public pages.
- Version: local source/build target is `v0.0.054`; external public/itch copy
  must wait until route, package, API/server health, screenshots, media upload,
  and ledger evidence all match that same version.
- Tone: player-facing, prototype-forward, clear, and not apologetic. Visible
  public HTML must not explain the UI handoff, art-prep process, source folders,
  or agent workflow.

## Itch.io Page Copy Source

Primary reusable copy now lives in `unsoccer/meta.json`. Use this section only
as paste-ready context for itch.io fields and keep it aligned with the JSON.

Title:
`Ragdoll Soccer II`

Short description:
`A browser multiplayer soccer prototype with ragdoll players and physics goals.`

Long description:
`Ragdoll Soccer II is an HTML5 multiplayer soccer prototype built around
authoritative physics, bots, spectator slots, team goals, and a static browser
client. The itch.io build contains the client; live multiplayer requires the
deployed game server. The v0.0.054 source target includes RU/EN player-facing
localization, the current HUD/settings work, and the VK-derived store art pack.`

Suggested tags:
`soccer`, `football`, `multiplayer`, `physics`, `html5`, `browser`, `prototype`

## Visual Checklist

- Catalog and `/unsoccer/` use the same VK-derived store art language, blue
  team, orange team, ball-impact focal point, and warm highlight accents.
- The in-game UI and public page both expose the same target version and do not
  contradict the itch publication ledger.
- The page must not expose repository directories, source files, or skill docs.
- The prototype status is visible before a player expects a live match.
- Text remains inside buttons and panels at mobile widths.
- Page cards keep an 8px radius or less.
- Public runtime page art belongs under `unsoccer/store-assets/`; UI Designer
  working assets stay under `ui_designer/public_pages/`.

## Acceptance

- `/unsoccer/` returns a public page, not a directory listing.
- Desktop and mobile catalog views show Ragdoll Soccer II with a visible preview
  and action.
- `npm run build:unsoccer` must pass before packaging the itch build.
- `python3 tools/package_itch.py unsoccer` must produce a zip with `index.html`
  at root and no internal skill/agent/deploy docs.
- If the external itch.io page is changed manually, record the exact published
  copy, screenshots, and date in this folder.
