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
- Game engine: `HTML5`
- Save progress: `No, the game does not need progress save`
- Mobile support: unchecked
- Online multiplayer: checked
- Multiplayer lobby size: min `1`, max `4`
- CrazyGames SDK audio mute support: unchecked

Mobile and SDK audio support are intentionally unchecked until a dedicated
CrazyGames mobile QA pass and CrazyGames SDK integration exist.

## Current Upload Archive

- Archive source: `dist/unsoccer-itch.zip`
- Manual-upload staging folder: `dist/crazygames-upload-v0.0.053/`
- Archive: `dist/crazygames-upload-v0.0.053/01-unsoccer-crazygames-v0.0.053.zip`
- Archive size: `22,976,522` bytes
- Archive SHA-256:
  `af037e1587fd9f7c6264a73a50308ec0282909f76afde256f8f0d066f7f0834e`
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

## Upload Order

Use files from `dist/crazygames-upload-v0.0.053/`.

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
- Codex in-app Browser cannot select the local ZIP in the `Upload files *`
  file input.
- Actual submission still requires manual file selection, a browser automation
  surface with file-upload support, or a CrazyGames API/session upload path.

Do not mark CrazyGames as submitted until the uploaded ZIP is selected, preview
passes, and the final submit action succeeds.
