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
