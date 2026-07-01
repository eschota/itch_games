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

- `package_itch.py`: creates the player-facing Orbital Courier HTML5 upload zip
  under `dist/`.
- `unsoccer_acceptance.mjs`: starts an isolated `UNSOCCER_TEST_MODE=1` server
  and verifies authoritative spectator assignment, kick/body contacts, and
  goal reset behavior.

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
