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
- `itch-games-io-games-moscow.conf`: nginx reference for the independent
  Moscow mirror at `moscow-io-games.mecharulez.com`.
- `itch-games-ai-chat-moscow.service`: Moscow target systemd service for
  `ai_chat/server_node.js`, `/ai_chat`, and the deploy webhook.
- `itch-games-unsoccer-server-moscow.service`: Moscow target systemd service
  for the UnSoccer authoritative server on `127.0.0.1:8787`.
- `itch-games-autodeploy-moscow.sh`: Moscow webhook-triggered deploy script;
  it uses `origin/main`, preserves server-only secrets in
  `/etc/itch-games-ai-chat.env`, issues/renews HTTPS through certbot, and
  smokes `https://moscow-io-games.mecharulez.com/unsoccer/`.
- `itch-games-autodeploy-moscow-if-changed.sh`,
  `itch-games-autodeploy-moscow.service`, and
  `itch-games-autodeploy-moscow.timer`: Moscow pull-based autodeploy fallback.
  The timer checks `origin/main` every minute, refuses to deploy a dirty
  checkout, and invokes the Moscow deploy script only when the remote commit is
  newer than local `HEAD`.
- `AI_CHAT_DEPLOY_RELAY_URLS` on the qwertystock chat service can fan out an
  already-verified GitHub push to Moscow `/api/deploy-relay`. The Moscow chat
  service must keep `AI_CHAT_DEPLOY_RELAY_ALLOW_IPS=145.239.0.57` so relay
  deploys are accepted only from the primary IO Games host.
- `verify-moscow-relay.mjs`: read-only verifier for the post-deploy relay gate.
  Run `node ai_chat/deploy/verify-moscow-relay.mjs --mode=live` after the
  Orchestrator push/deploy to require Moscow DNS/TLS, public game/API, both
  hosts ready, version/commit coherence, Moscow `/api/deploy-relay` route
  exposure, primary fanout enabled, and Moscow relay allowlisted to
  `145.239.0.57`. Its route probe sends `X-GitHub-Event: ping`, so it must not
  start a deploy.
- `itch-games-ai-chat.service` and `nginx-ai-chat-location.conf`: previous or
  compatibility references.

## Rules

- Do not edit the main qwertystock.com app or nginx server block from this
  folder.
- Keep IO Games isolated behind `server_name io-games.mecharulez.com`.
- Keep the Moscow mirror isolated behind
  `server_name moscow-io-games.mecharulez.com`, with DNS managed through the
  Way `qwertystock_domain_api` preview/apply flow for `mecharulez.com` records.
- Keep the HTTP `io-games.mecharulez.com` root redirect pointed at the HTTPS
  catalog root, not a single game route.
- Keep webhook and Telegram secrets only in server environment files.
- Deployment changes must be reported to `/ai_chat` with validation status.
- Use `/ai_chat/api/deploy-health` for read-only production diagnosis when SSH
  is unavailable. It must remain secret-free and report the UnSoccer dist HTML,
  hashed assets, server entry, local `127.0.0.1:8787/api/health`, and systemd
  active state. It may also report secret-free deploy relay status such as
  fanout enabled, sanitized target host/path, relay accept allowlist count/IPs,
  token configured boolean, and timeout; it must not expose relay tokens,
  webhook secrets, environment dumps, or request bodies.
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
- The Moscow chat unit must force `UNSOCCER_AUTOSTART=0` after loading
  `/etc/itch-games-ai-chat.env`; Moscow runs UnSoccer through
  `itch-games-unsoccer-server.service`, so chat fallback autostart only creates
  duplicate `EADDRINUSE` noise in `/api/deploy-health`.
- The Moscow deploy script rewrites `itch-games-ai-chat.service` on every full
  deploy, so its generated unit must also keep
  `AI_CHAT_DEPLOY_RELAY_ALLOW_IPS=145.239.0.57`; otherwise the next full deploy
  silently disables primary-to-Moscow webhook fanout.
- The UnSoccer production dependency preflight must import
  `@dimforge/rapier3d-compat` and `@itch-games/unsoccer-shared`; it must not
  require `ws`, geckos.io, or `node-datachannel` for the WebSocket transport.
- The qwertystock autodeploy must run `npm ci` with dev dependencies when
  package manifests changed or `node_modules` is absent, even when the service
  environment is production. If package manifests are unchanged and
  `node_modules` exists, it may reuse the current install to keep asset-only
  deploys inside the webhook timeout. It must delete generated UnSoccer dist
  folders before rebuilding, then verify `unsoccer/client/dist/index.html` against
  `package.json.games.unsoccer.version`, the current `BUILD_WEIGHT_LABEL` from
  `unsoccer/client/src/main.ts`, every referenced asset path, at least one
  built JS asset, the
  `residential-courtyard` client marker inside built assets, and that the server
  bundle does not import geckos.io, `ws`, or `node-datachannel` before nginx
  reload.
- For fast production releases, committed UnSoccer `client/server/shared` dist
  artifacts may skip `npm ci` and `npm run build:unsoccer` when their HTML and
  shared JS already contain the expected version and weight. The server bundle
  imports `GAME_VERSION` from shared and does not need to contain the literal
  version. The deploy must still run artifact checks and restart the UnSoccer
  service.
- If the just-pulled commit changed UnSoccer source, package manifests, or
  `tools/unsoccer_acceptance.mjs` without changing `unsoccer/client/dist`,
  `unsoccer/server/dist`, or `unsoccer/shared/dist`, the deploy must ignore
  stale committed dist and rebuild on the server.
- After nginx reload, the qwertystock autodeploy must smoke the public
  `/unsoccer/` route for the same version and weight markers plus
  `/unsoccer/api/health` for the matching server version. `/api/deploy-health`
  must not report ready when source, dist HTML, weight label, and local API
  versions diverge.
- Before starting a new UnSoccer release, the qwertystock and Moscow deploys
  must stop `itch-games-unsoccer-server.service`, kill any residual
  `node .../unsoccer/server/dist/index.js` process for that host path, then
  start the service and require local `/api/health.version` to match
  `package.json.games.unsoccer.version` before reloading nginx or restarting
  chat.
- If the qwertystock worktree has already pulled committed dist for the new
  version but local `/api/health.version` still reports the previous version,
  the deploy script must restart UnSoccer immediately before later artifact or
  nginx checks so public HTML and API cannot remain split-version after a
  partial deploy.
- The qwertystock deploy should prefer systemd for UnSoccer restart, but if
  non-interactive sudo/systemd does not expose the expected API version, it may
  kill the exact `/home/generic/itch_games/unsoccer/server/dist/index.js` node
  process owned by the deploy user and start that entry directly as a temporary
  fallback; the final health check must still require the expected version.
- The webhook child process must not synchronously restart
  `itch-games-ai-chat.service` before it exits. Schedule a delayed chat restart
  after local health checks so the parent process can append deploy
  completion/failure to `/ai_chat`.
- The qwertystock autodeploy entrypoint may detach the long-running deploy work
  into a locked `nohup` child for manual CLI invocations, but the Node webhook
  runner must set `ITCH_GAMES_DEPLOY_DETACHED=1` and run the script in the
  foreground. GitHub webhook completion must wait for artifact checks, UnSoccer
  service restart, and public API version smoke; otherwise a pull can update
  HTML/model files while the old server process keeps serving the previous API.
- The Moscow autodeploy follows the same foreground webhook pattern, but its
  working copy is `/itch_games`, service user is `root`, public host is
  `moscow-io-games.mecharulez.com`, and it must install Node/npm/certbot on the
  mirror if the old Orbital-only host image lacks them. The active service
  points `AI_CHAT_DEPLOY_SCRIPT` at
  `/usr/local/bin/itch-games-autodeploy-moscow.sh` so a pre-commit bootstrap
  copy does not leave the git worktree dirty.
- When GitHub-side Moscow hook registration is blocked by sudo/2FA, keep the
  Moscow pull fallback timer enabled as the operational bridge. It is not a
  substitute for the GitHub webhook record, but it preserves automatic
  `origin/main` pickup on the Moscow server.
- Prefer the primary-to-Moscow deploy relay over adding a second GitHub hook
  when GitHub sudo/2FA blocks settings access: GitHub calls the existing
  primary hook, the primary chat service validates the GitHub HMAC, then Moscow
  accepts `/api/deploy-relay` only from the primary host IP and runs its own
  Moscow deploy script.
- Keep `/ai_chat/` nginx `client_max_body_size` aligned with the Node media
  upload limit so Producer gameplay videos are not rejected before reaching the
  service.
