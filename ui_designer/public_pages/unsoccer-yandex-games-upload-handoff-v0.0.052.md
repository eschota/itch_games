# Ragdoll Soccer II Yandex Games Upload Handoff v0.0.052

Generated on 2026-07-03 for Yandex Games application `547090`.

## Current Upload Archive

- Archive source: `dist/unsoccer-itch.zip`
- Manual-upload staging folder: `dist/yandex-upload-547090-v0.0.052/`
- Archive: `dist/yandex-upload-547090-v0.0.052/01-unsoccer-archive-v0.0.052.zip`
- Archive size: `22,976,473` bytes
- Root `index.html`: present
- Detected version in archive: `v0.0.052`
- Visible weight label in archive: `40.05 MB`
- Archive entries: `105`
- Archive asset references: `assets/main-DqAPGUYT.js`,
  `assets/character-controller-D3-0BFfX.js`, `assets/main-LDAwewqp.css`
- Internal docs/skill/deploy/agent files in archive: none detected
- Yandex staging verifier:
  `node ui_designer/public_pages/verify-yandex-upload-pack.mjs --mode=live`
  passes for this pack with pinned SHA-256 for all numbered files, archive root
  `index.html`, `v0.0.052`, `40.05 MB`, `105` ZIP entries, asset references,
  no internal docs/skill/deploy files, PNG/GIF dimensions, H.264 `yuv420p`
  1280x720 MP4 duration `5.333333`, and size limits.

## Current Media Pack

- Source folder: `ui_designer/public_pages/unsoccer-yandex-games-assets/`
- Required icon: `02-icon-512x512.png`
- Optional maskable icon: `03-maskable-icon-512x512.png`
- Required cover: `04-cover-800x470.png`
- Optional showcase cover: `05-showcase-cover-1560x520.png`
- Main gameplay video: `06-gameplay-horizontal-1280x720.mp4`
- Legacy GIF preview: `07-gameplay-preview-480x270.gif`
- Desktop screenshots: `08-screenshot-01-gameplay-1280x720.png`,
  `09-screenshot-02-gameplay-1280x720.png`

## Upload Order For Orchestrator

Use the numbered files from `dist/yandex-upload-547090-v0.0.052/`.

1. Upload `01-unsoccer-archive-v0.0.052.zip` to the Archive field.
2. Upload `02-icon-512x512.png` to Icon.
3. Upload `03-maskable-icon-512x512.png` to Maskable icon if the field is visible.
4. Upload `04-cover-800x470.png` to Cover.
5. Upload `05-showcase-cover-1560x520.png` to Showcase cover if the field is
   visible.
6. Upload `06-gameplay-horizontal-1280x720.mp4` to Horizontal gameplay video.
7. Upload `07-gameplay-preview-480x270.gif` only if the legacy GIF field is used.
8. Upload `08-screenshot-01-gameplay-1280x720.png` and
   `09-screenshot-02-gameplay-1280x720.png` to Desktop screenshots.
9. Save the draft.
10. Recheck validation errors, then send to moderation.

## Current State And Blockers

- The older `dist/yandex-upload-547090-v0.0.033/` pack remains preserved as prior
  evidence, but it is no longer the current local release candidate.
- Current local package metadata is `v0.0.052`; live primary and Moscow mirrors
  now report `v0.0.052`, commit `e2c821a`, and Moscow public `/unsoccer/`
  contains `v0.0.052 / 40.05 MB`.
- Yandex Console draft `https://games.yandex.ru/console/application/547090#application-info-draft`
  showed saved version `0.0.031`; the currently open browser form field was
  changed to `0.0.052` but not saved because the required Archive field still
  says `Файл не загружен`.
- Codex in-app browser cannot select local files in Yandex file inputs. Actual
  upload still requires manual browser action, a browser automation surface with
  file-upload support, or an account/API upload path supplied by the owner.
- Do not click Save or Send to moderation until
  `01-unsoccer-archive-v0.0.052.zip` is selected in the Archive field.
