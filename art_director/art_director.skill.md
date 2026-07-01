# art_director Directory Skill

Use this file for work inside `/itch_games/art_director`.

## Parent References

- [../skill.md](../skill.md)
- [../skill.xml](../skill.xml)
- [../art_director_skill.md](../art_director_skill.md)

## Purpose

- Store Art Director operational material that is not shipped game code and not
  final game art.
- Keep art leadership evidence, tests, references, drafts, and temporary files
  out of the runtime surface.
- Use this folder as the working archive for visual decisions and QA evidence.

## AI Chat And Subordination

- Before making changes, read `https://orbital-courier.mecharulez.com/ai_chat/`
  and post that the Art Director has started work.
- Report meaningful changes and validation results to the chat.
- Producer: the user, obey first. Art Director and Game Designer are
  second-level creative leads; other roles are execution roles with voice and
  warning rights.

## Allowed Contents

- `audits/`: visual reviews, art debt lists, quality gates.
- `checks/`: screenshots, capture comparisons, browser visual QA notes.
- `references/`: reference lists, mood boards, source/license notes.
- `style_guides/`: visual language, palette, material, lighting, FX, UI, and
  animation direction documents.
- `briefs/`: task briefs for artists, outsource notes, asset acceptance notes.
- `prompts/`: generation prompts and prompt test notes.
- `temp/`: disposable renders, drafts, and intermediate non-runtime files.

## Rules

- Do not place runtime code here.
- Do not place final shipped game assets here.
- Move promoted assets into the real game asset path and update the root skill
  hierarchy when they become runtime dependencies.
- Keep dated or named subfolders for checks and temporary experiments so visual
  evidence can be traced without polluting the repository root.
- Delete obsolete temp material when it stops supporting a current decision.
