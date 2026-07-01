# Itch.io Publication Ledger

Use this ledger as the single source for external itch.io page publication
status. A public page is not complete until the external URL, uploaded zip,
exact live copy, screenshots, publication date, and version match are recorded
here and in the per-game checklist.

## Current Local Publication Target

Checked from the working copy on 2026-07-02 during the UI Designer copy pass.
This is repo-local publication preparation, not proof that the external itch.io
page has been changed.

| Surface | Evidence | Status |
| --- | --- | --- |
| UnSoccer source/build target | `package.json` and `package.json.games.unsoccer.version` record `v0.0.029` | Use `v0.0.029` for the prepared itch.io copy |
| UnSoccer upload package | `dist/unsoccer-itch.zip` exists locally | Ready for orchestrator upload step; not verified as uploaded to itch.io |
| UnSoccer v0.0.029 QA | `tester/checks/2026-07-02-unsoccer-v0.0.029-kick-charge/browser-qa.json` records visible badge `v0.0.029 / 83.79 MB`, WebSocket transport, `data-local-kick-charge`, and `data-local-kick-charge-held` | Local browser evidence supports the v0.0.029 copy claims |
| Static HTML5 contract | Itch upload is a static browser client and uses the live authoritative multiplayer server for real matches | Keep this warning visible on the itch page |
| External itch.io | Public itch.io URL is not recorded | Do not claim external publication complete |

## Historical Production Evidence

Checked on 2026-07-01 at 13:34 UTC. This older snapshot is retained for audit
history only and no longer blocks the prepared `v0.0.029` copy by itself.

The public UnSoccer version was split at that time: API/server reported
`v0.0.008`, while raw public page HTML/meta and the visible badge still showed
`v0.0.007`. Any external publish still needs a fresh route/package/embed check
by the orchestrator before it is called live.

| Surface | Evidence | Status |
| --- | --- | --- |
| IO Games catalog | `https://io-games.mecharulez.com/` is the local-server catalog | Keep game cards synchronized with the live routes before external publishing |
| Orbital Courier route | `https://io-games.mecharulez.com/orbital-courier/` showed `v0.0.006` | Historical live local-server game route evidence |
| UnSoccer route | `https://io-games.mecharulez.com/unsoccer/` served built client asset `index-DIqAWeep.js`, but raw HTML meta and visible `#version-badge` still showed `v0.0.007` | Historical split evidence only |
| UnSoccer API | `/unsoccer/api/health` returned JSON `version=v0.0.008` with websocket/http transports enabled | Historical multiplayer server evidence only |
| AI chat health | `/ai_chat/api/status` reported `project_version=v0.0.008`, `main@fba16d3`, `dirty=false` | Historical deploy metadata only |

## Game Publication Records

### Orbital Courier

- Local production URL: `https://io-games.mecharulez.com/orbital-courier/`.
- Current live local version: `v0.0.006`.
- Upload package: `dist/orbital-courier-itch.zip`.
- Page copy: `orbital-courier-itch-page-copy.md`.
- Publish checklist: `orbital-courier-itch-publishing-checklist.md`.
- Storefront assets: `orbital-courier-itch-assets/`.
- External itch.io project URL: not recorded.
- Publication status: repo-side assets and copy are prepared; external itch.io
  publication is unverified until the URL and live page evidence are recorded.

Required final evidence:

- Public itch.io URL.
- Uploaded zip filename and version.
- Exact live page copy or a dated note that it matches
  `orbital-courier-itch-page-copy.md`.
- Screenshots used on the itch page.
- Desktop/mobile embedded-game smoke notes.

### Ragdoll Soccer II

- Local production URL: `https://io-games.mecharulez.com/unsoccer/`.
- Current repo-local publication target: `v0.0.029`.
- Current external itch.io publication status: not published/verified in this
  ledger.
- Upload package: `dist/unsoccer-itch.zip`.
- Page copy: `unsoccer-itch-page-copy.md`.
- Publish checklist: `unsoccer-itch-publishing-checklist.md`.
- Storefront assets: `unsoccer-itch-assets/`.
- UI/settings redesign brief: `unsoccer-ui-settings-redesign-v0.0.008.md`.
- UI/settings runtime evidence:
  `unsoccer-ui-final-local-gate-v0.0.010-rerun.json` and matching viewport
  screenshots.
- Current Tester release evidence:
  `tester/checks/2026-07-02-unsoccer-v0.0.029-kick-charge/browser-qa.json`.
- External itch.io project URL: not recorded.
- Publication status: draft copy/checklist are prepared for `v0.0.029`;
  external itch.io publication is still unverified until the ledger records the
  external URL, uploaded zip, exact live copy, screenshots, embed smoke, and
  multiplayer server URL strategy.

Required final evidence:

- Public itch.io URL.
- Decided published version: `v0.0.029`.
- Uploaded zip filename and version.
- Multiplayer server URL strategy: embedded production endpoint, documented
  `?server=` tester flow, or explicitly static-only prototype status.
- Visible runtime badge and `data-game-version` must show `v0.0.029` after the
  client module loads.
- Exact live page copy or a dated note that it matches
  `unsoccer-itch-page-copy.md`.
- Screenshots used on the itch page, including final gameplay screenshots for
  the selected runtime version.
- Desktop/mobile embed smoke notes and browser console result.

## Rules

- Do not call an external itch.io page complete from repo evidence alone.
- Do not publish a game version externally when the production route, zip, and
  storefront screenshots show different versions.
- Keep local-server public routes and itch.io copy visually aligned, but record
  them separately: local deployment proof is not the same as itch.io publish
  proof.
