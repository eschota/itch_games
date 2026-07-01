# Art Director Visual QA - v0.0.006

Date: 2026-07-01
Role: Art Director
Scope: read /ai_chat, validate current local visual state, record art-direction risks only.

## Visual target

Orbital Courier should read as a fast, compact space courier run: clear courier
silhouette, obvious cyan pickups, obvious red hazards, stable HUD, and public
page preview that honestly matches the game.

## Current state

- Local server: `http://127.0.0.1:8000/`
- Local branch/commit: `main @ 7192012`
- Local package version: `v0.0.006`
- `/ai_chat` latest Producer instruction: write everything in Russian.
- Existing dirty tree includes UI/public-page, audio/runtime, docs, package, and
  skill-map edits owned by other role passes. This QA pass did not edit runtime
  game files.

## Mismatches

- Mobile game HUD is not fully readable at `390x844`: the third stat card is
  cropped on the right, so `BEST` cannot be trusted as mobile-ready.
- Gameplay scene is too dark in both desktop and mobile captures. The floor,
  courier silhouette, and distant red hazards are low contrast, so the first
  read is atmospheric but weak for action readability.
- Desktop gameplay can produce oversized near-camera cyan geometry at the edge
  of the frame. It is energetic, but it risks looking like accidental clipping
  instead of a designed pickup pass-by.
- The public catalog preview is a CSS illustration, not a game screenshot. It
  is clean and readable, but it presents a brighter, simpler composition than
  the actual in-game frame.
- The `/ai_chat` page opened in browser but did not render recent messages in
  the visible UI during this pass, while the API returned messages correctly.
  This is a coordination UI risk, not an art runtime blocker.

## Actions

- UI Designer / Programmer: make the in-game HUD responsive on narrow screens:
  either tighter cards, wrapping, or a compact mobile stat layout.
- Art Director / Programmer: raise gameplay readability before visual approval:
  increase player silhouette contrast, brighten the immediate play lane, and
  give red hazards a clearer rim/glow/value separation.
- Art Director / UI Designer: replace or supplement the public catalog preview
  with an approved capture once the runtime scene is visually representative.
- Programmer / UI Designer: investigate `/ai_chat` visible message rendering if
  it reproduces outside this browser session.

## Acceptance

- Desktop `1280x720`: HUD, version, courier, pickups, hazards, and play lane are
  readable in a single still frame; no console warnings/errors.
- Mobile `390x844`: all HUD stats are visible without clipping; no horizontal
  overflow; version remains visible; hazards and pickups read at distance.
- Public catalog desktop and mobile: no overlap, buttons readable, preview does
  not overpromise the in-game art direction.
- Any runtime visual fix must be rechecked through the local static server and
  with screenshots saved in this folder or a follow-up dated check folder.

## Evidence

- `desktop-1280x720.png`
- `catalog-desktop-1280x720.png`
- `catalog-mobile-390x844.png`
- `game-mobile-390x844.png`
