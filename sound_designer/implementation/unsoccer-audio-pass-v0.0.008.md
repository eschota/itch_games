# UnSoccer Audio Pass v0.0.008

Date: 2026-07-01
Role: Sound Designer
Scope: network-authored gameplay audio events for Ragdoll Soccer II.

## Audio Map

- Roster: join, leave, and spectator assignment use short procedural roster cues.
- Kicks: left foot, right foot, head, and body contacts use existing procedural impact layers, panned from server event position.
- Goal: blue/orange goal stingers are triggered from the authoritative scoring branch.
- Countdown: reset countdown beeps are emitted by the server and consumed by clients for the last seconds.
- Weather: local hazard and ball-hazard cues remain client observed from authoritative weather state because they are continuous proximity events, not discrete shared match events.
- Ambience: rolling, crowd, and weather bed remain procedural mix layers in `unsoccer/client/src/audio.ts`.

## Sources

- No external audio files were added.
- No third-party sound libraries were downloaded.
- The pass uses procedural Web Audio synthesis already implemented in `unsoccer/client/src/audio.ts`.
- No attribution is required for this pass.

## Edits

- No waveform/audio-file edits.
- No runtime audio assets promoted into the package.
- Mix envelopes and sound colors remain in the existing procedural runtime.

## Implementation

- `unsoccer/shared/src/index.ts`: exposes `ServerAudioEvent` variants and `ServerState.audioEvents`.
- `unsoccer/server/src/index.ts`: keeps a bounded audio event ring buffer and emits roster, kick, body, goal, and countdown events from authoritative server state.
- `unsoccer/client/src/main.ts`: consumes only new server audio event ids, advances the cursor even when browser audio is locked, and exposes debug fields through `window.unsoccerDebug.snapshot()` plus `data-audio-server-*`.
- `tools/unsoccer_acceptance.mjs`: asserts roster, kick, body, goal, and countdown audio events in deterministic server acceptance.
- WebSocket acceptance verifies that a raw socket opened without app-level `join` does not create phantom roster audio, while a real WebSocket `join` receives server `audioEvents`.

## Acceptance

- `npm run typecheck --workspace @itch-games/unsoccer-shared`: passed.
- `npm run typecheck --workspace @itch-games/unsoccer-server`: passed.
- `npm run typecheck --workspace @itch-games/unsoccer-client`: passed.
- `npm run typecheck:unsoccer`: passed.
- `npm run build:unsoccer`: passed, Vite warning only for the existing 566.09 kB JS chunk.
- `npm run test:unsoccer:acceptance`: passed, including WebSocket no-join probe behavior, WebSocket join `audioEvents`, `server audioEvents roster`, and `server audioEvents kicks/body/goal/countdown`.
- `npm run package:unsoccer`: passed, wrote `dist/unsoccer-itch.zip` at 143.9 KiB.
- Local runtime smoke on `127.0.0.1:8791`: passed for `/api/health`, built-in WebSocket join/state, HTTP fallback join/state, and `audioEvents` presence in both transport states.

## Credits

No external credits or license notices are required.

## Residual Risk

- Browser autoplay policy still requires a real trusted click/touch/key before audible playback.
- Automation may confirm event ids and counters but can leave Chromium `AudioContext` suspended until a trusted user gesture.
