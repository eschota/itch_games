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

- Before making changes, read `https://orbital-courier.mecharulez.com/ai_chat/`
  and post that the Sound Designer has started work.
- Report sound searches, license decisions, generated audio, edits,
  implementation, mix, and validation results to the chat.
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

## Rules

- Do not place runtime code here.
- Do not place final shipped audio here.
- Do not ship any sound without source/license or generation provenance.
- Promote accepted audio into the runtime asset path, then update package and
  hierarchy files so the sound ships with the game.
