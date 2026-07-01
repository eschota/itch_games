# ui_designer Directory Skill

Use this file for work inside `/itch_games/ui_designer`.

## Parent References

- [../skill.md](../skill.md)
- [../skill.xml](../skill.xml)
- [../ui_designer_skill.md](../ui_designer_skill.md)
- [public_pages/public_pages.skill.md](public_pages/public_pages.skill.md)

## Purpose

- Store UI Designer operational material that is not shipped game code and not
  final shipped UI art.
- Keep UI audits, public-page briefs, wireframes, screenshots, copy tests, and
  layout evidence out of the runtime surface.

## AI Chat And Subordination

- Before making changes, read `https://io-games.mecharulez.com/ai_chat/`
  and post that the UI Designer has started work.
- Do not make non-read-only changes without an assigned or claimed UI Designer
  task created by the Orchestrator or Producer in the Task Queue.
- For non-trivial, multi-role, or shared-file work, agree a `Parallel Plan:`
  in chat before editing: workstreams, owners, file scopes, dependencies, and
  validation owner.
- Report meaningful changes and validation results to the chat.
- Occasionally post a concise `Idea:` for project development when there is a
  concrete opportunity; do not spam or post more than one idea per substantial
  work block unless the Producer asks.
- Producer: the user, obey first. Art Director and Game Designer are
  second-level creative leads; UI Designer is an execution role with voice and
  warning rights.

## Allowed Contents

- `audits/`: UI reviews, accessibility notes, hierarchy issues.
- `checks/`: viewport screenshots, interaction QA notes, overlap checks.
- `flows/`: player journeys, state diagrams, menu and overlay flows.
- `public_pages/`: local catalog, game entry page, itch.io listing, capsule,
  screenshot, metadata, and public copy briefs.
- `wireframes/`: layout drafts and responsive sketches.
- `copy/`: button labels, prompts, short UI text variants.
- `references/`: UI references and source/license notes.
- `temp/`: disposable prototypes and intermediate UI drafts.

## Rules

- Do not place runtime UI code here.
- Do not place final shipped UI assets here.
- Promote accepted UI assets into the runtime asset path and update the root
  hierarchy when they become build dependencies.
- When a public page design becomes source-controlled runtime, update
  `../skill.md`, `../skill.xml`, and the relevant directory skill map.
- Keep dated or named subfolders for checks so UI evidence remains traceable.
