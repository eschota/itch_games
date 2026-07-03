# public_pages Directory Skill

Use this file for UI Designer work inside
`/itch_games/ui_designer/public_pages`.

## Parent References

- [../../skill.md](../../skill.md)
- [../../skill.xml](../../skill.xml)
- [../ui_designer.skill.md](../ui_designer.skill.md)
- [../../ui_designer_skill.md](../../ui_designer_skill.md)

## Purpose

- Store source-of-truth briefs for public game presentation before they are
  promoted into runtime pages or external publishing systems.
- Keep itch.io page copy, screenshot plans, capsule notes, metadata, public
  page audits, and local catalog direction traceable.

## Files

- `orbital-courier-public-pages.md`: Orbital Courier local catalog, game entry,
  and itch.io page brief.
- `orbital-courier-itch-page-copy.md`: paste-ready itch.io fields for Orbital
  Courier.
- `orbital-courier-itch-publishing-checklist.md`: publish and verification
  checklist for Orbital Courier itch.io page changes.
- `orbital-courier-itch-assets/`: generated storefront cover, embed
  background, screenshots, and asset manifest for Orbital Courier.
- `unsoccer-public-pages.md`: Ragdoll Soccer II local route, catalog card,
  multiplayer status, and itch.io page brief.
- `unsoccer-itch-page-copy.md`: live itch.io copy source for Ragdoll Soccer II.
- `unsoccer-itch-publishing-checklist.md`: operational publish checklist for
  the Ragdoll Soccer II itch.io page.
- `unsoccer-itch-publication-v0.0.052.md`: live itch.io publication evidence
  for Ragdoll Soccer II v0.0.052, including butler upload/build IDs, browser
  smoke, and remaining media-upload blocker.
- `unsoccer-ui-settings-redesign-v0.0.008.md`: original UnSoccer UI/settings
  redesign brief; current status records the runtime implementation in
  `v0.0.009`.
- `unsoccer-ui-runtime-smoke-v0.0.009.json` and
  `unsoccer-ui-runtime-smoke-v0.0.009.png`: headless Chrome evidence for the
  v0.0.009 in-game HUD/settings UI.
- `unsoccer-ui-final-local-gate-v0.0.010-rerun.json` and matching viewport
  PNGs: final local UI Designer v0.0.010 gate evidence for desktop, mobile, and
  minimum widths.
- `unsoccer-ui-release-gate-v0.0.010.md`: v0.0.010 UI release-gate report and
  publication follow-up notes.
- `unsoccer-ui-network-hud-stability-v0.0.010.md`: UI Designer note for the
  v0.0.010 network HUD fixed-column/tabular-numeral stability patch.
- `unsoccer-yandex-games-assets/`: generated Yandex Games media pack for
  Ragdoll Soccer II, including icon, cover, showcase cover, gameplay MP4/GIF,
  screenshots, and a pack manifest. Raw browser source captures are local
  scratch evidence and are ignored.
- `unsoccer-yandex-games-upload-handoff-v0.0.052.md`: current Yandex Games
  application 547090 upload handoff, archive/media mapping, draft state,
  Moscow mirror state, and remaining manual file-upload blocker.
- `unsoccer-yandex-games-upload-handoff-v0.0.033.md`: previous Yandex Games
  v0.0.033 upload handoff preserved as historical evidence.
- `unsoccer-vkplay-upload-handoff-v0.0.052.md`: current VK Play Developers
  create-project/upload handoff for Ragdoll Soccer II v0.0.052, including form
  values, local upload pack mapping, hashes, and external action blockers.
- `unsoccer-vkplay-release-gate.md`: permanent VK Play release/update gate for
  project 48793. Use it before every VK Play publish or iframe version
  increment.
- `unsoccer-vkplay-assets/`: VK Play-specific store art derivatives for the
  image/video fields, generated at VK-required dimensions from the current
  UnSoccer media pack.
- `prepare-vkplay-store-assets.py`: repeatable generator for the VK Play image
  and WEBM preview assets.
- `prepare-vkplay-upload-pack.mjs`: repeatable VK Play staging-pack generator.
  Run after `python tools/package_itch.py unsoccer` for each new UnSoccer
  release; it verifies the archive version/weight/assets and writes
  `dist/vkplay-upload-9572-{version}/`.
- `unsoccer-crazygames-upload-handoff-v0.0.053.md`: current CrazyGames
  Developer Portal submit handoff for Ragdoll Soccer II v0.0.053, including
  filled form values, upload mapping, requirements fit, and file-upload blocker.
- `prepare-crazygames-upload-pack.mjs`: repeatable CrazyGames staging-pack
  generator. Run after `python tools/package_itch.py unsoccer`; it verifies the
  ZIP against CrazyGames Basic Launch size/count constraints and writes
  `dist/crazygames-upload-{version}/`.
- `verify-yandex-upload-pack.mjs`: read-only Yandex Games staging-pack verifier.
  It checks pinned SHA-256 for every numbered upload file, archive
  root/index/version/weight/assets, PNG/GIF dimensions, MP4 codec/pixel
  format/duration, and lightweight file-size limits before manual Console
  upload.

## Rules

- Do not place runtime UI code here.
- Do not place final exported store assets here unless they are explicitly
  source assets for a public-page brief.
- When a brief changes source-controlled public pages, update `../../skill.md`,
  `../../skill.xml`, and the relevant folder skill.
- External itch.io edits must be recorded here with date, copy, screenshots, and
  publication notes.
- VK Play updates must pass `unsoccer-vkplay-release-gate.md` before the
  dashboard iframe URL is saved, incremented, published, or submitted.
- CrazyGames submissions must use `prepare-crazygames-upload-pack.mjs` and a
  versioned handoff before the dashboard upload is considered submitted.
