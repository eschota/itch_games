# Itch.io Publication Ledger

Use this ledger as the single source for external itch.io page publication
status. A public page is not complete until the external URL, uploaded zip,
exact live copy, screenshots, publication date, and version match are recorded
here and in the per-game checklist.

## Current Production Evidence

Checked on 2026-07-01 at 13:34 UTC. This is a historical production snapshot;
the UI/settings runtime integration below was verified locally and does not by
itself prove the external public route or itch.io page is updated.

The public UnSoccer version is currently split. API/server report `v0.0.008`,
but raw public page HTML/meta and the visible badge still show `v0.0.007`.
The Git commit below is a deployment/verification snapshot only; partial
release commits may advance before every player-facing surface catches up.

| Surface | Evidence | Status |
| --- | --- | --- |
| IO Games catalog | `https://io-games.mecharulez.com/` is the local-server catalog | Keep game cards synchronized with the live routes before external publishing |
| Orbital Courier route | `https://io-games.mecharulez.com/orbital-courier/` shows `v0.0.006` | Live local-server game route is current |
| UnSoccer route | `https://io-games.mecharulez.com/unsoccer/` serves built client asset `index-DIqAWeep.js`, but raw HTML meta and visible `#version-badge` still show `v0.0.007` | Public page copy/badge is not yet `v0.0.008` |
| UnSoccer API | `/unsoccer/api/health` returns JSON `version=v0.0.008` with websocket/http transports enabled | Multiplayer server contract is live for `v0.0.008` |
| AI chat health | `/ai_chat/api/status` reports `project_version=v0.0.008`, `main@fba16d3`, `dirty=false` | Project/deploy metadata is `v0.0.008` |
| Version split | Public page badge/meta are `v0.0.007`; API/server/project are `v0.0.008` | Do not publish or advertise `v0.0.008` externally until public route HTML/meta, badge, API, package, screenshots, and QA evidence agree |

## Current Local Implementation Evidence

Checked on 2026-07-01 at 15:08 UTC.

| Surface | Evidence | Status |
| --- | --- | --- |
| UnSoccer source/build target | `package.json`, `unsoccer/shared/src/index.ts`, and client HTML target `v0.0.010` | Local runtime target is `v0.0.010` |
| UnSoccer UI release gate | `unsoccer-ui-final-local-gate-v0.0.010-rerun.json` and matching viewport PNGs show no HUD overflow, no toolbar/version/control-hint overlap, all settings tabs usable, selected tab count `1`, and visible badge `v0.0.010 / 0.61 MB` on desktop/mobile/minimum widths | UI layout and visible version pass locally |
| UnSoccer Tester release gate | `tester/checks/2026-07-01-unsoccer-v0.0.010-local-release-gate/browser-retry-v010.json` verifies desktop/mobile browser, WebSocket, settings/input, day-cycle/art datasets, and audio datasets | Local browser QA passed |
| UnSoccer Art release gate | `art_director/checks/2026-07-01-unsoccer-v0.0.010-final-local-art-gate-retry.md` verifies courtyard readability, animated rig visibility, `sunFramed=true`, day-cycle datasets, and mobile framing | Local Art Director visual gate passed |
| External itch.io | Public itch.io URL is not recorded | Do not claim external publication complete |

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
- Current recorded production version: split between page `v0.0.007` and
  API/server `v0.0.008` in the 13:34 UTC snapshot.
- Current local source/build target: `v0.0.010`.
- Pending publication target: `v0.0.010` only after public route HTML/meta,
  visible badge, API health, uploaded package, screenshots, and QA evidence all
  agree.
- Upload package: `dist/unsoccer-itch.zip`.
- Page copy: `unsoccer-itch-page-copy.md`.
- Publish checklist: `unsoccer-itch-publishing-checklist.md`.
- Storefront assets: `unsoccer-itch-assets/`.
- UI/settings redesign brief: `unsoccer-ui-settings-redesign-v0.0.008.md`.
- UI/settings runtime evidence:
  `unsoccer-ui-final-local-gate-v0.0.010-rerun.json` and matching viewport
  screenshots.
- Tester release evidence:
  `tester/checks/2026-07-01-unsoccer-v0.0.010-local-release-gate/browser-retry-v010.json`.
- Art release evidence:
  `art_director/checks/2026-07-01-unsoccer-v0.0.010-final-local-art-gate-retry.md`.
- External itch.io project URL: not recorded.
- Publication status: draft copy/assets/checklist exist; external itch.io
  publication is blocked until the selected version is synchronized across
  code, package, production route, screenshots, and server URL strategy. The
  UI/settings redesign and local browser gates are carried into `v0.0.010`, but
  this is not an external itch.io publication until the ledger records live
  upload evidence.

Required final evidence:

- Public itch.io URL.
- Decided published version: hold external publishing until the recorded
  production split is resolved, then publish only the synchronized public game
  version, currently targeted as `v0.0.010`.
- Uploaded zip filename and version.
- Multiplayer server URL strategy: embedded production endpoint, documented
  `?server=` tester flow, or explicitly static-only prototype status.
- Visible runtime badge and `data-game-version` must show `v0.0.010` after the
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
