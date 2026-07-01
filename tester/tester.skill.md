# tester Directory Skill

Use this file for work inside `/itch_games/tester`.

## Parent References

- [../skill.md](../skill.md)
- [../skill.xml](../skill.xml)
- [../tester_skill.md](../tester_skill.md)

## Purpose

- Store Tester operational material that is not shipped game code.
- Keep test plans, evidence, bug notes, playtest observations, and creative QA
  ideas out of the runtime surface.

## AI Chat And Subordination

- Before testing or making changes, read
  `https://orbital-courier.mecharulez.com/ai_chat/` and post that the Tester
  has started work.
- Report bugs, regression results, creative QA ideas, and validation outcomes to
  the chat.
- Producer: the user, obey first. Art Director and Game Designer are
  second-level creative leads; Tester is an execution role with voice and
  warning rights.

## Allowed Contents

- `plans/`: test plans, exploratory charters, release checklists.
- `bugs/`: reproduction notes and issue logs.
- `checks/`: screenshots, videos, package listings, browser QA notes.
- `playtests/`: session notes, usability findings, fun-factor observations.
- `ideas/`: creative feature and polish suggestions found during testing.
- `regression/`: retest notes and known risk areas.
- `temp/`: disposable test artifacts.

## Rules

- Do not place runtime code here.
- Keep bug facts separate from suggestions.
- Keep evidence attached to the tested build or version.
- Delete obsolete temp captures after their results are recorded.
