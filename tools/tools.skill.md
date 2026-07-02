# tools Directory Skill

Use this file for work inside `/itch_games/tools`.

## Parent References

- [../skill.md](../skill.md)
- [../skill.xml](../skill.xml)
- [../itch_games.skill.md](../itch_games.skill.md)

## Purpose

- Store repository tooling for packaging, validation, and release support.
- Keep tool behavior aligned with public game delivery contracts.

## Files

- `package_itch.py`: creates player-facing HTML5 upload zips under `dist/`.
  For UnSoccer it packages the already built client dist; the npm
  `package:unsoccer` script must rebuild before calling it.
- `publish_unsoccer_itch.ps1`: verifies and publishes the UnSoccer HTML5 zip
  to itch.io with butler when `ITCH_IO_TARGET=owner/game:channel` is set.
- `itch.skill.md`: itch.io/butler transport rules.
- `unsoccer_acceptance.mjs`: starts an isolated `UNSOCCER_TEST_MODE=1` server
  and verifies authoritative spectator assignment, HTTP fallback join/input/
  state, kick/body contacts, goal reset behavior, and server audioEvents.
- `hooks/hooks.skill.md`: local git-hook tooling rules.
- `hooks/unsoccer_post_commit_autodeploy.ps1`: installed from
  `.git/hooks/post-commit` in this clone to gate, push, and wait for production
  webhook deploys after commits to `main`.

## Rules

- Do not include internal skill, role, agent coordination, server, git, deploy,
  or source-control docs in player-facing itch.io packages.
- Keep `index.html` at the itch zip root.
- Fail packaging if internal coordination files leak into the public upload
  artifact.
- Orbital Courier packages include vendored Three.js runtime files so the
  upload remains playable without CDN dependency.
- Generated package zips belong under root `dist/` and must not be committed.
- Built UnSoccer `client/server/shared` dist artifacts may be committed only for
  intentional fast production releases.
- Git hooks must keep secrets out of the repository and use the existing signed
  GitHub push webhook rather than local copies of server HMAC credentials.
- Itch publishing must keep secrets out of the repository and use local butler
  credentials or `BUTLER_API_KEY` from the environment only.
- `npm run test:unsoccer:acceptance` must use an isolated test server and must
  stop it before finishing.
- `unsoccer_acceptance.mjs` derives the expected release from
  `package.json.games.unsoccer.version`; keep version bumps centralized there.
