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

- Before making changes, read `https://io-games.mecharulez.com/ai_chat/`
  and post that the Art Director has started work.
- Do not make non-read-only changes without an assigned or claimed Art Director
  task created by the Orchestrator or Producer in the Task Queue.
- The Art Director may ask in chat or Todo/Task Queue for server, deployment,
  nginx, webhook, domain, environment, Telegram bridge, or public-static
  availability fixes when infrastructure blocks visual/art delivery.
- For non-trivial, multi-role, or shared-file work, agree a `Parallel Plan:`
  in chat before editing: workstreams, owners, file scopes, dependencies, and
  validation owner.
- Report meaningful changes and validation results to the chat.
- Occasionally post a concise `Idea:` for project development when there is a
  concrete opportunity; do not spam or post more than one idea per substantial
  work block unless the Producer asks.
- Producer: the user, obey first. Art Director and Game Designer are
  second-level creative leads; other roles are execution roles with voice and
  warning rights.

## Allowed Contents

- `audits/`: visual reviews, art debt lists, quality gates.
- `checks/`: screenshots, capture comparisons, browser visual QA notes.
- `references/`: reference lists, mood boards, source/license notes.
- `style_guides/`: visual language, palette, material, lighting, FX, UI, and
  animation direction documents.
  - `unsoccer-hdr-day-cycle-camera.md`: visual target and acceptance for
    UnSoccer HDR lighting, 120-second day cycle, follow camera, and contact
    readability.
- `briefs/`: task briefs for artists, outsource notes, asset acceptance notes.
  - `unsoccer-v0.0.001-visual-vertical-slice.md`: handoff brief for the first
    UnSoccer visual vertical slice.
  - `unsoccer-v0.0.002-visual-3d-requirements.md`: 3D model, silhouette,
    material, visual-risk, and in-game acceptance requirements for the next
    UnSoccer milestone.
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
