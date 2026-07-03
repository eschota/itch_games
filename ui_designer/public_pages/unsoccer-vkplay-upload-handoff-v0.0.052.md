# Ragdoll Soccer II VK Play Release Handoff v0.0.052

Generated on 2026-07-03 for VK Play Developers project `48793`.

Permanent release/update gate:
`ui_designer/public_pages/unsoccer-vkplay-release-gate.md`.

## Project State

- Developer page: `https://developers.vkplay.ru/dev/games/48793/locales/ru_RU/`
- Public page: `https://vkplay.ru/play/game/ragdoll-soccer-ii-48793/`
- Browser page check: public URL returns `HTTP 200`.
- Account visible in header: `16195023@vk`
- Project title: `Ragdoll Soccer II`
- Game type: `Browser`
- Monetization model: `Free-to-play`
- Developer/Publisher: `u3d`
- Basic localization: `Russian`
- Supported OS currently visible: `Android`, `Windows`
- Status labels visible in dashboard: `Tech Review` and
  `Project Marketing Review` show `Passed Successfully`.

## Browser Game Runtime URL

VK Play says browser games use `IFrame link to the game`; adding a `version`
query parameter allows build version updates without moderation via the
`Increment` button.

Use this URL for the current release candidate after the Moscow deploy is live:

`https://moscow-io-games.mecharulez.com/unsoccer/?source=vkplay&version=v0.0.052`

Current live gate: primary and Moscow now both report `v0.0.052`, matching
main commits, and Moscow public `/unsoccer/` contains `v0.0.052 / 40.05 MB`.
The iframe URL is no longer blocked by live-version drift.

Dashboard save status: `IFrame link to the game` and `iFrame link to the test
game` are saved as this URL. Post-save reload confirmed both fields still
contain `v0.0.052`. Required `Marking` was saved as `cruelty`.

## Store Text To Apply

- Game name aliases:

```text
Ragdoll Soccer II
UnSoccer
Регдолл Футбол
```

- Short Description Title:

```text
Футбол без правил
```

- Short Description:

```text
Браузерный рэгдолл-футбол: десять игроков, боты, удары, рывки, падения и борьба за мяч прямо в браузере.
```

- Full Description:

```text
Ragdoll Soccer II - браузерный футбольный матч с физикой и смешными падениями. Ведите мяч, бейте низом или верхом, перехватывайте атаки и забивайте голы на уличной 3D-площадке. Боты заполняют матч, эмоции и чат помогают общаться, а серверная логика держит темп игры.
```

- Global Release Date:

```text
2026-07-03
```

- Support Details:

```text
https://io-games.mecharulez.com/ai_chat/
```

## System Requirements

Minimum:

- CPU: `Intel Core i3 or similar`
- RAM: `4 GB`
- Disk: `100 MB`
- Video card: `WebGL 2 compatible GPU`
- Other: `Chrome, Edge, Firefox, or another modern browser with WebGL and WebSocket support`

Recommended:

- CPU: `Intel Core i5 or similar`
- RAM: `8 GB`
- Disk: `100 MB`
- Video card: `Dedicated GPU with WebGL 2 support`
- Other: `Stable broadband internet connection and a current desktop browser`

## Local Upload Pack

Generate/update the local pack after every new UnSoccer release:

```powershell
python tools/package_itch.py unsoccer
node ui_designer/public_pages/prepare-vkplay-upload-pack.mjs
```

Current generated folder: `dist/vkplay-upload-9572-v0.0.052/`

- Build archive: `01-browser-build-v0.0.052.zip`
- Archive size: `22,976,473` bytes
- Archive SHA-256:
  `9217b6426c8375b056e3ad85aab7004c96418638d825eb78380d276f5973e55f`
- Root `index.html`: present
- Detected version in archive: `v0.0.052`
- Visible weight label in archive: `40.05 MB`
- Archive entries: `105`
- Archive asset references: `assets/main-DqAPGUYT.js`,
  `assets/character-controller-D3-0BFfX.js`, `assets/main-LDAwewqp.css`

## Upload Files

Use the numbered files from `dist/vkplay-upload-9572-v0.0.052/`.

1. `01-browser-build-v0.0.052.zip` - browser build archive, only if VK Play asks
   for a hosted build instead of the iframe URL.
2. `02-icon-512x512.png` - icon.
3. `03-cover-800x470.png` - catalog/cover art.
4. `04-wide-cover-1560x520.png` - wide cover if VK Play asks for one.
5. `05-screenshot-01-1280x720.png` - gameplay screenshot.
6. `06-screenshot-02-1280x720.png` - gameplay screenshot.
7. `07-gameplay-horizontal-1280x720.mp4` - horizontal gameplay video.

## Validation

- `node --check ui_designer/public_pages/prepare-vkplay-upload-pack.mjs`: OK.
- `node ui_designer/public_pages/prepare-vkplay-upload-pack.mjs`: OK for
  `v0.0.052`, `40.05 MB`, `105` archive entries.
- `node ai_chat/deploy/verify-moscow-relay.mjs --mode=report`: OK for primary
  and Moscow `v0.0.052`, matching main commits, public version/weight, API
  health, and deploy-relay route.
- Browser project audit found file inputs for horizontal/vertical/art/video/icon
  assets, but no callable file-upload API in the in-app browser.
- Browser form update attempts on `iframe_landing_url` failed through
  `locator.fill`, DOM typing, and clipboard paste because this Browser runtime
  reports the virtual clipboard integration is missing.
- Browser fallback via coordinate focus and per-character keypress succeeded for
  the production iframe field and the test iframe field. Save returned
  `Data saved`; post-save reload confirmed the persisted URL and
  `main-marking=cruelty`.
- Quick scan for common embedded ad SDK markers returned no matches in
  `unsoccer/client/dist`.

## Remaining Blockers

- Current Codex browser automation also cannot select local files in VK Play file
  inputs.
- External/manual action still required unless a VK Play API/session upload path
  is supplied:
  1. Upload required images/video through the dashboard.
  2. Use `Publication` to publish or submit the updated page.
  3. For each later build, regenerate the pack, update only the iframe
     `version` parameter, press `Increment`, and upload media only when art
     changed.
