# Ragdoll Soccer II Yandex Games Upload Handoff v0.0.033

Generated on 2026-07-02 for Yandex Games application `547090`.

## Current Upload Archive

- Archive: `dist/unsoccer-itch.zip`
- Manual-upload staging folder: `dist/yandex-upload-547090-v0.0.033/`
- Size: 63,225,427 bytes
- Root `index.html`: present
- Detected version in archive: `v0.0.033`
- Visible weight label in archive: `83.79 MB`
- Archive entries: 140
- Archive asset references: `assets/main-CxvZUkxq.js`,
  `assets/textureless-pbr-converter-CPRYpzHP.js`, `assets/main-CGdqL17i.css`
- Internal docs/skill/deploy/agent files in archive: none detected
- Build/validation commands used: `npm run test:unsoccer:acceptance`,
  then `npm run package:unsoccer`; final production-exact archive was
  regenerated on the Moscow mirror with `python3 tools/package_itch.py
  unsoccer` and copied back into the local staging folder.
- Acceptance result: pass for `v0.0.033`
- Yandex staging verifier: `node ui_designer/public_pages/verify-yandex-upload-pack.mjs --mode=live`
  passes for the current `dist/yandex-upload-547090-v0.0.033/` pack. It verifies
  all numbered files by pinned SHA-256, archive root `index.html`, `v0.0.033`,
  `83.79 MB`, 140 ZIP entries, asset references, no internal
  docs/skill/deploy files, PNG/GIF dimensions, H.264 `yuv420p` 1280x720 MP4
  duration `5.333333`, and size limits.

## Current Media Pack

- Folder: `ui_designer/public_pages/unsoccer-yandex-games-assets/`
- Manifest: `ui_designer/public_pages/unsoccer-yandex-games-assets/manifest.md`
- Required icon: `icon-512x512.png`
- Optional maskable icon: `maskable-icon-512x512.png`
- Required cover: `cover-800x470.png`
- Optional showcase cover: `showcase-cover-1560x520.png`
- Main gameplay video: `gameplay-horizontal-1280x720.mp4`
- Legacy GIF preview: `gameplay-preview-480x270.gif`
- Desktop screenshots: `screenshot-01-gameplay-1280x720.png`,
  `screenshot-02-gameplay-1280x720.png`

## Yandex Draft State Observed

- Draft URL:
  `https://games.yandex.ru/console/application/547090?new=true#application-info-draft`
- Application title: `Ragdoll Soccer II`
- Application ID: `547090`
- Last modified in console: `14:46:29 02/07/2026`
- Archive state: `File not uploaded`
- File inputs observed empty: archive, icon, cover, vertical video,
  horizontal video, desktop screenshots, ad videos.
- Recheck after packaging: archive still reports file not uploaded, all file
  inputs report `fileCount=0`, and `Send to moderation` is visible.
- Latest recheck: the draft still reports archive not uploaded, all file inputs
  report `fileCount=0`, and last modified remains `14:46:29 02/07/2026`.
- Latest continuation recheck at `2026-07-02T09:07:51Z`: the Yandex draft still
  contains `Файл не загружен`, all seven file inputs are empty, and the manual
  staging pack in `dist/yandex-upload-547090-v0.0.033/` is present with archive
  size `63,225,427` bytes.
- Latest read-only browser recheck at `2026-07-02T09:29:09Z`: the Yandex draft
  at application `547090` still contains `Файл не загружен`, exposes seven file
  inputs (`archive`, icon, cover, vertical video, horizontal video, desktop
  screenshots, ad videos), shows last modified `14:46:29 02/07/2026`, and has
  no proved selected upload files.
- Text/category fields appear filled: platform count 1, languages Russian and
  English, age 12+, categories Casual and Sports.

## Live Moscow Mirror State Observed

- Public game URL: `https://moscow-io-games.mecharulez.com/unsoccer/`
- Public API: `https://moscow-io-games.mecharulez.com/unsoccer/api/health`
- Deploy health: `https://moscow-io-games.mecharulez.com/ai_chat/api/deploy-health`
- DNS: `moscow-io-games.mecharulez.com` resolves to `5.42.121.207`
- TLS: certificate subject `CN=moscow-io-games.mecharulez.com`, issuer
  `Let's Encrypt YE1`, protocol `Tls13`, expires `2026-09-30 13:17:03`
- Observed live version: `v0.0.033`
- Observed live git commit: `738dbbb`
- Observed deploy health: `ready=true`, `dirty=false`, systemd active.
- Deploy webhook evidence: chat records show GitHub push received for
  `refs/heads/main` at `a5ca8205b873` and autodeploy completed. Later GitHub
  pushes reached the primary `io-games` hook but not the Moscow hook; Moscow was
  manually deployed with `/usr/local/bin/itch-games-autodeploy-moscow.sh` to
  `738dbbb`.
- Moscow pull fallback: `/usr/local/bin/itch-games-autodeploy-moscow-if-changed.sh`
  is installed with `itch-games-autodeploy-moscow.service` and
  `itch-games-autodeploy-moscow.timer`. The timer is enabled/active, checks
  `origin/main` every 60 seconds, refuses to deploy over a dirty checkout, and
  runs the Moscow deploy script only when `HEAD` differs from `origin/main`.
  First validation returned `no change: 738dbbb` with `Result=success` and
  `ExecMainStatus=0`.
- Primary-to-Moscow relay patch is prepared in local code. The qwertystock
  service reference sets `AI_CHAT_DEPLOY_RELAY_URLS` to
  `https://moscow-io-games.mecharulez.com/ai_chat/api/deploy-relay`; the Moscow
  service reference sets `AI_CHAT_DEPLOY_RELAY_ALLOW_IPS=145.239.0.57`. Moscow
  `/etc/systemd/system/itch-games-ai-chat.service` has been updated with that
  allowlist and `systemd-analyze verify` passed, but `server_node.js` was not
  manually copied to Moscow to avoid dirtying `/itch_games`. After the relay
  patch is pushed and deployed, the next main-branch push can trigger Moscow via
  the existing primary GitHub webhook.
- Continuation recheck: public `POST /ai_chat/api/deploy-relay` currently
  returns `404` on both `io-games.mecharulez.com` and
  `moscow-io-games.mecharulez.com`, so the relay patch is not live until the
  local code changes are pushed/deployed by the Orchestrator.
- The relay patch also adds a secret-free `/ai_chat/api/deploy-health`
  `deploy_relay` block. After deployment, primary should report
  `fanout_enabled=true` with target
  `https://moscow-io-games.mecharulez.com/ai_chat/api/deploy-relay`, and Moscow
  should report `accept_enabled=true` with allowed IP `145.239.0.57`.
- Local verifier smoke confirmed this block reports sanitized target host/path,
  strips query strings, reports `relay_token_configured` only as a boolean, and
  keeps relay secrets out of `/api/deploy-health`.
- Post-deploy verifier command:
  `node ai_chat/deploy/verify-moscow-relay.mjs --mode=live`. It verifies Moscow
  DNS/TLS, public game/API, deploy-health coherence, the safe ping probe for
  `/api/deploy-relay`, primary fanout, and Moscow relay allowlist. It must pass
  after the Orchestrator push/deploy before declaring the relay live.
- Browser smoke: `https://moscow-io-games.mecharulez.com/unsoccer/?name=MoscowSmoke&qaTime=30`
  loaded `v0.0.033 / 83.79 MB`, connected to the match, rendered a full-size
  canvas, and produced no browser error logs.
- Latest recheck: `deploy-health` is `ready=true` for `v0.0.033` at commit
  `738dbbb`, `/unsoccer/api/health` reports `v0.0.033`, and the remote
  `/itch_games` checkout is clean on `main...origin/main`.

## Upload Order For Orchestrator

Use the numbered files from `dist/yandex-upload-547090-v0.0.033/`.

1. Upload `01-unsoccer-archive-v0.0.033.zip` to the Archive field.
2. Upload `02-icon-512x512.png` to Icon.
3. Upload `03-maskable-icon-512x512.png` to Maskable icon if the field is visible.
4. Upload `04-cover-800x470.png` to Cover.
5. Upload `05-showcase-cover-1560x520.png` to Showcase cover if the field is
   visible.
6. Upload `06-gameplay-horizontal-1280x720.mp4` to Horizontal gameplay video.
7. Upload `07-gameplay-preview-480x270.gif` only if the legacy GIF field is used.
8. Upload `08-screenshot-01-gameplay-1280x720.png` and
   `09-screenshot-02-gameplay-1280x720.png` to Desktop screenshots.
9. Save the draft.
10. Recheck validation errors, then send to moderation.

## Blocking Note

The Codex in-app browser connector exposes the file inputs but does not expose a
`setInputFiles` method. DOM and coordinate clicks on the archive field did not
open a controllable OS file picker. The in-app page `evaluate` scope is
read-only for DOM mutation, so synthetic `File`/`DataTransfer` injection is not
available. Chrome/Edge are not running with an accessible remote debugging port,
and this repo does not currently have `playwright`, `playwright-core`,
`puppeteer`, or `selenium-webdriver` installed for a separate authenticated
automation session. The actual file upload step still requires manual browser
action in the open Yandex draft, a temporary authenticated browser automation
surface with file-upload support, or a Yandex upload API/token path supplied by
the account owner.

## Release Coherence Note

The upload archive and Moscow mirror now both report `v0.0.033` and use the
same production asset references. Moscow also has a pull-based autodeploy
fallback, so pushed `origin/main` changes are picked up by the Moscow server
even while GitHub-side hook creation is blocked. A primary-to-Moscow deploy
relay is prepared as the preferred no-2FA path: GitHub can keep the existing
primary hook, the primary chat service validates the GitHub HMAC, then Moscow
accepts `/api/deploy-relay` only from the primary host IP and runs its own
deploy script. The remaining infrastructure gap is the GitHub-side Moscow
webhook registration as a direct GitHub Settings record: GitHub settings
currently show the primary
`https://io-games.mecharulez.com/ai_chat/api/deploy-webhook` hook, but no
`moscow-io-games.mecharulez.com` hook. Adding that direct Moscow hook still
requires GitHub sudo/2FA confirmation in the browser or a token with repository
`Webhooks: write`.
