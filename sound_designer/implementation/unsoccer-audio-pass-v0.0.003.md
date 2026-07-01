# UnSoccer Audio Pass v0.0.003

Date: 2026-07-01
Role: Sound Designer / Orchestrator
Task: `task_sound_designer_audio`
Runtime scope: `unsoccer/client/src/audio.ts`, `unsoccer/client/src/main.ts`

## Audio Map

- Browser unlock: first successful trusted user gesture resumes Web Audio,
  starts ambience, and plays a quiet UI confirmation.
- Network sync after unlock: if the authoritative server has already connected
  or assigned a role before audio unlock, the client plays the connection cue
  and local role cue after unlock instead of losing them silently.
- Connection: two-note up/down cue for connect and disconnect.
- Local join: short role cue for active player or spectator assignment.
- Roster changes: quiet cues from authoritative `ServerState.players` diffs.
- Ball contacts: distinct one-shots for server-confirmed `left`, `right`,
  `head`, and `body` actions from `PlayerSnapshot.lastAction/lastActionAt`.
- Goal: team-panned stinger from `state.score` diffs.
- Countdown: short ticks from authoritative restart countdown seconds.
- Weather: puddle, slush, and snowbank one-shots when the local player or ball
  enters a server-authored hazard.
- Continuous mix: procedural ball roll, crowd bed, and snow/weather bed follow
  server state, daylight, visibility, active players, ball speed, and hazard
  drag.

## Sources

- No external audio files were used.
- Shipped sound remains procedural runtime synthesis using Web Audio
  oscillators, filtered noise, gain envelopes, panning, and compression.
- License burden: none beyond the project code license because no third-party
  samples or downloaded audio assets are shipped.

## Edits

- Added runtime counters for played and blocked audio events.
- Added `lastEvent` and `lastBlockedEvent` debug fields so QA can distinguish
  missing unlock from missing network triggers.
- Added first-unlock hydration: connection and local role cues are replayed
  after a successful unlock, and audio observation is primed from current
  `ServerState` to avoid a burst of stale roster/score cues.
- Added broader gesture coverage through capture-phase `pointerdown`,
  `mousedown`, and `touchstart`, while preserving keyboard and wheel unlock
  paths.

## Implementation

- `unsoccer/client/src/audio.ts`
  - `unlock()` now returns whether this call was the first successful unlock.
  - Public cue methods count blocked events when Web Audio is not yet running.
  - `AudioRuntimeSnapshot` exposes `playedEvents`, `blockedEvents`,
    `lastEvent`, and `lastBlockedEvent`.
- `unsoccer/client/src/main.ts`
  - Mirrors the new fields into `html[data-audio-*]`.
  - On first successful unlock, plays current connection/local role cues and
    primes audio observation from the latest authoritative state.
  - Keeps all gameplay cue triggers driven by server snapshots, not local input
    prediction.

## Acceptance

- `npm run typecheck:unsoccer`: PASS on 2026-07-01.
- `npm run test:unsoccer:acceptance`: PASS on 2026-07-01.
  - Validates `v0.0.003` health, 5-client role assignment, left/right/head
    kicks, body contact, and goal reset/countdown through isolated server test
    hooks.
- Local default server cleanup:
  - stale `127.0.0.1:8787` server returning `v0.0.001` was stopped,
  - fresh `UNSOCCER_PORT=8787 UNSOCCER_TEST_MODE=1 UNSOCCER_LOCAL_ICE=1 npm run
    server:unsoccer` now reports `unsoccer v0.0.003`.
- Browser smoke:
  - URL:
    `http://127.0.0.1:5177/?server=http://127.0.0.1:8787&name=AudioQA`
  - Before gesture: `data-audio-blocked-events="6"`,
    `data-audio-last-blocked-event="roster"`,
    `data-audio-played-events="0"`, `data-audio-context="missing"`.
  - After in-app automation click/key: `data-audio-unlock-attempts="4"`,
    `data-audio-context="suspended"`,
    `data-audio-user-activation="inactive:fresh"`.

## Credits

- No attribution required. This pass ships procedural runtime synthesis only.

## Remaining Risk

- In-app automation still does not grant Chromium trusted user activation, so
  audible acceptance still needs a real browser click/touch/key gesture that
  proves `data-audio-unlocked="true"`, `data-audio-context="running"`, and
  `data-audio-played-events` increasing.
- Current deterministic acceptance validates server actions that drive audio,
  but it does not listen to or record rendered audio output.
