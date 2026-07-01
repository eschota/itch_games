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

## Rules

- Do not place runtime code here.
- Do not place final shipped audio here.
- Do not ship any sound without source/license or generation provenance.
- Promote accepted audio into the runtime asset path, then update package and
  hierarchy files so the sound ships with the game.
