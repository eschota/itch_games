# Ragdoll Soccer II Itch.io Publishing Checklist

Use this before changing the external Ragdoll Soccer II itch.io page.

## Current Public Page

- Public URL: `https://eschotagmailcom.itch.io/ragdoll-soccer-ii`.
- Itch project id: `4740079`.
- Butler target: `eschotagmailcom/ragdoll-soccer-ii:html5`.
- Current upload/build: upload `#18187910`, build `#1768259`, user version
  `v0.0.053`.
- Current page status: `Published`.
- Current project type: `HTML`.
- Current release status: `Prototype`.
- Current genre: `Sports`.
- Current embed: 960 x 540, fullscreen enabled, mobile-friendly enabled,
  autostart disabled.

## Build Upload

- Run `npm run package:unsoccer` before a new public upload unless an already
  verified `dist/unsoccer-itch.zip` is being reused.
- Publish with:

```powershell
$env:BUTLER_PATH="$env:LOCALAPPDATA\itch-games\butler\butler.exe"
.\tools\publish_unsoccer_itch.ps1 -Target 'eschotagmailcom/ragdoll-soccer-ii:html5' -SkipBuild
```

- Confirm butler status:

```powershell
& "$env:LOCALAPPDATA\itch-games\butler\butler.exe" status eschotagmailcom/ragdoll-soccer-ii
```

- The zip must contain root `index.html`, current version text, current weight
  label, and no internal skill/agent/deploy/source-control docs.

## Page Setup

- Paste fields from `unsoccer-itch-page-copy.md`.
- Keep project type `HTML`, release status `Prototype`, and genre `Sports`.
- Keep the static-client/live-server note visible in the description.
- Current blocker: full description copy must be manually restored from
  `unsoccer-itch-page-copy.md`. Browser automation could open/fill Redactor
  source mode, but itch did not persist `game[description]` through the
  available controls.
- Keep embed fullscreen enabled and autostart disabled.
- Keep mobile-friendly enabled only while mobile HUD/touch controls remain
  covered by release QA.
- Do not reuse the old `drunkragdoll` project for this title; it remains a
  separate public page.

## Assets

- Target cover: `unsoccer-yandex-games-assets/cover-800x470.png` or a future
  itch-specific 315:250 cover export.
- Target screenshots: current gameplay screenshots from
  `unsoccer-yandex-games-assets/`.
- Current blocker: Codex in-app browser can edit itch text/settings, but cannot
  select local files in itch.io file dialogs. Upload media manually or provide
  an itch media API/session upload path.

## Verification

- Public URL returns HTTP 200.
- Butler status reports the expected upload/build/version.
- Open the public page on desktop.
- Press `Run match`.
- Confirm the iframe URL uses the latest build id.
- Confirm the iframe has one canvas and visible `v0.0.053 / 40.05 MB`.
- Confirm the transport is `websocket` or HTTP fallback against the production
  server, not a 403 from `html-classic.itch.zone`.
- Check console warnings. FBXLoader skinning/unsupported-map warnings are known
  asset warnings; network 403 is a blocker.

## Current Smoke

Checked on 2026-07-03:

- Public URL returned `HTTP 200`.
- Butler status returned channel `html5`, upload `#18187910`,
  build `#1768259 (from #1768248)`, version `v0.0.053`.
- Public page showed `PUBLISHED`.
- Running the embed created iframe
  `https://html-classic.itch.zone/html/18187910-1768259/index.html?...`.
- Iframe contained one canvas and visible `v0.0.053 / 40.05 MB`.
- Runtime joined as a player with transport `websocket`.
- Previous build `#1768237` failed with `join: 403`; fixed by making
  itch-hosted builds default to the production server URL.
- Public full description is still blocked and must be manually restored from
  `unsoccer-itch-page-copy.md`.
