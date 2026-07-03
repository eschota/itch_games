# Ragdoll Soccer II VK Play Release Gate

Use this checklist for every UnSoccer / Ragdoll Soccer II browser release that
must be published or updated on VK Play project `48793`.

## Project

- VK Play Developers page:
  `https://developers.vkplay.ru/dev/games/48793/locales/ru_RU/`
- Public VK Play page:
  `https://vkplay.ru/play/game/ragdoll-soccer-ii-48793/`
- VK Play account observed in dashboard: `16195023@vk`
- Game type: `Browser`
- Monetization model: `Free-to-play`
- Base localization: `ru_RU`
- Preferred runtime surface:
  `https://moscow-io-games.mecharulez.com/unsoccer/`

## Release Rule

VK Play updates must use the iframe URL as the source of truth. The URL must
include the current game version as a query parameter:

```text
https://moscow-io-games.mecharulez.com/unsoccer/?source=vkplay&version={GAME_VERSION}
```

Do not save, publish, or increment a VK Play iframe URL for a version until the
same version is live on the primary and Moscow public health surfaces.

## Required Local Steps

Run these commands after every new UnSoccer release build:

```powershell
python tools/package_itch.py unsoccer
node ui_designer/public_pages/prepare-vkplay-upload-pack.mjs
```

The generator must create:

```text
dist/vkplay-upload-9572-{GAME_VERSION}/
```

The folder must contain the numbered browser archive and store-media files. The
browser archive is a fallback for VK Play hosted-build upload; the normal update
path is still the iframe URL.

## Required Live Gate

Run the Moscow relay/live check before touching VK Play:

```powershell
node ai_chat/deploy/verify-moscow-relay.mjs --mode=report
```

The release is blocked if any of these are false:

- `expected.version` equals the package game version.
- Primary deploy health reports the expected version.
- Moscow deploy health reports the expected version.
- Moscow public `/unsoccer/` contains the expected version and current weight
  label.
- Moscow public `/unsoccer/api/health` reports the expected version.
- Primary and Moscow commits match.

The deploy-relay route may be tracked separately as infrastructure health, but
VK Play publication still cannot proceed while Moscow is serving an older game
version.

## VK Play Dashboard Steps

After the local and live gates pass:

1. Open `https://developers.vkplay.ru/dev/games/48793/locales/ru_RU/`.
2. Set `IFrame link to the game` to:

   ```text
   https://moscow-io-games.mecharulez.com/unsoccer/?source=vkplay&version={GAME_VERSION}
   ```

3. Press `Increase iFrame Version` / `Increment` for an update build.
4. Upload changed media only when the icon, cover, screenshots, or video changed.
5. Save the locale/project page.
6. Submit/publish only after a dashboard smoke confirms the iframe opens the
   expected live version.

## Store Media Mapping

Use files from `dist/vkplay-upload-9572-{GAME_VERSION}/`:

- `02-icon-512x512.png`: desktop/icon upload.
- `03-cover-800x470.png`: horizontal/catalog cover when accepted.
- `04-wide-cover-1560x520.png`: wide cover/art slot when accepted.
- `05-screenshot-01-1280x720.png`: gameplay screenshot.
- `06-screenshot-02-1280x720.png`: gameplay screenshot.
- `07-gameplay-horizontal-1280x720.mp4`: gameplay video.

## Current Known Blockers

- Codex in-app Browser cannot currently type into this VK Play form in this
  session because the browser runtime reports the virtual clipboard integration
  is missing for fill/type and clipboard-paste operations.
- Codex in-app Browser cannot select local files in VK Play file inputs.
- If manual upload is unavailable, provide a VK Play API/session upload path or
  a browser automation surface with working typing and file selection.

## Evidence To Record

For every release, update or add a versioned handoff file in this folder with:

- VK Play project id and dashboard URL.
- Local pack folder.
- Browser archive size and SHA-256.
- Detected version, weight label, archive entry count, and asset refs.
- Live gate result for primary and Moscow.
- Exact iframe URL saved in VK Play.
- Media files uploaded or explicitly unchanged.
- Publication/submission date and status.
