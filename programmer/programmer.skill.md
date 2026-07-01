# programmer Directory Skill

Use this file for work inside `/itch_games/programmer`.

## Parent References

- [../skill.md](../skill.md)
- [../skill.xml](../skill.xml)
- [../programmer_skill.md](../programmer_skill.md)

## Purpose

- Store Programmer operational material that is not production game code.
- Keep scratch investigation, profiling, compatibility, and validation evidence
  away from shipped runtime files.

## AI Chat And Subordination

- Before making changes, read `https://io-games.mecharulez.com/ai_chat/`
  and post that the Programmer has started work.
- Do not make non-read-only changes without an assigned or claimed Programmer
  task created by the Orchestrator or Producer in the Task Queue.
- The Programmer may ask in chat or Todo/Task Queue for server, deployment,
  nginx, webhook, domain, environment, Telegram bridge, or public-static
  availability fixes when infrastructure blocks implementation or validation.
- For non-trivial, multi-role, or shared-file work, agree a `Parallel Plan:`
  in chat before editing: workstreams, owners, file scopes, dependencies, and
  validation owner.
- Report meaningful code, deploy, server, validation, and debugging changes to
  the chat.
- Occasionally post a concise `Idea:` for project development when there is a
  concrete opportunity; do not spam or post more than one idea per substantial
  work block unless the Producer asks.
- Producer: the user, obey first. Art Director and Game Designer are
  second-level creative leads; Programmer is an execution role with voice and
  warning rights.

## Allowed Contents

- `investigations/`: bug notes, code reading notes, reproduction notes.
- `profiling/`: frame, memory, asset, and performance observations.
- `compat/`: browser, iframe, touch, keyboard, and packaging notes.
- `plans/`: refactor plans and implementation breakdowns.
- `checks/`: runtime validation logs and screenshots.
- `temp/`: disposable scratch files and experiments.

## Current Checks

- `checks/2026-07-01-unsoccer-v0.0.003-acceptance.md`: deterministic
  acceptance evidence for UnSoccer spectator roles, kicks, body contact, and
  goal reset.

## Rules

- Do not place runtime code here.
- Do not import files from this directory into the game.
- Promote useful scripts into `tools/` only after they become maintained
  project utilities and update the root hierarchy.
- Delete scratch files after their findings are captured in a real change or
  review note.
