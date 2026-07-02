# hooks Directory Skill

Use this file for work inside `/itch_games/tools/hooks`.

## Parent References

- [../../skill.md](../../skill.md)
- [../../skill.xml](../../skill.xml)
- [../tools.skill.md](../tools.skill.md)

## Purpose

- Store local git-hook entrypoints and release automation helpers.
- Keep hook behavior reviewable in the repository while `.git/hooks/` remains a
  per-clone installation detail.

## Files

- `unsoccer_post_commit_autodeploy.ps1`: local `post-commit` target that gates
  the current `main` commit, pushes it to GitHub, and waits for the signed
  GitHub webhook autodeploy to make production match `/ai_chat/api/deploy-health`
  for a short fast-fail window.

## Rules

- Do not store webhook secrets, SSH keys, server env values, or Telegram
  credentials in hook scripts.
- The local hook must use the existing GitHub push webhook path; it must not
  bypass the server-side HMAC-protected `/ai_chat/api/deploy-webhook`.
- Keep generated packages out of commits.
- Release commits may intentionally include built UnSoccer `client/server/shared`
  dist artifacts when production needs fast git-pull-and-restart deployment.
- If unrelated tracked files are dirty after commit, the hook may skip local
  dirty-tree validation only when committed UnSoccer dist is already ready for
  the expected version.
- Allow `ITCH_GAMES_POST_COMMIT_AUTODEPLOY=0` or `[skip deploy]` in the commit
  message for deliberate local-only commits.
