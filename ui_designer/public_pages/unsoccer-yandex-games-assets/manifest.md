# Ragdoll Soccer II Yandex Games Media Pack

Generated on 2026-07-02 for the Yandex Games draft of UnSoccer / Ragdoll
Soccer II from the live Moscow build:
`https://moscow-io-games.mecharulez.com/unsoccer/?name=YandexPreview&qaTime=30`.

## Files

- `icon-512x512.png`: Yandex Games icon, PNG, 512 x 512.
- `maskable-icon-512x512.png`: optional maskable icon, PNG, 512 x 512.
- `cover-800x470.png`: Yandex Games catalog cover, PNG, 800 x 470.
- `showcase-cover-1560x520.png`: optional showcase cover, PNG, 1560 x 520.
- `poster-1280x720.png`: larger poster export for review and reuse.
- `gameplay-horizontal-1280x720.mp4`: horizontal gameplay video, MP4/H.264,
  1280 x 720, 5.33 seconds, silent, fast-start.
- `gameplay-preview-480x270.gif`: legacy GIF gameplay preview, 480 x 270,
  43 frames, 568,712 bytes.
- `screenshot-01-gameplay-1280x720.png`: desktop gameplay screenshot.
- `screenshot-02-gameplay-1280x720.png`: desktop gameplay screenshot.

## Validation

- Source route/build: Moscow public route captured during the earlier
  Yandex-preview pass. The current upload archive is verified separately in
  `unsoccer-yandex-games-upload-handoff-v0.0.052.md`.
- Poster/icon source: generated promotional 3D soccer art with direct game
  relation, no text, no logos, no Yandex UI, no borders, no rounded corners.
- Gameplay source: 64 browser viewport frames captured from the live match.
- Image dimensions verified with Pillow.
- Video verified with ffprobe: H.264, 1280 x 720, 12 fps, 5.33 seconds,
  yuv420p, SAR 1:1, 341,810 bytes.
- GIF verified with Pillow: 480 x 270, 43 frames, 568,712 bytes.

## Yandex Games Mapping

- Upload `icon-512x512.png` to the required Icon field.
- Upload `maskable-icon-512x512.png` to the optional Maskable icon field.
- Upload `cover-800x470.png` to the required Cover field.
- Upload `showcase-cover-1560x520.png` to the optional Showcase cover field.
- Upload `gameplay-horizontal-1280x720.mp4` to the Horizontal gameplay video
  field.
- Upload `gameplay-preview-480x270.gif` only if the legacy GIF field is used.
- Upload both `screenshot-*-gameplay-1280x720.png` files as Desktop
  screenshots.

## Notes For Orchestrator

- Do not upload the GIF instead of the MP4. The current Yandex Games draft UI
  and docs use MP4 for gameplay video; GIF is legacy and optional.
- These files are not runtime dependencies and should not be wired into game
  code.
- This pack was created without staging, committing, pushing, or touching
  gameplay/server/art geometry.
