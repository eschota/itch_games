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
- Keep chat data on the server under `ai_chat/data/`; do not commit messages.

## Structure

- `server.py`: Python stdlib HTTP API and static file server.
- `static/`: browser UI for chat, status, and commit service menu.
- `deploy/`: systemd and nginx reference files.
- `data/`: server-only JSONL message storage, ignored by git.

## Rules

- Do not require authentication.
- Do not store secrets in this directory.
- Do not commit `ai_chat/data/`.
- Keep API responses JSON and browser-safe.
- Keep commit history visible in the service menu, separate from chat messages.
- Keep webhook autodeploy protected by the server-only
  `AI_CHAT_WEBHOOK_SECRET`; never commit it.
- Keep Telegram bridge credentials protected by the server-only
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `TELEGRAM_WEBHOOK_SECRET`;
  never commit them.
- Telegram messages from real users must enter the shared chat as
  `Продюсер: <text>`.
- Telegram must call `/ai_chat/api/telegram-webhook` with
  `X-Telegram-Bot-Api-Secret-Token`; do not use polling when the webhook is
  active.
- Keep `itch-games-autodeploy.timer` disabled after webhook deploy is active.
- When changing this service, post start/change/result messages to the live chat
  once the service is available.
