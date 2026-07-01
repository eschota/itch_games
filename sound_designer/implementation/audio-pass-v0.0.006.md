# Orbital Courier Audio Pass v0.0.006

## Audio Map

- `run_start`: short rising launch cue for manual restart and logged auto-start.
- `core_collect`: bright three-note reward cue, panned by core lane.
- `shield_hit`: filtered noise impact plus low falling tone, panned by hazard lane.
- `near_miss`: short band-passed whoosh when debris passes close without impact.
- `run_complete`: descending fail stinger with soft debris tail.
- Continuous motion: low engine layer that fades in after browser gesture unlock,
  follows run state, speed, and lateral input.
- Ambience: subtle procedural space drone after unlock.

## Sources

- No downloaded or third-party audio assets are shipped in this pass.
- All sounds are synthesized at runtime with Web Audio oscillators, filters,
  generated noise buffers, gain envelopes, and stereo panning in
  `orbital-courier/src/main.js`.
- Licensing result: original procedural code/audio, no attribution required.

## Edits

- Sounds are shaped in code with short envelopes and low master gain.
- No external files are trimmed, normalized, looped, or exported.
- Runtime package size remains lightweight because no audio binary assets are
  added.

## Implementation

- `createAudioSystem()` owns Web Audio context creation, browser gesture unlock,
  procedural SFX, ambience, engine loop, and mute control.
- `emitAudioEvent()` creates semantic audio events and dispatches
  `orbital-courier:audio-event` on `window`.
- `window.orbitalCourierAudio` exposes:
  - `unlock()`
  - `setMuted(muted)`
  - `emit(type, payload)`
  - `receiveNetworkEvent(networkEvent)`
  - `recentEvents()`
  - `isUnlocked()`
  - `supported()`
- Local events include `network` payloads with id, source id, sequence,
  version, position, game time, intensity, and `replicate`.
- Future multiplayer code should replicate confirmed gameplay facts, not raw
  audio playback commands. Remote clients call `receiveNetworkEvent()` and rely
  on id dedupe to avoid double SFX during prediction/reconciliation.

## Acceptance

- `node --check orbital-courier/src/main.js`: passed.
- `npm run package`: passed; wrote `dist/orbital-courier-itch.zip`.
- Package listing checked: `index.html`, `LICENSE`, `src/main.js`,
  `src/styles.css`.
- Local browser smoke at `http://127.0.0.1:8000/orbital-courier/`: passed for
  visible render, auto-running HUD, `v0.0.006` badge, restart-by-Space flow, and
  zero warning/error console logs.
- Browser audio diagnostics before gesture: `audioSupported=true`,
  `audioState=uncreated`, `lastAudioEvent=run_start`, `audioEventCount=1`.
- Browser audio diagnostics after synthetic pointer gesture:
  `audioUnlockRequested=true`, `audioState=suspended`, zero warning/error logs.
  The in-app browser automation did not grant real audio output permission, so
  audible playback still needs a manual user-gesture check in a normal browser.

## Credits

- Procedural original audio by the project runtime. No external credits needed.
