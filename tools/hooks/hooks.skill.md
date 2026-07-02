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

- `post-commit`: tracked git hook entrypoint used through
  `git config core.hooksPath tools/hooks`.
- `unsoccer_post_commit_autodeploy.ps1`: local `post-commit` target that gates
  the current `main` commit, pushes it to GitHub, and waits for the signed
  GitHub webhook autodeploy to make production match `/ai_chat/api/deploy-health`
  for a short fast-fail window. Clean source-only commits auto-create a generated
  UnSoccer dist artifact commit before push; dirty-tree commits preserve local
  work and let the server build from source.

## Rules

- Do not store webhook secrets, SSH keys, server env values, or Telegram
  credentials in hook scripts.
- The local hook must use the existing GitHub push webhook path; it must not
  bypass the server-side HMAC-protected `/ai_chat/api/deploy-webhook`.
- Keep generated packages out of commits.
- Release commits may intentionally include built UnSoccer `client/server/shared`
  dist artifacts when production needs fast git-pull-and-restart deployment.
- Do not trust matching version markers alone when HEAD changed UnSoccer source
  without dist changes; the hook must rebuild locally or force server rebuild.
- If unrelated tracked files are dirty after commit, the hook may skip local
  dirty-tree validation only when committed UnSoccer dist is already ready for
  the expected version, otherwise it pushes source-only and relies on the server
  rebuild path.
- Allow `ITCH_GAMES_POST_COMMIT_AUTODEPLOY=0` or `[skip deploy]` in the commit
  message for deliberate local-only commits.
- Set `ITCH_IO_TARGET=owner/game:channel` to publish UnSoccer to itch.io after
  production becomes ready. Set `ITCH_IO_AUTOPUBLISH_UNSOCCER=0` to disable.
