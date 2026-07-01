# ui_designer Directory Skill

Use this file for work inside `/itch_games/ui_designer`.

## Parent References

- [../skill.md](../skill.md)
- [../skill.xml](../skill.xml)
- [../ui_designer_skill.md](../ui_designer_skill.md)

## Purpose

- Store UI Designer operational material that is not shipped game code and not
  final shipped UI art.
- Keep UI audits, wireframes, screenshots, copy tests, and layout evidence out
  of the runtime surface.

## Allowed Contents

- `audits/`: UI reviews, accessibility notes, hierarchy issues.
- `checks/`: viewport screenshots, interaction QA notes, overlap checks.
- `flows/`: player journeys, state diagrams, menu and overlay flows.
- `wireframes/`: layout drafts and responsive sketches.
- `copy/`: button labels, prompts, short UI text variants.
- `references/`: UI references and source/license notes.
- `temp/`: disposable prototypes and intermediate UI drafts.

## Rules

- Do not place runtime UI code here.
- Do not place final shipped UI assets here.
- Promote accepted UI assets into the runtime asset path and update the root
  hierarchy when they become build dependencies.
- Keep dated or named subfolders for checks so UI evidence remains traceable.
