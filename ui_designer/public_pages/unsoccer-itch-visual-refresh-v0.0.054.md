# Ragdoll Soccer II Itch.io Visual Refresh Handoff v0.0.054

Recorded on 2026-07-03.

## Result

- Scope: repo-side public page and itch media preparation only.
- Live external itch.io page was not pushed or media-uploaded from this task.
- The working copy public surfaces now use the VK Play poster family instead of
  the old CSS-field placeholder.
- Orchestrator must handle the external itch.io dashboard upload/save and any
  butler publish.

## Source VK Assets

- `ui_designer/public_pages/unsoccer-vkplay-assets/vkplay-album-cover-626x352.png`.
- `ui_designer/public_pages/unsoccer-vkplay-assets/vkplay-background-art-1544x380.png`.
- `ui_designer/public_pages/unsoccer-vkplay-assets/vkplay-portrait-cover-398x530.png`.
- `ui_designer/public_pages/unsoccer-vkplay-assets/vkplay-desktop-icon-256x256.png`.
- `ui_designer/public_pages/unsoccer-vkplay-assets/vkplay-video-preview-342x190.webm`.

## Public Runtime Copies

These are intentionally under the game folder so local static pages can serve
them without exposing `ui_designer/` paths:

- `unsoccer/store-assets/hero-album-cover-626x352.png`.
- `unsoccer/store-assets/hero-background-1544x380.png`.
- `unsoccer/store-assets/portrait-cover-398x530.png`.
- `unsoccer/store-assets/icon-256x256.png`.
- `unsoccer/store-assets/gameplay-preview-342x190.webm`.
- `unsoccer/store-assets/itch-cover-630x500.png`.
- `unsoccer/store-assets/embed-background-1280x720.png`.

## Itch Upload Mapping

- Cover image: `ui_designer/public_pages/unsoccer-itch-assets/cover-630x500.png`.
- Embed/play background: `ui_designer/public_pages/unsoccer-itch-assets/embed-background-1280x720.png`.
- First gallery visual: `ui_designer/public_pages/unsoccer-itch-assets/screenshot-01-vk-art-1280x720.png`.
- Optional motion preview source:
  `unsoccer/store-assets/gameplay-preview-342x190.webm`.

## Source Pages Updated

- `index.html`: root catalog now uses the real Ragdoll Soccer II store art and
  current `v0.0.054` public label.
- `unsoccer/index.html`: public game page now uses the VK wide hero, icon,
  portrait cover, and motion preview while keeping the server-backed prototype
  constraint visible.
- `unsoccer/meta.json`: added reusable RU/EN player-facing marketing copy for
  the catalog, `/unsoccer/`, and external store listings.
- `ui_designer/public_pages/unsoccer-itch-page-copy.md`: next itch copy target
  updated to `v0.0.054`.
- `ui_designer/public_pages/unsoccer-itch-publishing-checklist.md`: media
  upload mapping updated for the refreshed assets.

## Orchestrator Notes

- Do not stage/push this UI handoff automatically from the UI Designer thread.
- Keep visible public-page text player-facing; do not publish internal handoff,
  source-folder, or art-prep explanations as page copy.
- External itch remains complete only at the previous verified `v0.0.053` state
  until dashboard media/copy and the next build are uploaded and smoke-checked.
- The prior in-app browser limitation still applies: it could not reliably
  choose local files in itch.io upload dialogs.
- After upload, verify public page HTTP 200, cover/background/gallery visibility,
  embed launch, one canvas, visible version/weight, and WebSocket transport.
