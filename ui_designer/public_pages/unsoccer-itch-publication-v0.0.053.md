# Ragdoll Soccer II Itch.io Publication v0.0.053

Recorded on 2026-07-03.

## Result

- Public page: `https://eschotagmailcom.itch.io/ragdoll-soccer-ii`
- Itch project id: `4740079`
- Status: `Published`
- Project type: `HTML`
- Release status: `Prototype`
- Genre: `Sports`
- Butler target: `eschotagmailcom/ragdoll-soccer-ii:html5`
- Upload: `#18187910`
- Build: `#1768259 (from #1768248)`
- User version: `v0.0.053`

## Local Build

- Package command: `npm run package:unsoccer`
- Upload command:

```powershell
$env:BUTLER_PATH="$env:LOCALAPPDATA\itch-games\butler\butler.exe"
.\tools\publish_unsoccer_itch.ps1 -Target 'eschotagmailcom/ragdoll-soccer-ii:html5' -SkipBuild
```

- Archive: `dist/unsoccer-itch.zip`
- Archive size: `22976522` bytes.
- SHA-256:
  `bbf7b22b4699c0b9604fc4bec1a7ff9933f4659e451a96f2f2db4ac25a9ecdd7`
- Entry count: `105`.

## Page Copy

The source-of-truth page copy is `unsoccer-itch-page-copy.md`.

Live itch description is currently a blocker: browser automation could edit the
rich-text field visually, but itch Redactor did not persist `game[description]`
through the available Browser controls. A blocked `javascript:` URL path was not
worked around. The description must be manually pasted from
`unsoccer-itch-page-copy.md` in the itch.io edit form, then saved and verified.

The short description, project type, release status, genre, publish state, embed
settings, and HTML5 upload are configured.

## Embed Smoke

Checked after the v0.0.053 butler upload:

- Public URL: `HTTP 200`.
- Public page label: `PUBLISHED`.
- Run button: `Run match`.
- Iframe after launch:
  `https://html-classic.itch.zone/html/18187910-1768259/index.html?...`
- Iframe size: 960 x 540.
- Canvas count: `1`.
- Visible version: `v0.0.053 / 40.05 MB`.
- Runtime transport: `websocket`.
- Runtime state: joined as player, scoreboard and bot roster visible.

## Fix Applied During Publication

The first uploaded itch build `#1768237` loaded the client but tried to join
`/unsoccer/api` on `html-classic.itch.zone`, causing HTTP fallback `join: 403`.
The client was patched so itch-hosted builds default to:

- WebSocket: `wss://io-games.mecharulez.com/unsoccer/socket/ws`
- HTTP API: `https://io-games.mecharulez.com/unsoccer/api`

Explicit `?server=` still takes priority.

## Remaining Visual Work

- Full description copy must be manually restored from
  `unsoccer-itch-page-copy.md`.
- Cover and screenshot media are not uploaded yet. Current browser automation
  cannot select local files in itch.io file dialogs.
- The old `drunkragdoll` page was not modified or repurposed.
- Tags remain a minimal working set after the itch tag widget resisted reliable
  automation. Refine them manually when media is uploaded.

## Orchestrator Note

Do not stage or push from this UI Designer handoff. The public itch channel is
already updated through butler. `dist/unsoccer-itch.zip` is ignored and should
not be committed. Final focused status showed no `unsoccer/client/dist` diff;
if a later package run changes hashed dist assets, commit either source-only or
a complete generated-dist set, not partial hash deletions.
