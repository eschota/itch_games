# UnSoccer Audio Pass v0.0.002

Date: 2026-07-01
Role: Sound Designer
Task: `task_sound_designer_audio`
Runtime scope: `unsoccer/client/src/audio.ts`, `unsoccer/client/src/main.ts`

## Audio Map

- Browser unlock: short quiet UI confirmation after the first `keydown`,
  `pointerdown`, or `wheel` gesture resumes the Web Audio context.
- Connection: two-note up/down cues for connect and disconnect.
- Local join: short role cue for player or spectator assignment.
- Roster changes: quiet cues for join, leave, and spectator role changes based
  on authoritative `ServerState.players` diffs.
- Ball contacts: distinct server-confirmed one-shots for `left`, `right`,
  `head`, and `body` from `PlayerSnapshot.lastAction/lastActionAt`.
- Goal: team-colored stinger from `state.score` diffs, not from local
  prediction.
- Countdown: short warning ticks from `ServerState.countdown`.
- Ball motion: procedural rolling layer follows authoritative ball velocity.
- Stadium bed: quiet procedural crowd/noise layer follows active player count,
  connection state, visibility, and day/night lighting.

## Sources

- No external audio files were used.
- All shipped sound is generated at runtime with browser Web Audio oscillators,
  filtered procedural noise, gain envelopes, panning, and compression.
- License burden: none beyond the project code license because no third-party
  samples, libraries, or downloaded audio assets are shipped.

## Edits

- No offline audio edits or exported assets.
- Mix is encoded as reusable synthesis parameters:
  - low pitch/noise impact for body contact,
  - asymmetric foot transients for left/right kicks,
  - sharper mid-band tick for head contact,
  - broader noise/chord goal stinger,
  - low-volume continuous roll/crowd layers.
- Master output uses a light dynamics compressor and conservative gain staging
  so repeated football contacts do not dominate the HUD/gameplay mix.

## Implementation

- Added `UnSoccerAudio` in `unsoccer/client/src/audio.ts`.
- `main.ts` unlocks audio only from real user gestures, avoiding browser
  autoplay violations.
- One-shots are triggered from inbound authoritative server snapshots:
  - per-player dedupe map `playerId -> lastActionAt`,
  - score diffs for goals,
  - player/role diffs for join/leave/spectator cues,
  - countdown second diffs for restart ticks.
- Continuous mix is updated during render-state application from ball speed,
  active player count, current connection state, and day-cycle daylight.
- `window.unsoccerDebug.snapshot().audio` exposes support/unlock/context/mix
  state for browser QA.

## Acceptance

- `npm run typecheck:unsoccer`: passed on 2026-07-01 after implementation.
- Required remaining validation before release acceptance:
  - `npm run build:unsoccer`,
  - `npm run package:unsoccer`,
  - browser gesture test proves `audio.unlocked === true` and context is
    `running`,
  - no console audio/autoplay errors,
  - zip contains no unexpected remote audio files or internal docs,
  - multiplayer/browser smoke confirms server-state driven cues do not fire on
    missed local input.

## Credits

- No attribution required. This pass ships procedural runtime synthesis only.

## Risks

- The current `unsoccer` tree is still untracked in git, so normal `git diff`
  does not display the new files until they are intentionally added.
- Deterministic kick/goal audio acceptance still needs server test-mode or a
  headless gameplay harness; current snapshot diffing is correct, but specific
  physics events are not deterministic without placement hooks.
