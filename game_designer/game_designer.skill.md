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
- Do not make non-read-only changes without an assigned or claimed Game
  Designer task created by the Orchestrator or Producer in the Task Queue.
- The Game Designer may ask in chat or Todo/Task Queue for server, deployment,
  nginx, webhook, domain, environment, Telegram bridge, or public-static
  availability fixes when infrastructure blocks design validation.
- For non-trivial, multi-role, or shared-file work, agree a `Parallel Plan:`
  in chat before editing: workstreams, owners, file scopes, dependencies, and
  validation owner.
- Report meaningful changes, creative ideas, and validation results to the chat.
- Occasionally post a concise `Idea:` for project development when there is a
  concrete opportunity; do not spam or post more than one idea per substantial
  work block unless the Producer asks.
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
- `briefs/unsoccer-v0.0.009-core-loop.md`: current UnSoccer Snowyard Pressure
  core-loop brief covering weather lanes, stamina, sprint, super-shot rules,
  scoring target, role handoff, and acceptance checks.
- `temp/`: disposable prototypes and temporary design docs.

## Rules

- Do not place runtime gameplay code here.
- Do not let idea docs replace playable proof.
- Promote accepted designs into implementation tasks with explicit affected
  files and acceptance checks.
- Keep rejected ideas when they explain a decision; delete stale temp files.
