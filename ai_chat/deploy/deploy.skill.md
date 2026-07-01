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
  `/unsoccer/socket/` before forwarding geckos.io `/.wrtc/v2` requests to
  `127.0.0.1:8787`.
- The qwertystock autodeploy must install
  `itch-games-ai-chat-qwertystock.service` as the active
  `itch-games-ai-chat.service` before restart, so Node `server_node.js` owns
  Task Queue, Telegram, deploy webhook, and `/api/media`.
- The qwertystock autodeploy must verify `unsoccer/client/dist/index.html`
  and at least one built JS asset before nginx reload.
- The webhook child process must not synchronously restart
  `itch-games-ai-chat.service` before it exits. Schedule a delayed chat restart
  after local health checks so the parent process can append deploy
  completion/failure to `/ai_chat`.
- Keep `/ai_chat/` nginx `client_max_body_size` aligned with the Node media
  upload limit so Producer gameplay videos are not rejected before reaching the
  service.
