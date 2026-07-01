# Ragdoll Soccer II Itch.io Publishing Checklist

Use this before changing the external Ragdoll Soccer II itch.io page.

## Assets

- Upload `unsoccer-itch-assets/cover-630x500.png` as the cover image.
- Upload `unsoccer-itch-assets/embed-background-1280x720.png` as the embed/play
  background if the page theme supports it.
- Upload public-page screenshots from `unsoccer-itch-assets/`.
- Add final gameplay screenshots only after the selected runtime version,
  uploaded package, and multiplayer server strategy are verified together.
- Keep the cover image at the 315:250 ratio; `630x500` is the preferred
  double-size export used here.

## Upload

- Publish target for this copy pass: `v0.0.029`.
- The Producer reports `dist/unsoccer-itch.zip` is already built locally; this
  UI Designer task must not rebuild, upload, deploy, or use butler.
- Orchestrator upload step: upload `dist/unsoccer-itch.zip`.
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
- Keep the page tone focused on courtyard football, strange rules, charged
  kicks, stamina, jumping, ragdoll knockdowns, and fights.
- Keep custom CSS scoped to the itch page wrapper if custom CSS is used.
- Keep the static-upload/live-server warning visible before the play button or
  embedded game can create a false live-match expectation.
- Do not add an external itch.io project URL to repo docs until the actual URL
  is known from the external project page.

## Multiplayer Gate

- Confirm the deployed multiplayer server URL strategy:
  - the page/build has a known production server endpoint; or
  - the itch page instructs testers to use a `?server=` URL; or
  - the page is explicitly marked as a static client that needs the live server
    for multiplayer.
- Confirm HTTPS and the built-in WebSocket/HTTP fallback transport work from the
  itch embed origin.
- Confirm first 4 clients become players and later clients spectate against the
  same uploaded build.
- If the server is unavailable or blocked from the itch iframe, keep the page
  marked as a static HTML5 prototype that depends on the live multiplayer
  server.

## Verification

- Open the draft/restricted itch.io page on desktop.
- Launch the embedded game or static prototype and confirm no blank screen.
- Check browser console for runtime errors.
- Open the page on mobile and confirm text, buttons, and server-status copy do
  not overflow.
- Confirm visible page version matches the uploaded zip and selected release.
- Confirm the loaded runtime badge and `data-game-version` remain `v0.0.029`
  after the client module runs, not only in raw HTML.
- Confirm LMB kick charge is exposed by runtime QA fields:
  `data-local-kick-charge` and `data-local-kick-charge-held`.
- Record published date, public URL, exact live copy, screenshots, uploaded zip
  name, and server URL strategy in this folder after any external publish.

## Current Gates

- External itch.io project URL is not yet recorded in repo docs.
- Repo-local UnSoccer release target is `v0.0.029`; `package.json` and
  `package.json.games.unsoccer.version` both record `v0.0.029`.
- Local package path for orchestrator publication: `dist/unsoccer-itch.zip`.
  This task did not rebuild or upload it.
- Local v0.0.029 browser evidence exists at
  `tester/checks/2026-07-02-unsoccer-v0.0.029-kick-charge/browser-qa.json`
  with visible badge `v0.0.029 / 83.79 MB`, WebSocket transport, and kick
  charge QA fields.
- Current storefront assets are public-page draft assets; final gameplay
  captures for the external itch.io page still need to be selected and recorded.
