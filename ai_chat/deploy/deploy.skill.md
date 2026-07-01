# deploy Directory Skill

Use this file for deployment-reference work inside `/itch_games/ai_chat/deploy`.

## Parent References

- [../../skill.md](../../skill.md)
- [../../skill.xml](../../skill.xml)
- [../ai_chat.skill.md](../ai_chat.skill.md)
- [../../ai_chat_skill.md](../../ai_chat_skill.md)

## Purpose

- Store nginx, systemd, and webhook deploy references for the IO Games public
  host and shared `/ai_chat` service.
- Keep transport details explicit without mixing them into game runtime files.

## Files

- `itch-games-io-games-qwertystock.conf`: nginx reference for
  `io-games.mecharulez.com`.
- `itch-games-ai-chat-qwertystock.service`: qwertystock target systemd service.
- `itch-games-unsoccer-server-qwertystock.service`: qwertystock target systemd
  service for the UnSoccer authoritative server on `127.0.0.1:8787`.
- `itch-games-autodeploy-qwertystock.sh`: webhook-triggered deploy script.
- `itch-games-ai-chat.service` and `nginx-ai-chat-location.conf`: previous or
  compatibility references.

## Rules

- Do not edit the main qwertystock.com app or nginx server block from this
  folder.
- Keep IO Games isolated behind `server_name io-games.mecharulez.com`.
- Keep the HTTP `io-games.mecharulez.com` root redirect pointed at the HTTPS
  catalog root, not a single game route.
- Keep webhook and Telegram secrets only in server environment files.
- Deployment changes must be reported to `/ai_chat` with validation status.
- Use `/ai_chat/api/deploy-health` for read-only production diagnosis when SSH
  is unavailable. It must remain secret-free and report the UnSoccer dist HTML,
  hashed assets, server entry, local `127.0.0.1:8787/api/health`, and systemd
  active state.
- The production UnSoccer route serves `unsoccer/client/dist` at `/unsoccer/`,
  proxies `/unsoccer/api/` to `127.0.0.1:8787/api/`, and strips
  `/unsoccer/socket/` before forwarding WebSocket requests to
  `127.0.0.1:8787`. The socket location must pass `Upgrade` and `Connection`
  headers and long read/send timeouts.
- The qwertystock autodeploy must install
  `itch-games-ai-chat-qwertystock.service` as the active
  `itch-games-ai-chat.service` before restart, so Node `server_node.js` owns
  Task Queue, Telegram, deploy webhook, and `/api/media`.
- The qwertystock chat unit must set
  `AI_CHAT_DEPLOY_SCRIPT=/home/generic/itch_games/ai_chat/deploy/itch-games-autodeploy-qwertystock.sh`
  after loading `/etc/itch-games-ai-chat.env` so stale server env values cannot
  redirect webhooks to an old deploy script.
- The qwertystock chat unit must force `UNSOCCER_AUTOSTART=1` after loading
  `/etc/itch-games-ai-chat.env`; otherwise an old server env can keep the
  fallback child disabled while `/unsoccer/api/health` stays 502.
- The UnSoccer production dependency preflight must import
  `@dimforge/rapier3d-compat` and `@itch-games/unsoccer-shared`; it must not
  require `ws`, geckos.io, or `node-datachannel` for the WebSocket transport.
- The qwertystock autodeploy must run `npm ci` with dev dependencies even when
  the service environment is production, delete generated UnSoccer dist folders
  before rebuilding, then verify `unsoccer/client/dist/index.html` against
  `package.json.games.unsoccer.version`, the `0.61 MB` weight label, every
  referenced asset path, at least one built JS asset, the
  `residential-courtyard` client marker inside built assets, and that the server
  bundle does not import geckos.io, `ws`, or `node-datachannel` before nginx
  reload.
- After nginx reload, the qwertystock autodeploy must smoke the public
  `/unsoccer/` route for the same version and weight markers plus
  `/unsoccer/api/health` for the matching server version. `/api/deploy-health`
  must not report ready when source, dist HTML, and local API versions diverge.
- The webhook child process must not synchronously restart
  `itch-games-ai-chat.service` before it exits. Schedule a delayed chat restart
  after local health checks so the parent process can append deploy
  completion/failure to `/ai_chat`.
- Keep `/ai_chat/` nginx `client_max_body_size` aligned with the Node media
  upload limit so Producer gameplay videos are not rejected before reaching the
  service.
