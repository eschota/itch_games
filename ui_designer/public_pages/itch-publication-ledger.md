# Itch.io Publication Ledger

Use this ledger as the single source for external itch.io page publication
status. A public page is not complete until the external URL, uploaded zip,
exact live copy, screenshots, publication date, and version match are recorded
here and in the per-game checklist.

## Current Local Publication Target

Checked from the working copy and public itch.io page on 2026-07-03.

| Surface | Evidence | Status |
| --- | --- | --- |
| UnSoccer source/build target | `package.json` and `package.json.games.unsoccer.version` record `v0.0.054` | Source target is ahead of the current itch.io upload |
| UnSoccer upload package | `dist/unsoccer-itch.zip` was rebuilt with the itch-host default-server patch | Uploaded through butler to `eschotagmailcom/ragdoll-soccer-ii:html5` |
| UnSoccer itch build | Butler status reports channel `html5`, upload `#18187910`, build `#1768259 (from #1768248)`, version `v0.0.053` | Public build active |
| UnSoccer visual refresh assets | `unsoccer-itch-assets/cover-630x500.png`, `embed-background-1280x720.png`, and `screenshot-01-vk-art-1280x720.png` generated from VK art | Repo-side ready; external media upload still pending |
| Static HTML5 contract | Itch upload is a static browser client and defaults to the live authoritative multiplayer server when hosted from `html-classic.itch.zone` | Embed smoke joined over WebSocket |
| External itch.io | `https://eschotagmailcom.itch.io/ragdoll-soccer-ii` returned HTTP 200 and showed `PUBLISHED` | Public page live; full description copy still needs manual restoration |

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
- Current repo-local publication target: `v0.0.054`.
- Current external itch.io publication status: published and smoke-checked on
  2026-07-03 as `v0.0.053`.
- Upload package: `dist/unsoccer-itch.zip`.
- Page copy: `unsoccer-itch-page-copy.md`.
- Publish checklist: `unsoccer-itch-publishing-checklist.md`.
- Publication evidence: `unsoccer-itch-publication-v0.0.053.md`.
- Visual refresh handoff: `unsoccer-itch-visual-refresh-v0.0.054.md`.
- Storefront assets: `unsoccer-itch-assets/`.
- UI/settings redesign brief: `unsoccer-ui-settings-redesign-v0.0.008.md`.
- UI/settings runtime evidence:
  `unsoccer-ui-final-local-gate-v0.0.010-rerun.json` and matching viewport
  screenshots.
- Current browser release evidence: public itch iframe build `#1768259` showed
  one canvas, visible `v0.0.053 / 40.05 MB`, player join, scoreboard, bot
  roster, and `websocket` transport.
- External itch.io project URL:
  `https://eschotagmailcom.itch.io/ragdoll-soccer-ii`.
- Publication status: public itch.io page is live at `v0.0.053`. The `v0.0.054`
  visual/copy refresh is prepared repo-side, but full description copy and
  cover/screenshot media still need manual upload or an itch media API/session
  upload path before the external page can be called refreshed.

Required final evidence:

- Public itch.io URL: recorded.
- Decided published version: `v0.0.053`.
- Uploaded zip filename/version: butler channel `html5`, upload `#18187910`,
  build `#1768259`, version `v0.0.053`.
- Multiplayer server URL strategy: embedded production endpoint, documented
  `?server=` tester flow, or explicitly static-only prototype status. Current
  strategy is default production endpoint for itch-hosted builds.
- Visible runtime badge shows `v0.0.053 / 40.05 MB` after the client module
  loads.
- Exact live page copy does not yet match `unsoccer-itch-page-copy.md`; full
  description restoration is a manual blocker.
- Screenshots/cover media: refreshed files are prepared; external itch upload is
  still pending.
- Desktop embed smoke: recorded in `unsoccer-itch-publication-v0.0.053.md`.

## Rules

- Do not call an external itch.io page complete from repo evidence alone.
- Do not publish a game version externally when the production route, zip, and
  storefront screenshots show different versions.
- Keep local-server public routes and itch.io copy visually aligned, but record
  them separately: local deployment proof is not the same as itch.io publish
  proof.
