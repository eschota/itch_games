# UnSoccer UI And Settings Redesign Brief v0.0.008 / Runtime v0.0.009

Use this brief for the next UnSoccer UI/settings pass across the live game,
local public page, and itch.io presentation.

## Scope

- Surface: `https://io-games.mecharulez.com/unsoccer/`, local catalog,
  generated itch.io package, and future external itch.io page.
- Historical audit snapshot checked 2026-07-01: production/public route evidence
  was split between `v0.0.007` and `v0.0.008`. Keep that as production-history
  context, not as the current local implementation state.
- Runtime implementation status checked 2026-07-01 locally: the UI/settings pass
  is implemented in source and built client target `v0.0.009`; headless Chrome
  evidence is recorded in `unsoccer-ui-runtime-smoke-v0.0.009.json` and
  `unsoccer-ui-runtime-smoke-v0.0.009.png`.
- External itch.io publication is still not claimed complete until the public
  URL, uploaded zip, live route, screenshots, API/server health, and ledger all
  agree on the same version.
- This document originated as the design source-of-truth; it now also records
  the `v0.0.009` runtime implementation handoff/evidence.

## Product Promise

UnSoccer should read as fast browser ragdoll football in a messy residential
yard: obvious teams, obvious ball state, obvious connection state, and enough
chaos to be funny without hiding the controls.

The current UI is too thin for a public multiplayer page. Players need to know
three things before touching the canvas:

- Am I connected, playing, spectating, reconnecting, or stale?
- Which team and controls do I have right now?
- Can I fix movement, audio, graphics, and browser performance without leaving
  the match?

## Itch.io Reference Scan

Source pages checked on 2026-07-01:

- Top HTML5 Soccer tag page:
  `https://itch.io/games/html5/tag-soccer`
- Top HTML5 Football tag page:
  `https://itch.io/games/html5/tag-football`
- Soccer Physics:
  `https://ottoojala.itch.io/soccer-physics`
- A Small World Cup:
  `https://rujogames.itch.io/a-small-world-cup`
- Penalty Kick '91:
  `https://kidphoenx.itch.io/penalty-kick-91`
- FIFA 23 [BETA]:
  `https://weepypuppy60.itch.io/fifa-23-beta`
- Toasterball prototype:
  `https://studiocrafteurs.itch.io/toasterball`

| Reference | Observed UI pattern | Lesson for UnSoccer |
| --- | --- | --- |
| Soccer Physics | The page sells one-button/two-button play and local multiplayer immediately. | Keep the first-run control promise short and visible. Do not bury movement in a long help panel. |
| A Small World Cup | The page highlights updates for pause, settings, sound/music, difficulty, UI, graphics, and mobile/touch input. | Settings are part of the product, not a debug afterthought. Pause/settings must be reachable during play. |
| Penalty Kick '91 | The page separates striker and goalkeeper roles and gives role-specific controls. | UnSoccer should show player/spectator/team role before showing generic controls. |
| FIFA 23 [BETA] | The web listing warns that the web menu is weaker than the app version. | Avoid shipping an itch/web UI that looks like a lesser port. The browser version is the primary product surface. |
| Toasterball | The page presents simple controls, custom matches, variants, arenas, gamepad support, and high contrast accessibility. | Use simple match controls plus advanced settings for people who want to tune rules, input, readability, and performance. |

## Information Architecture

The game needs six UI states. Each state should share the same visual language
and should not resize the canvas when it appears.

1. Boot and connect
   - Fullscreen canvas starts immediately.
   - Center overlay shows game title, connection progress, server endpoint,
     and primary action if the browser blocks audio or focus.
   - Bottom-left always shows version, build, and transport.

2. Playing
   - HUD is compact and edge-aligned.
   - Score, timer/phase, team, role, weather, ping, and last action are visible.
   - Contextual controls are available but never cover the local player, ball,
     or goal line.

3. Spectating
   - Player role label changes to `Spectator`.
   - Show why: room full, connecting late, or explicit spectate mode.
   - Offer camera/player follow choices without implying that input controls
     will affect the match.

4. Paused/settings
   - Use a modal shell with tabs, not a long single panel.
   - Gameplay keeps rendering behind a restrained scrim.
   - `Resume` and `Apply` are always reachable by keyboard and pointer.

5. Goal/reset
   - Center event banner: team color, scorer/last contact when available,
     short countdown, and reset state.
   - No persistent celebratory overlay that hides restart or reconnect status.

6. Disconnect/version mismatch
   - Dedicated warning panel with current server/client version, retry state,
     and `Reload` when a new deployed build is detected.
   - Preserve the last useful match snapshot behind the warning when possible.

## HUD Layout

Use fixed-position regions with stable dimensions:

- Top center: scoreline, match phase, reset countdown.
- Top left: local player chip with team color, player name, role, and input
  mode.
- Top right: server status, ping, transport, interpolation/fallback indicator.
- Right edge: compact event feed for goal, join/leave, reconnect, contact,
  audio unlock, and version update events.
- Bottom left: version badge and game weight/traffic cost must be adjacent and
  always visible. Show build hash when available, package/live mismatch, and
  optional network bytes without replacing the player-facing weight text.
- Bottom center: contextual controls. Show the three most relevant commands
  only: move, kick, head hit/settings. Expand details only on hover/focus or in
  the settings panel.
- Bottom right: small buttons for settings, audio mute, fullscreen, and
  camera reset. Use icons plus tooltips where available.

HUD text should be short Russian player-facing copy in the shipped game, while
internal debug labels stay English only in QA data attributes or developer
panels.

## Visual Direction

- Shape language: crisp 6px or 8px radii, strong outlines, no soft card piles.
- Palette: pitch green, cold snow/slush highlights, blue team, orange team,
  white field markings, dark transparent HUD panels, warm warning amber.
- Typography: compact, readable, no viewport-width font scaling.
- Motion: quick fade/slide for panels, no bouncy animation over critical match
  information.
- Team readability: color plus pattern/icon, not color alone.
- Weather readability: weather effects must stay behind HUD contrast surfaces.
- HUD contrast must be proven across morning, day, golden-hour, and night
  lighting states, not only the current dark pitch.

## Settings Overlay

Open settings with `Esc`, the cog button, or the future gamepad/menu command.
Use tabs:

- Controls
- Audio
- Graphics
- Gameplay/Network
- Accessibility

Always include:

- `Resume`
- `Apply`
- `Reset tab`
- `Reset all`
- Unsaved-changes marker
- Local persistence status

Persist settings in `localStorage` under a namespaced key such as
`unsoccer.settings.v1`. If stored settings are incompatible with a future
schema, migrate or reset with a visible note.

## Controls Settings

This is the highest-priority setting area because Producer feedback called out
weak controls and inversion/remapping.

Required controls:

- Movement model segmented control:
  - `Screen-relative`: W/up moves toward top of screen, S/down moves toward
    bottom of screen.
  - `Team-goal relative`: W/up moves toward the opponent goal; side changes
    can mirror the axis.
  - `Camera-relative`: movement follows the current camera yaw if camera
    rotation becomes player-controlled later.
- Axis toggles:
  - Invert forward/back.
  - Invert left/right.
  - Mirror controls when team side changes.
- Remap actions:
  - Move forward.
  - Move back.
  - Move left.
  - Move right.
  - Left-foot kick.
  - Right-foot kick.
  - Head hit.
  - Pause/settings.
  - Camera reset.
  - Mute audio.
- Conflict handling:
  - Detect duplicate bindings before apply.
  - Offer `Replace`, `Cancel`, and `Reset action`.
  - Do not allow a required action to become unbound without warning.
- Input test pad:
  - A small live diagram that lights movement axes and kick/head actions.
  - Shows active device: keyboard, mouse, touch, future gamepad.
- Touch/iframe:
  - Keep touch controls optional and compact for itch embeds.
  - Prevent gameplay pointer capture from eating settings controls.

Recommended default:

- Keep movement screen-relative for browser players until playtesting proves
  team-goal relative is easier. Add the team-relative option for advanced
  players and for future competitive play.

## Audio Settings

Required controls:

- Master volume.
- Music/ambience volume.
- SFX volume.
- Crowd/weather volume.
- UI volume.
- Mute all.
- Mute when browser tab is backgrounded.
- Test sound button for each bus.
- Audio unlock state: locked, unlocking, running, blocked by browser, or muted.

Required feedback:

- If browser audio is locked, show a small `Click to enable sound` state that
  does not block play.
- If sound events are blocked, expose it in QA/debug status without confusing
  normal players.
- Persist audio settings locally.

## Graphics Settings

Required controls:

- Quality preset: Low, Balanced, High.
- Resolution scale: 60%, 75%, 100%.
- Shadows toggle.
- IBL/environment lighting toggle or QA indicator.
- Visible sun toggle or QA indicator.
- Day-cycle mode: Off, Live loop, QA scrub.
- Day-cycle duration/status: default roughly 120 seconds per loop, with a
  visible QA readout when the graphics/debug panel is open.
- Weather particles toggle.
- Field debris/slush detail toggle.
- Camera shake toggle.
- Motion interpolation toggle.
- FPS cap: 30, 60, Auto.
- Reduce flashing/effects.
- High contrast HUD.

Rules:

- Low should prioritize stable input and network clarity.
- Balanced is default for public/itch.
- High may add visual effects only if the HUD remains readable.
- Graphics changes must not require a page reload unless the option says so.
- If IBL, visible sun, or the 120s day loop is not controllable by players, the
  Graphics tab must still expose QA-readable indicators so Art/Tester can prove
  the lighting state in screenshots.

## Gameplay And Network Settings

Required controls/status:

- Server endpoint display.
- Transport: WebSocket, HTTP fallback, reconnecting.
- Ping and last snapshot age.
- Interpolation buffer display/tuning if exposed.
- Auto-reconnect toggle.
- Reload prompt when live client/server version differs.
- Spectator camera mode.
- Show/hide debug network counters.

Do not expose raw developer jargon as the default UI. Keep advanced terms under
an expandable `Network details` area.

## Accessibility Settings

Required controls:

- Larger HUD.
- High contrast team labels.
- Patterned team markers.
- Reduce motion.
- Reduce weather opacity.
- Captions for major audio cues: goal, whistle/countdown, heavy collision,
  reconnect, version update.
- Keyboard-only settings navigation.

Acceptance:

- Settings modal must be usable without a mouse.
- Long Russian labels must not overflow buttons on 320px-wide mobile screens.
- Colorblind users must distinguish team/goal state without relying only on
  blue/orange.

## Public Page And Itch.io Requirements

Local public route and itch page must align with the redesigned UI:

- Update `unsoccer-public-pages.md` and `unsoccer-itch-page-copy.md` after the
  runtime UI exists.
- Screenshots must include:
  - clean kickoff HUD,
  - settings Controls tab,
  - Audio/Graphics settings,
  - Graphics tab or QA overlay showing IBL/sun/day-cycle state,
  - morning, day, golden-hour, and night HUD contrast frames once the lighting
    pass exists,
  - match event or goal banner,
  - spectator/network state if available.
- Itch short description should promise browser multiplayer ragdoll soccer and
  mention that settings/remapping exist once shipped.
- The uploaded itch package, live `/unsoccer/` route, screenshots, and ledger
  must show the same version.
- The external itch.io URL remains unverified until recorded in
  `itch-publication-ledger.md`.

## Implementation Handoff

Suggested Programmer-owned file scope:

- `unsoccer/client/src/settings.ts`: new client-only settings module for
  `unsoccer.settings.v1`, defaults, validation, migration, reset, and safe
  `localStorage` load/save.
- `unsoccer/client/src/input-map.ts`: new pure input mapping module for
  key/mouse bindings, duplicate detection, inversion, screen-relative and
  team-goal-relative movement, and `InputState` output.
- `unsoccer/client/src/main.ts`: wire HUD state, settings shell, input mapping,
  persistence, graphics flags, and QA data attributes.
- `unsoccer/client/src/audio.ts`: expose audio bus volumes and test events if
  not already available.
- `unsoccer/client/src/weather.ts`: apply graphics settings for particles,
  hazard detail, and reduced weather opacity.
- `unsoccer/client/index.html`: ensure metadata/title reflects the shipped
  version and public promise.
- `unsoccer/client/src/styles.css`: HUD regions, modal tabs, responsive
  controls, focus states, and mobile no-overlap rules.
- `unsoccer/client/package.json`, root `package.json`, and skill/version docs:
  synchronize the target release.

Preferred architecture:

- Keep the client architecture plain DOM, CSS, and TypeScript. Do not introduce
  a UI framework for this pass.
- Extract settings types/defaults/migration into a small client module before
  the UI grows further. If the current codebase does not have modules for this,
  create `unsoccer/client/src/settings.ts` and keep DOM wiring in `main.ts`.
- Keep all settings local-first; do not add server persistence for this pass.
- Keep the authoritative server protocol unchanged. The server should still
  receive only the resolved `InputState`; inversion and remapping are client
  interpretation details.
- Keep audio cues server-state or server-audio-event driven. Do not trigger
  important gameplay audio purely from predicted local input.
- Emit QA-readable `data-*` attributes for selected movement mode, inversion
  toggles, active tab, audio bus values, graphics preset, network transport,
  and version mismatch state.

Current architecture notes from read-only code audit and v0.0.009 implementation:

- Runtime is still mostly centralized in `unsoccer/client/src/main.ts`, but the
  first UI/settings split now exists in `unsoccer/client/src/settings.ts` and
  `unsoccer/client/src/input-map.ts`.
- Existing QA conventions use `document.documentElement.dataset` and
  `window.unsoccerDebug.snapshot()`. Reuse those for UI/settings acceptance.
- The UI/settings runtime target is `v0.0.009`; do not describe it as shipped in
  `v0.0.008`. Generated `dist/` files remain build output and should not drive
  staging decisions.
- The implemented pass updates HUD hierarchy, settings modal tabs, remappable
  input, audio/graphics/network/accessibility controls, runtime audio/weather
  settings hooks, and QA-readable UI datasets/debug state.

Suggested release phasing:

1. UI skeleton and persistence:
   - HUD hierarchy, settings modal, controls inversion toggles, audio/graphics
     sliders/toggles, `localStorage`, keyboard navigation.
2. Remapping and input test pad:
   - configurable key/mouse bindings, conflict handling, reset controls.
3. Public-page update:
   - new screenshots, itch copy, ledger, package verification.
4. Polish:
   - touch controls, accessibility refinements, gamepad path if requested.

## Acceptance Checklist

- Live page shows the correct version badge and no stale public route assets.
- Bottom-left HUD shows the game version and game weight/traffic cost next to
  each other in normal play, not only in debug output.
- Settings opens with `Esc` and cog button.
- Controls inversion visibly changes movement direction in a two-client smoke.
- Remapped keys persist after reload.
- Audio sliders change procedural audio gain without breaking browser unlock.
- Graphics quality changes weather/visual load without hiding HUD.
- Graphics/QA state proves IBL, visible sun, and the roughly 120s day loop when
  those art features are implemented.
- HUD contrast passes over morning, day, golden-hour, and night frames.
- WebSocket and HTTP fallback states are visible and QA-readable.
- Two desktop clients and one mobile-width viewport have no HUD overlap.
- Spectator state is clear when more than four clients connect.
- Itch package excludes internal skills/docs and has `index.html` at zip root.
- Public page screenshots and publication ledger record the same version as the
  deployed route.
- A repeatable browser/UI gate exists for settings persistence and layout, or
  the missing gate is recorded as a release risk.

Recommended new validation command:

- Add a Playwright-backed `test:unsoccer:ui` gate for settings open/close,
  remapping persistence, inversion, mobile layout, audio controls, graphics
  toggles, and QA `data-*` contracts. This adds dependency weight, but it is the
  cleanest way to stop UI regressions from returning.

Runtime evidence captured for `v0.0.009`:

- `npm run build:unsoccer` passed with client badge `v0.0.009 / 0.61 MB`.
- `npm run test:unsoccer:acceptance` passed for authoritative server mechanics
  and server-authored audio events.
- Headless Chrome CDP smoke with the local server on `127.0.0.1:8787` confirmed
  `transport=websocket`, nonblank canvas screenshot, visible `v0.0.009 / 0.61
  MB`, settings modal open state, controls tab selected, audio master control,
  graphics quality control, and remap text for forward movement.

## Open Design Questions

- Should the default movement be screen-relative or team-goal relative after
  the first playtest with inversion toggles?
- Should the public itch page market the game as `Ragdoll Soccer II` or keep
  `UnSoccer` as the visible primary name?
- Should touch controls be shipped in the same release as remapping, or in a
  separate mobile/itch-embed pass?
