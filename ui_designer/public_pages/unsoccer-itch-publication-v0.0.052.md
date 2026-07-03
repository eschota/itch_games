# Ragdoll Soccer II Itch.io Publication v0.0.052

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
- Build: `#1768248 (from #1768237)`
- User version: `v0.0.052`

## Local Build

- Package command: `npm run package:unsoccer`
- Upload command:

```powershell
$env:BUTLER_PATH="$env:LOCALAPPDATA\itch-games\butler\butler.exe"
.\tools\publish_unsoccer_itch.ps1 -Target 'eschotagmailcom/ragdoll-soccer-ii:html5' -SkipBuild
```

- Archive: `dist/unsoccer-itch.zip`
- SHA-256:
  `9217b6426c8375b056e3ad85aab7004c96418638d825eb78380d276f5973e55f`
  before the itch-host default-server patch; rebuilt archive was republished
  with the same user version after the client patch.

## Page Copy

The live page uses the `Ragdoll Soccer II` title, v0.0.052 description,
HTML5/static-client live-server note, controls, and current release notes from
`unsoccer-itch-page-copy.md`.

## Embed Smoke

- Public URL: `HTTP 200`.
- Public page label: `PUBLISHED`.
- Run button: `Run match`.
- Iframe after launch:
  `https://html-classic.itch.zone/html/18187910-1768248/index.html?...`
- Iframe size: 960 x 540.
- Canvas count: `1`.
- Visible version: `v0.0.052 / 40.05 MB`.
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

- Cover and screenshot media are not uploaded yet. Current browser automation
  cannot select local files in itch.io file dialogs.
- The old `drunkragdoll` page was not modified or repurposed.
- Current tags were cleaned to remove `no-ai`, but the itch tag widget resisted
  adding the full intended tag set through automation. Current visible tag set
  is acceptable but should be refined manually when media is uploaded.
