# Ragdoll Soccer II Itch.io Publishing Checklist

Use this before changing the external Ragdoll Soccer II itch.io page.

## Assets

- Upload `unsoccer-itch-assets/cover-630x500.png` as the cover image.
- Upload `unsoccer-itch-assets/embed-background-1280x720.png` as the embed/play
  background if the page theme supports it.
- Upload public-page screenshots from `unsoccer-itch-assets/`.
- Add final gameplay screenshots only after the target runtime version is
  committed, deployed, and packaged.
- Keep the cover image at the 315:250 ratio; `630x500` is the preferred
  double-size export used here.

## Upload

- Decide the publish version first:
  - `v0.0.010` only after the HUD/settings runtime, package, production route,
    server health, screenshots, and ledger all agree.
  - Do not publish a stale split build just because a package or server has a
    newer version than the visible route.
- Run `npm run build:unsoccer` only from a deliberately selected release tree.
- Run `python3 tools/package_itch.py unsoccer`.
- Upload `dist/unsoccer-itch.zip`.
- Confirm the zip root contains `index.html`.
- Confirm the zip excludes internal skill, agent, role, deploy, server, and
  source-control docs.
- Confirm all browser asset paths are relative and case-safe.
- Set project kind to HTML game.
- Mark mobile friendly only after the uploaded embed/fullscreen flow works on
  a phone-size viewport.

## Page Setup

- Paste fields from `unsoccer-itch-page-copy.md`.
- Use the pitch green, blue team, orange team, off-white field line, and warm
  orange accent visual system.
- Keep custom CSS scoped to the itch page wrapper if custom CSS is used.
- Keep the server requirement visible before the play button or embedded game
  can create a false live-match expectation.

## Multiplayer Gate

- Confirm the deployed multiplayer server URL strategy:
  - page/build has a known production server endpoint; or
  - the itch page instructs testers to use a `?server=` URL; or
  - the page is explicitly marked as a static prototype without live
    multiplayer.
- Confirm HTTPS and the built-in WebSocket/HTTP fallback transport work from the
  itch embed origin.
- Confirm first 4 clients become players and later clients spectate against the
  same uploaded build.

## Verification

- Open the draft/restricted itch.io page on desktop.
- Launch the embedded game or static prototype and confirm no blank screen.
- Check browser console for runtime errors.
- Open the page on mobile and confirm text, buttons, and server-status copy do
  not overflow.
- Confirm visible page version matches the uploaded zip and production route.
- Confirm the loaded runtime badge and `data-game-version` remain `v0.0.010`
  after the client module runs, not only in raw HTML.
- Record published date, public URL, exact live copy, screenshots, uploaded zip
  name, and server URL strategy in this folder after any external publish.

## Current Gates

- External itch.io project URL is not yet recorded in repo docs.
- Last recorded production snapshot is split between visible page `v0.0.007`
  and API/server `v0.0.008`; recheck before publishing.
- Local UnSoccer source/build target now includes the v0.0.010 HUD/settings UI
  and camera-framed sun marker; do not publish that version externally until
  the code, package, production route, screenshots, and docs agree.
- Local UI release gate retry passed with visible `v0.0.010 / 0.61 MB`,
  selected settings tab count `1`, no horizontal overflow, and desktop/mobile/
  minimum viewport evidence in
  `unsoccer-ui-final-local-gate-v0.0.010-rerun.json`.
- Local Tester and Art Director gates passed after rebuild; use their evidence
  before external publishing:
  `tester/checks/2026-07-01-unsoccer-v0.0.010-local-release-gate/browser-retry-v010.json`
  and
  `art_director/checks/2026-07-01-unsoccer-v0.0.010-final-local-art-gate-retry.md`.
- Current storefront assets are public-page draft assets, not final gameplay
  captures from the next runtime build.
