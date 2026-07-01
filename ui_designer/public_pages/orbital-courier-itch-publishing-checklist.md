# Orbital Courier Itch.io Publishing Checklist

Use this before changing the external Orbital Courier itch.io page.

## Assets

- Upload `orbital-courier-itch-assets/cover-630x500.png` as the cover image.
- Upload `orbital-courier-itch-assets/embed-background-1280x720.png` as the
  embed/play background if the page theme supports it.
- Upload 3-5 screenshots from `orbital-courier-itch-assets/`.
- Keep the cover image at the 315:250 ratio; official itch.io docs list
  315x250 as the minimum and 630x500 as the preferred larger size.

## Upload

- Run `python3 tools/package_itch.py orbital-courier`.
- Upload `dist/orbital-courier-itch.zip`.
- Confirm the zip root contains `index.html`.
- Confirm the zip contains `vendor/three.module.js` and
  `vendor/three-LICENSE.txt`.
- Confirm the game loads without external CDN requests for Three.js.
- Confirm the zip excludes internal skill, agent, role, deploy, and server docs.
- Set project kind to HTML game.
- Mark the project mobile friendly only after the mobile embed/fullscreen check
  passes on the uploaded build.

## Page Setup

- Paste fields from `orbital-courier-itch-page-copy.md`.
- Use the dark space base, cyan core, red debris, warm yellow accent, and
  off-white ship/readout colors.
- Keep custom CSS scoped to `#wrapper` if custom CSS is used.
- Confirm page layout remains readable in single-column HTML5 mode.

## Verification

- Open the draft/restricted itch.io page on desktop.
- Launch the embedded game and confirm no blank canvas.
- Confirm the network panel has no `cdn.jsdelivr.net` Three.js request.
- Confirm first input gesture unlocks audio.
- Confirm keyboard movement, pointer/touch drag, and restart after run complete.
- Open on mobile and confirm the launch/fullscreen flow is readable.
- Check browser console for runtime errors.
- Record published date, public URL, exact live copy, and screenshots in this
  folder after any external publish.

## Current Blockers

- Live `https://io-games.mecharulez.com/` still shows the old catalog until the
  current local work is committed, pushed, and autodeployed.
- Live `https://io-games.mecharulez.com/orbital-courier/` still shows
  `v0.0.005` until deployment.
- External itch.io project URL is not yet recorded in repo docs.
