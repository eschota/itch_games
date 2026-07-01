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

## Rules

- Do not place runtime UI code here.
- Do not place final exported store assets here unless they are explicitly
  source assets for a public-page brief.
- When a brief changes source-controlled public pages, update `../../skill.md`,
  `../../skill.xml`, and the relevant folder skill.
- External itch.io edits must be recorded here with date, copy, screenshots, and
  publication notes.
