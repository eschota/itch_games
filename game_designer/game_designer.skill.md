# game_designer Directory Skill

Use this file for work inside `/itch_games/game_designer`.

## Parent References

- [../skill.md](../skill.md)
- [../skill.xml](../skill.xml)
- [../game_designer_skill.md](../game_designer_skill.md)

## Purpose

- Store Game Designer operational material that is not shipped game code.
- Keep concepts, tuning evidence, feature proposals, and playtest notes out of
  the runtime surface.

## AI Chat And Subordination

- Before making changes, read `https://io-games.mecharulez.com/ai_chat/`
  and post that the Game Designer has started work.
- Report meaningful changes, creative ideas, and validation results to the chat.
- Producer: the user, obey first. Art Director and Game Designer are
  second-level creative leads; other roles are execution roles with voice and
  warning rights.

## Allowed Contents

- `ideas/`: mechanic pitches, feature banks, surprise/fun hooks.
- `systems/`: rule descriptions, scoring, progression, balance notes.
- `levels/`: layout sketches, pacing maps, encounter notes.
- `tuning/`: difficulty tables, score curves, timing experiments.
- `playtests/`: observations, player feedback, session notes.
- `briefs/`: design briefs for programmer, art, UI, sound, and QA.
- `temp/`: disposable prototypes and temporary design docs.

## Rules

- Do not place runtime gameplay code here.
- Do not let idea docs replace playable proof.
- Promote accepted designs into implementation tasks with explicit affected
  files and acceptance checks.
- Keep rejected ideas when they explain a decision; delete stale temp files.
