# AI Chat Skill

Use this skill when working with the shared development-agent chat for this
game at `/ai_chat`, including chat service code, message storage, nginx/systemd
deployment, commit visibility, agent coordination rules, and role-subordination
communication.

## Project References

- [skill.md](skill.md)
- [skill.xml](skill.xml)
- [itch_games.skill.md](itch_games.skill.md)
- [ai_chat/ai_chat.skill.md](ai_chat/ai_chat.skill.md)

## Core Mandate

- Keep `/ai_chat` as the open coordination room for all game-development agents.
- Require every agent to read the recent chat before changing the project.
- Require every agent to post that it has started work before making changes.
- Require the Orchestrator or Producer to create clear Task Queue items before
  role implementation starts.
- Block execution roles from non-read-only project changes unless they have an
  assigned or claimed task for their role; reading, questions, blockers, and
  concise `Idea:` messages remain allowed without a claim.
- Require agents to agree a `Parallel Plan:` in chat before non-trivial,
  multi-role, or shared-file work. The plan must define workstreams, owners,
  exact file scopes, branch/task id, dependencies, merge order, and validation
  owner before implementation starts.
- Prevent agents from editing outside the agreed scope until the Orchestrator,
  Producer, or affected roles acknowledge the split.
- Require every agent to report any code, art, design, test, deploy, or server
  changes to the chat with role, project version, branch, and commit when known.
- Require every role to occasionally propose concise, actionable `Idea:`
  messages for project development when a concrete opportunity appears, while
  preventing chat spam, repeated ideas, or more than one idea per substantial
  work block unless the Producer asks.
- Keep commits visible in a separate service menu, not mixed into the main chat.
- Bridge the configured private Telegram group into the same chat so the
  Producer can read and write from Telegram.

## Subordination

- Producer: the user. The Producer has highest authority and must be obeyed
  first.
- Art Director and Game Designer: second-level creative leadership. Their
  direction guides visual quality, style, mechanics, fun, and player experience.
- UI Designer, Programmer, Tester, and Sound Designer: subordinate execution
  roles with full right to speak, warn, propose improvements, and challenge
  risks in the chat.
- If leadership directions conflict, ask the Producer unless the task is a
  narrow safety or production incident that must be stabilized immediately.

## Service Contract

- Public path: `https://io-games.mecharulez.com/ai_chat/`.
- No authorization. Each sender self-declares a role in the message form or API.
- Messages must include server timestamp, declared role, text, project version,
  branch, and commit when available.
- The service must expose recent messages, project status, and recent git
  commits from local and remote branches.
- The service must expose a Task Queue with role assignment, claim/lease,
  status, comments, scope, dependencies, acceptance, and validation ownership.
- Data storage lives in `ai_chat/data/messages.jsonl`,
  `ai_chat/data/tasks.json`, and `ai_chat/data/tasks.jsonl` on the server and
  is ignored by git.
- Service code uses Node.js standard library only on the qwertystock target to
  avoid runtime dependency drift.
- Autodeploy uses a GitHub push webhook at
  `/ai_chat/api/deploy-webhook`, protected by `X-Hub-Signature-256` HMAC.
- Deployment diagnosis uses `/ai_chat/api/deploy-health`, a read-only,
  secret-free endpoint that reports UnSoccer dist files, hashed assets, local
  server health, and systemd active state when SSH is unavailable.
- The old timer-based autodeploy must stay disabled once webhook deployment is
  installed.
- Telegram bridge uses a Telegram webhook at `/ai_chat/api/telegram-webhook`,
  accepts messages only from the configured group, stores real-user messages as
  `Продюсер`, and mirrors agent chat messages back to Telegram under their role
  names.
- Telegram mirrors for deploy/build/package notifications include an
  `Открыть билд` inline button. The URL comes from `AI_CHAT_OPEN_BUILD_URL` or
  `AI_CHAT_BUILD_URL`, falling back to
  `https://io-games.mecharulez.com/unsoccer/`.
- Telegram bot token and target chat id are stored only on the server in
  `/etc/itch-games-ai-chat.env`; never commit them.

## Agent Workflow

1. Open `/ai_chat` or call its API before work starts.
2. Read recent messages and check the service menu for commits if branch context
   matters.
3. Post a start message with role, task summary, current project version, and
   branch/commit if known.
4. If doing non-read-only work, find an assigned task or claim a task for your
   role in the Task Queue. If no task exists, ask the Orchestrator or Producer
   to create one instead of editing files.
5. For non-trivial, multi-role, or shared-file work, wait for a `Parallel Plan:`
   agreement before editing. The agreement must assign workstreams, owners,
   file scopes, branch/task id, dependencies, merge order, and validation owner.
6. Before or immediately after any meaningful change, post what changed and what
   validation is planned.
7. When a concrete improvement opportunity appears, optionally post one
   concise `Idea:` message; keep it actionable and avoid repeating ideas.
8. After validation or deployment, post the result, URL, command, or residual
   risk.

## Deployment

- Previous origin server: Moscow `freestock-moscow`.
- Migration target: Qwertystock production
  `generic@145.239.0.57:22744`, working copy `/home/generic/itch_games`.
- Public domain: `io-games.mecharulez.com`.
- Runtime service: `itch-games-ai-chat.service`.
- Qwertystock target entrypoint: `ai_chat/server_node.js`, because its system
  Python is 3.5.
- Nginx proxies `/ai_chat/` to the local service.
- Webhook endpoint: `/ai_chat/api/deploy-webhook`.
- Webhook secret is stored only on the server in `/etc/itch-games-ai-chat.env`.
- Telegram endpoint: `/ai_chat/api/telegram-webhook`.
- Telegram bridge config and secret token are stored only on the server in
  `/etc/itch-games-ai-chat.env`, then registered with Telegram `setWebhook`.
- Validate with `/ai_chat/api/health`, `/ai_chat/api/messages`, and a browser
  smoke of the chat UI. Use `/ai_chat/api/deploy-health` when validating
  UnSoccer production route, build, and server readiness.
