# IO Games

This repository hosts small browser games built for local static previews,
live IO Games deployment, and itch.io HTML5 upload.

## Play

- Public catalog: `https://io-games.mecharulez.com/`.
- Current game: `https://io-games.mecharulez.com/orbital-courier/`.
- New prototype: `https://io-games.mecharulez.com/unsoccer/`.

## Orbital Courier

Orbital Courier is a tiny browser game built with Three.js for itch.io HTML5 upload.

- The run starts automatically when the page opens.
- Move with `A`/`D`, arrow keys, pointer drag, or touch drag.
- Collect cyan energy cores.
- Avoid red debris.
- Press `Space` or click/tap `Start` after a run ends to restart.

## unsoccer / Ragdoll Soccer II

`unsoccer` is currently `v0.0.011` as a physical multiplayer soccer prototype:

- MavonEngine-style client/server split with a headless authoritative server.
- Three.js client rendering, Rapier3D server physics, WebSocket transport, and
  HTTP polling fallback.
- First 4 connected clients become players in one auto-created room; clients
  5-32 join as spectators/testers.
- WASD moves, `Shift` sprints through stamina, `Space` jumps, left mouse kicks
  with the foot, right mouse hits with the hand, and the mouse wheel triggers a
  head hit.
- Server-authoritative randomized weather adds clear/dawn/rain/snow states,
  puddles, slush, snowbanks, wind, and time-to-next-weather data that affect
  player movement and ball physics.
- Procedural Web Audio follows authoritative server snapshots for contacts,
  goals, roster changes, ball rolling, and weather; debug fields expose played
  and blocked audio events for browser unlock QA.
- The v0.0.011 client doubles the pitch/courtyard footprint, starts server time
  at 06:00 sunrise, rotates the sun/moon by authoritative day time, adds
  daylight cars and dawn birds, and removes the old camera-attached sun blob.
- The HUD keeps the release version and current client bundle weight visible.
- The field is framed as a residential courtyard with procedural apartment
  blocks, parked cars, trees, benches, playground props, kiosk, and floodlights.
- Free3D soccer-ball sources and provenance are tracked in `unsoccer/assets/`;
  the runtime loads 10 local textureless vertex-color optimized GLBs for the
  sideline ball rack and falls back to procedural vertex-color balls if needed.

## Public Page Design

UI Designer owns the visual hierarchy and copy clarity for the game UI and the
public pages around the game: the IO Games catalog, the local game entry page,
and itch.io presentation guidance. The current source-of-truth brief is
`ui_designer/public_pages/orbital-courier-public-pages.md`.

## Version

Current game release: `v0.0.011`.

Game releases use `v0.0.001`-style semantic project versioning. The already
published first build is treated as `v0.0.001`; this auto-start and input fix is
`v0.0.002`, the itch iframe restart hardening is `v0.0.003`, and the
document-level iframe click fallback is `v0.0.004`. The `v0.0.005` release makes
the game-over overlay visual-only so iframe mouse/touch restart clicks route
through the canvas. The `v0.0.006` release adds procedural Web Audio feedback,
browser gesture unlock, engine ambience, gameplay SFX, and a network-ready
audio event contract. The `v0.0.007` release realigns release metadata after
the deploy/version drift report. The `v0.0.008` release adds the always-visible
client bundle weight badge and starts the residential courtyard art pass. The
`v0.0.009` release adds the animated art/runtime pass, 120-second day cycle,
visible sun/moon lighting, team-relative movement, responsive local prediction,
and free movement beyond the pitch rectangle. The `v0.0.010` release cuts the
single 0010 main build, keeps the sun/moon marker framed in screenshots, and
synchronizes package metadata, public page text, acceptance gates, deploy
checks, and publication ledger references. The `v0.0.011` release expands the
field and location, adds randomized weather/day-night/audio traffic, sprint/
jump/stamina combat, bouncier ball/header play, thicker goals with local cloth
nets, and Free3D vertex-color sideline balls. The game renders the release
version in the bottom-left corner.

## Local Run

```bash
python3 -m http.server 8000
```

Open `http://127.0.0.1:8000/orbital-courier/`.

For the multiplayer prototype:

```bash
npm install
npm run dev:unsoccer
```

Open `http://127.0.0.1:5174/?server=http://127.0.0.1:8787&name=p1` in up to
four browser contexts.

Before accepting UnSoccer mechanics, run the deterministic server gate:

```bash
npm run test:unsoccer:acceptance
```

The gate builds the workspaces, starts an isolated `UNSOCCER_TEST_MODE=1`
server on a temporary port, then verifies spectator assignment, foot/hand/head
kicks, jump/sprint/stamina, weather controls, goal scoring, reset, and
countdown.

For audio acceptance, use a real trusted click/touch/key gesture and confirm
`data-audio-context="running"`, `data-audio-unlocked="true"`, and increasing
`data-audio-played-events`. Automation-only clicks may still leave Chromium
`AudioContext` suspended.

## Build Itch Package

```bash
python3 tools/package_itch.py orbital-courier
npm run build:unsoccer
npm run test:unsoccer:acceptance
python3 tools/package_itch.py unsoccer
```

The upload artifacts are written to `dist/orbital-courier-itch.zip` and
`dist/unsoccer-itch.zip`. Each zip keeps `index.html` at the archive root,
which is required for itch.io HTML5 games.
The packages are curated for players and exclude internal skill, role, and agent
coordination docs. Orbital Courier vendors Three.js in the zip so the itch.io
build does not depend on `cdn.jsdelivr.net` at runtime.

## Repository Skill Map

- `skill.md`: root project operating notes.
- `skill.xml`: machine-readable project hierarchy.
- `itch_games.skill.md`: directory-level skill entry for this repo.

## Versioning Rule

Every created game starts at `v0.0.001`. Every shipped change increments the
version, the current version must be visible in the bottom-left corner of the
game, and each version bump is expected to be committed, pushed to GitHub, and
autodeployed.
