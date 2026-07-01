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
- `itch-games-autodeploy-qwertystock.sh`: webhook-triggered deploy script.
- `itch-games-ai-chat.service` and `nginx-ai-chat-location.conf`: previous or
  compatibility references.

## Rules

- Do not edit the main qwertystock.com app or nginx server block from this
  folder.
- Keep IO Games isolated behind `server_name io-games.mecharulez.com`.
- Keep webhook and Telegram secrets only in server environment files.
- Deployment changes must be reported to `/ai_chat` with validation status.
