# Ragdoll Soccer II CrazyGames Upload Handoff v0.0.053

Generated on 2026-07-03 for CrazyGames Developer Portal.

## Portal State

- Developer page: `https://developer.crazygames.com/games`
- Submit page: `https://developer.crazygames.com/submit`
- Account visible in dashboard: `Konstantin`
- Existing games on `/games`: none visible.
- Submission mode used: `Basic`

## Current Filled Form State

The open browser form is filled up to the required file upload step:

- Game name: `Ragdoll Soccer II`
- Game engine: `Externally hosted (iframe)`
- IFrame link:
  `https://moscow-io-games.mecharulez.com/unsoccer/?source=crazygames&version=v0.0.053`
- Save progress: `No, the game does not need progress save`
- Mobile support: unchecked
- Online multiplayer: unchecked for the Basic Launch form
- CrazyGames SDK audio mute support: unchecked

Mobile, online multiplayer, and SDK audio support are intentionally unchecked
until dedicated CrazyGames mobile QA and CrazyGames SDK integration exist. The
portal warns that multiplayer submissions need invite-link functionality and
`IsInstantMultiplayer`; the current game does not implement those CrazyGames SDK
features yet.

Preview was clicked after filling the iframe form, then retried after blurring
the URL field with a force-click. The page stayed on step 1 without a visible
validation message, invalid form field, new tab, or console error; do not mark
the CrazyGames submission as complete until the portal advances past Preview and
the final Submit succeeds.

## Fallback HTML5 Upload Archive

- Archive source: `dist/unsoccer-itch.zip`
- Manual-upload staging folder: `dist/crazygames-upload-v0.0.053/`
- Archive: `dist/crazygames-upload-v0.0.053/01-unsoccer-crazygames-v0.0.053.zip`
- Archive size: `22,976,522` bytes
- Archive SHA-256:
  `bbf7b22b4699c0b9604fc4bec1a7ff9933f4659e451a96f2f2db4ac25a9ecdd7`
- Root `index.html`: present
- Detected version in archive: `v0.0.053`
- Visible weight label in archive: `40.05 MB`
- Archive entries: `105`
- Archive asset references: `assets/main-CoF2TUCT.js`,
  `assets/character-controller-CnsR1ojq.js`, `assets/main-LDAwewqp.css`
- Internal docs/skill/deploy/agent files in archive: none detected

## CrazyGames Requirement Fit

Official CrazyGames documentation states Basic Launch can be submitted without
custom CrazyGames SDK integration, but technical limits still apply.

- Total ZIP size: `22.98 MB`, under the 250 MB total limit.
- No-SDK Basic initial-size interpretation: ZIP is under 50 MB.
- File count: `105`, under the 1500 file count limit.
- Paths in `index.html` are relative asset refs.
- SDK/ads are not claimed in the form.

Important runtime note: the hosted ZIP is a fallback pack only. The current
client defaults to same-origin `/unsoccer/api` and `/unsoccer/socket/ws` outside
localhost/itch, so a CrazyGames-hosted ZIP would try to connect to the
CrazyGames domain unless the client is patched or the submission uses the iframe
URL above.

## Upload Order

Use files from `dist/crazygames-upload-v0.0.053/` only if CrazyGames requires a
hosted HTML5 ZIP instead of the iframe URL.

1. Upload `01-unsoccer-crazygames-v0.0.053.zip` to `Upload files *`.
2. Click `Preview`.
3. Complete the generated QA step.
4. Fill details/screenshots/video if CrazyGames asks after QA:
   - `02-icon-512x512.png`
   - `03-cover-800x470.png`
   - `04-screenshot-01-1280x720.png`
   - `05-screenshot-02-1280x720.png`
   - `06-gameplay-horizontal-1280x720.mp4`
5. Submit only after the CrazyGames preview/QA step opens and runs the expected
   `v0.0.053 / 40.05 MB` build.

## Current Blocker

- Codex in-app Browser can fill text, radio, checkbox, and combobox controls in
  the CrazyGames form.
- In iframe mode, Codex filled the live Moscow URL and clicked `Preview`, but the
  portal remained on step 1 without a visible error.
- In HTML5 upload mode, Codex in-app Browser cannot select the local ZIP in the
  `Upload files *` file input.
- Actual submission still requires the portal to advance past Preview, manual
  file selection if CrazyGames requires HTML5 upload, a browser automation
  surface with file-upload support, or a CrazyGames API/session upload path.

Do not mark CrazyGames as submitted until Preview/QA passes and the final submit
action succeeds.
