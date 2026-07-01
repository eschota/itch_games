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
- `unsoccer_acceptance.mjs`: starts an isolated `UNSOCCER_TEST_MODE=1` server
  and verifies authoritative spectator assignment, HTTP fallback join/input/
  state, kick/body contacts, goal reset behavior, and server audioEvents.

## Rules

- Do not include internal skill, role, agent coordination, server, git, deploy,
  or source-control docs in player-facing itch.io packages.
- Keep `index.html` at the itch zip root.
- Fail packaging if internal coordination files leak into the public upload
  artifact.
- Orbital Courier packages include vendored Three.js runtime files so the
  upload remains playable without CDN dependency.
- Generated output belongs under `dist/` and must not be committed.
- `npm run test:unsoccer:acceptance` must use an isolated test server and must
  stop it before finishing.
- `unsoccer_acceptance.mjs` derives the expected release from
  `package.json.games.unsoccer.version`; keep version bumps centralized there.
