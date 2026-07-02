# sound_designer Directory Skill

Use this file for work inside `/itch_games/sound_designer`.

## Parent References

- [../skill.md](../skill.md)
- [../skill.xml](../skill.xml)
- [../sound_designer_skill.md](../sound_designer_skill.md)

## Purpose

- Store Sound Designer operational material that is not shipped game code and
  not final shipped audio.
- Keep source research, license evidence, generated prompts, raw sounds, temp
  edits, mix notes, and audio QA evidence out of the runtime surface.

## AI Chat And Subordination

- Before making changes, read `https://io-games.mecharulez.com/ai_chat/`
  and post that the Sound Designer has started work.
- Do not make non-read-only changes without an assigned or claimed Sound
  Designer task created by the Orchestrator or Producer in the Task Queue.
- The Sound Designer may ask in chat or Todo/Task Queue for server, deployment,
  nginx, webhook, domain, environment, Telegram bridge, or public-static
  availability fixes when infrastructure blocks audio delivery.
- For non-trivial, multi-role, or shared-file work, agree a `Parallel Plan:`
  in chat before editing: workstreams, owners, file scopes, dependencies, and
  validation owner.
- Report sound searches, license decisions, generated audio, edits,
  implementation, mix, and validation results to the chat.
- Occasionally post a concise `Idea:` for project development when there is a
  concrete opportunity; do not spam or post more than one idea per substantial
  work block unless the Producer asks.
- Producer: the user, obey first. Art Director and Game Designer are
  second-level creative leads; Sound Designer is an execution role with voice
  and warning rights.

## Allowed Contents

- `sources/`: source URLs, license notes, attribution records.
- `generated/`: generation prompts, generated raw files, selection notes.
- `raw/`: raw downloaded or recorded material before processing.
- `edits/`: temporary processed versions before runtime promotion.
- `mix/`: volume, layering, loop, and mastering notes.
- `implementation/`: audio event maps and integration notes.
- `checks/`: browser audio QA notes, package listings, trigger evidence.
- `temp/`: disposable audio experiments.

## Implementation Notes

- `implementation/unsoccer-audio-pass-v0.0.002.md`: current UnSoccer
  procedural Web Audio map, provenance, mix, integration points, acceptance,
  and residual risks.
- `implementation/unsoccer-audio-pass-v0.0.003.md`: current UnSoccer
  network-authoritative audio sync, unlock diagnostics, browser smoke evidence,
  and remaining trusted-activation risk.
- `implementation/unsoccer-audio-pass-v0.0.008.md`: current UnSoccer
  server-authored audioEvents ring buffer, client event-id cursor, acceptance
  evidence, and remaining trusted-activation risk.
- `checks/2026-07-01-unsoccer-v0.0.010-final-audio-gate.md`: final local
  v0.0.010 audio gate evidence tied to deterministic acceptance and browser
  smoke.
- `sources/unsoccer-sample-sfx-v0.0.023.md`: current free sample-SFX source
  list, license decision, runtime selection, and WebAudio integration notes for
  replacing MIDI-like procedural football/fight/celebration feedback.
- `checks/2026-07-02-unsoccer-v0.0.024-sample-sfx-pass.md`: current sample
  SFX implementation validation, package asset count/signature check, and
  acceptance evidence for the WebAudio sample pass.
- `checks/2026-07-02-unsoccer-v0.0.031-sample-envelope-pass.md`: current
  WebAudio sample attack/release smoothing evidence for abrupt sample starts
  and stops.

## Rules

- Do not place runtime code here.
- Do not place final shipped audio here.
- Do not ship any sound without source/license or generation provenance.
- Promote accepted audio into the runtime asset path, then update package and
  hierarchy files so the sound ships with the game.
