# ai_chat Directory Skill

Use this file for work inside `/itch_games/ai_chat`.

## Parent References

- [../skill.md](../skill.md)
- [../skill.xml](../skill.xml)
- [../ai_chat_skill.md](../ai_chat_skill.md)

## Purpose

- Store source code and deployment support for the shared development-agent chat
  exposed at `/ai_chat`.
- Keep service code separate from game runtime code while still versioning the
  service with the project.
- Keep chat and task data on the server under `ai_chat/data/`; do not commit
  messages, task snapshots, or task event logs.

## Structure

- `server_node.js`: Node stdlib HTTP API, static file server, Telegram bridge,
  deploy webhook, messages, commits, and Task Queue.
- `server.py`: legacy Python stdlib HTTP API reference.
- `static/`: browser UI for chat, status, and commit service menu.
- `deploy/`: systemd and nginx reference files.
- `data/`: server-only `messages.jsonl`, `tasks.json`, `tasks.jsonl`, and
  Telegram update state, ignored by git.

## Rules

- Do not require authentication.
- Do not store secrets in this directory.
- Do not commit `ai_chat/data/`.
- Keep API responses JSON and browser-safe.
- Keep commit history visible in the service menu, separate from chat messages.
- Keep Task Queue as the source of truth for role work. The Orchestrator or
  Producer creates tasks; execution roles do not do non-read-only project work
  without an assigned or claimed task for their role.
- Task records must include role, priority, title, description, status, scope,
  dependencies, acceptance, owner/claim, comments, and validation ownership when
  applicable.
- For non-trivial, multi-role, or shared-file work, require a `Parallel Plan:`
  chat agreement before implementation starts. The plan must name workstreams,
  owners, exact file scopes, branch/task id, dependencies, merge order, and
  validation owner.
- Agents must not edit outside the agreed `Parallel Plan:` scope until the
  Orchestrator, Producer, or affected roles acknowledge the split.
- Agents may post concise `Idea:` messages for project development when there
  is a concrete opportunity, but the chat must not become a constant idea feed.
- Keep webhook autodeploy protected by the server-only
  `AI_CHAT_WEBHOOK_SECRET`; never commit it.
- Keep `/api/deploy-health` read-only and secret-free. It may expose file
  existence, dist asset names, local health status, and systemd active state for
  deployment diagnosis, but it must not expose environment variables or tokens.
- Keep Telegram bridge credentials protected by the server-only
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `TELEGRAM_WEBHOOK_SECRET`;
  never commit them.
- Telegram messages from real users must enter the shared chat as
  `Продюсер: <text>`.
- Telegram mirrors for deploy/build/package notifications must include an
  `Открыть билд` inline button. Use `AI_CHAT_OPEN_BUILD_URL` or
  `AI_CHAT_BUILD_URL` when configured; otherwise default to
  `https://io-games.mecharulez.com/unsoccer/`.
- Telegram must call `/ai_chat/api/telegram-webhook` with
  `X-Telegram-Bot-Api-Secret-Token`; do not use polling when the webhook is
  active.
- Keep `itch-games-autodeploy.timer` disabled after webhook deploy is active.
- When changing this service, post start/change/result messages to the live chat
  once the service is available.
