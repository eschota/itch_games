# UnSoccer UI Release Gate v0.0.010

Checked on 2026-07-01 from `R:\itch_games` as UI Designer.

## Scope

- Runtime UI audit: `unsoccer/client/index.html`,
  `unsoccer/client/src/styles.css`, `unsoccer/client/src/settings.ts`, and
  `unsoccer/client/src/input-map.ts`.
- Public-page audit: `ui_designer/public_pages/**`.
- No staging, commit, push, gameplay/server/art-geometry edits.

## Result

UI layout gate passed after the final local rebuild. The earlier stale shared
`dist` blocker was a temporary source-only staging side effect and was resolved
before the retry evidence below.

## Runtime UI Findings

- HUD overflow: pass on desktop `1440x900`, mobile `390x844`, and minimum
  `320x640`.
- HUD overlaps: pass; version badge, toolbar, and control hints do not overlap.
- Settings modal: pass; all tabs open on all checked viewports with no
  horizontal overflow.
- Visible version/weight: pass on retry. The loaded client keeps the visible
  badge at `v0.0.010 / 0.61 MB`, and `data-game-version` stays `v0.0.010`.
- Settings selector contract: pass. Only the five settings buttons expose
  `data-settings-tab`; the document root uses `data-settings-active-tab`, so
  selected tab count remains `1` across all checked tabs.

## Patch Applied

- `unsoccer/client/index.html`: added a scoped mobile CSS override so settings
  toggle rows keep checkbox and label aligned at mobile widths.

## Public-Page Findings

- `ui_designer/public_pages/**` now contains v0.0.010 local gate evidence, but
  external itch.io publication is still explicitly unverified.
- External itch.io project URL is not recorded.
- Final uploaded package evidence is not recorded.
- Final production-route evidence for a synchronized v0.0.010 page/API/client is
  not recorded.
- Current storefront assets are still draft/public-page snapshots; use the
  final runtime screenshots only after the external itch.io page is actually
  prepared or updated.
- Multiplayer server URL strategy for the itch embed remains a required publish
  gate.

## Evidence

- `unsoccer-ui-final-local-gate-v0.0.010-rerun.json`
- `unsoccer-ui-final-local-gate-v0.0.010-rerun-desktop-1440x900.png`
- `unsoccer-ui-final-local-gate-v0.0.010-rerun-mobile-390x844.png`
- `unsoccer-ui-final-local-gate-v0.0.010-rerun-minimum-320x640.png`

Latest CDP summary:

- Desktop `1440x900`: visible badge `v0.0.010 / 0.61 MB`,
  `settingsTabButtonCount=5`, `selectedTabCount=1`, no horizontal overflow,
  `transport=websocket`.
- Mobile `390x844`: visible badge `v0.0.010 / 0.61 MB`,
  `settingsTabButtonCount=5`, `selectedTabCount=1`, no horizontal overflow,
  `transport=websocket`.
- Minimum `320x640`: visible badge `v0.0.010 / 0.61 MB`,
  `settingsTabButtonCount=5`, `selectedTabCount=1`, no horizontal overflow,
  `transport=websocket`.

## Required Follow-Up

- Record production route evidence after the orchestrated merge/deploy.
- Record package/upload evidence and the external itch.io URL before marking
  external publication complete.
- Keep the multiplayer server URL strategy visible on the itch.io page before
  a public external publish.
