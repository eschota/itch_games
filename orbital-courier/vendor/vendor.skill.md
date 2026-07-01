# vendor Directory Skill

Use this file for work inside `/itch_games/orbital-courier/vendor`.

## Parent References

- [../../skill.md](../../skill.md)
- [../../skill.xml](../../skill.xml)
- [../orbital-courier.skill.md](../orbital-courier.skill.md)
- [../skill.xml](../skill.xml)

## Purpose

- Store player-facing third-party browser runtime dependencies that must be
  packaged with Orbital Courier for offline-friendly itch.io uploads.
- Keep runtime dependencies explicit and licensed.

## Files

- `three.module.js`: Three.js `0.165.0`, matching the previous CDN import.
- `three-LICENSE.txt`: Three.js MIT license text.

## Rules

- Do not place internal project skill, agent coordination, deployment, or server
  docs in the player-facing itch.io package.
- Update `../index.html`, `../../tools/package_itch.py`, `../../skill.md`, and
  `../../skill.xml` when vendor files change.
- Preserve the exact intended runtime version unless a behavior-changing library
  upgrade is explicitly tested and documented.
