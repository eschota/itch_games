# itch.io Transport Skill

Use this file for itch.io upload and butler transport work from
`/itch_games/tools`.

## Parent References

- [../skill.md](../skill.md)
- [../skill.xml](../skill.xml)
- [tools.skill.md](tools.skill.md)

## Files

- `publish_unsoccer_itch.ps1`: packages or reuses `dist/unsoccer-itch.zip`,
  verifies the HTML5 zip contract, resolves/downloads official butler, and runs
  `butler push` for UnSoccer.
- `package_itch.py`: creates the player-facing HTML5 upload zip consumed by the
  publish script.

## Rules

- Never commit itch.io API keys, butler credentials, or account tokens.
- Use `ITCH_IO_TARGET=owner/game:channel` to opt into publishing. The target
  must be recorded in the publication ledger once known.
- The publish script may use `BUTLER_PATH` or an installed `butler`; otherwise
  it may download official Windows x64 butler from the stable broth URL.
- Use `--userversion` from `package.json.games.unsoccer.version` and
  `--if-changed` so repeated publishes are idempotent.
- Do not call itch.io publication complete until the public itch URL, uploaded
  version, page copy, screenshots, and embed smoke are recorded in the ledger.
