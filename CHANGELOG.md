# Changelog

## unsoccer v0.0.010

- Cut the 0010 release line as the single main build after the v0.0.009
  workstreams: Art Director courtyard/rig/day-cycle runtime, UI Designer
  HUD/settings runtime, Programmer input responsiveness, and server-authored
  audioEvents.
- Keep the sun/moon marker camera-framed in the 3D renderer so the visible sun
  is present in screenshots, not only in lighting datasets.
- Synchronize root/workspace package metadata, shared `GAME_VERSION`, client
  badge/meta, public page text, and deterministic acceptance expectations on
  `v0.0.010`.
- Keep the client weight marker at `0.61 MB` for deploy-health checks and
  package validation.
- Make `package:unsoccer` rebuild before writing the itch zip, and make
  acceptance derive the expected game version from `package.json` so stale
  `dist` output cannot silently pass as a release.
- Update deploy-health/autodeploy checks to read the expected weight from the
  client source instead of a hard-coded old label.
- Fix the settings tab QA selector collision by keeping the active-tab debug
  state on `data-settings-active-tab` while controls use
  `button[data-settings-tab]`.
- Add repo-side Ragdoll Soccer II itch/publication copy, checklist, storefront
  assets, and ledger references as prepared publication material while external
  itch.io URL proof remains separate.
- Ignore generated browser profile folders under tester/art evidence to keep
  release staging focused on source, docs, and intentional QA artifacts.

## unsoccer v0.0.009

- Fix team-relative WASD movement so forward moves toward the opponent goal
  instead of feeling inverted from the tactical camera.
- Render the controlled local player from the latest authoritative snapshot
  with a small client prediction lead instead of the 100 ms interpolation delay
  used for remote entities.
- Remove the artificial player clamp to the pitch rectangle; players can leave
  the marked field and are only pushed by explicit gameplay colliders such as
  snowbanks.
- Ship the Art Director runtime pass: expanded residential courtyard models,
  procedural animated footballer rigs, visible sun/moon/orbit marker, and
  QA-readable 120-second day-cycle lighting datasets.
- Keep server-authored audio events, interpolation, and static client packaging
  aligned with the new release metadata.

## unsoccer v0.0.008

- Synchronize release metadata for the courtyard weight badge build.
- Update the tracked shared build artifact so the live UnSoccer server health
  reports `v0.0.008` consistently with package metadata and the public page.

## unsoccer v0.0.007

- Bump release metadata after the production deploy/version drift report.
- Synchronize package metadata, visible client badge, server health version,
  acceptance check, and autodeploy artifact check on `v0.0.007`.

## unsoccer v0.0.003

- Add server-authoritative snow weather, puddles, slush, and snowbank hazards.
- Slow players and damp the ball in wet/slushy zones, and block/deflect around
  snowbank obstacles.
- Add client weather visuals, HUD weather status, snow particles, and
  procedural weather audio/debug evidence.
- Add audio unlock diagnostics and first-unlock sync so connection/local role
  cues are not silently lost when server events arrive before browser audio is
  unlocked.
- Add an isolated `npm run test:unsoccer:acceptance` gate for server
  health/version, 5-client spectator assignment, left/right/head kicks, body
  contact, and goal score/reset/countdown.

## unsoccer v0.0.002

- Synchronize public pages, package metadata, and skill maps with the current
  server/client runtime version.
- Keep the local `/unsoccer/` page prototype-facing while the multiplayer
  server URL strategy is still separate from the static itch package.
- Add procedural Web Audio for server-confirmed kicks, body contacts, goals,
  countdown, roster changes, crowd bed, and ball rolling.

## unsoccer v0.0.001

- Add the Ragdoll Soccer II prototype scaffold under `unsoccer/`.
- Add TypeScript client/server/shared workspaces using Three.js, Rapier3D, and
  geckos.io in a MavonEngine-style multiplayer split.
- Add authoritative auto-room assignment for 4 active players plus spectator
  overflow, team scoring, server physics, WASD movement, and mouse kick inputs.
- Add Free3D candidate roster/provenance rules without downloading assets when
  `FREE3D_API_TOKEN` is unavailable.
- Add public `/unsoccer/` prototype page so static hosts do not expose directory
  listings.

## v0.0.006

- Add procedural Web Audio for run start, engine ambience, core collection,
  shield hits, near misses, and run completion.
- Add browser-safe gesture unlock for keyboard, pointer, touch, and restart
  flows.
- Expose `window.orbitalCourierAudio` and `orbital-courier:audio-event` for
  future network replication of semantic audio events.
- Vendor Three.js in the Orbital Courier itch package so the HTML5 upload does
  not depend on a CDN at runtime.
- Redesign the local IO Games catalog as a public Orbital Courier entry surface
  and document UI Designer ownership for local and itch.io public pages.
- Keep the production HTTP root redirect pointed at the shared HTTPS catalog
  instead of bypassing the catalog to Orbital Courier.
- Curate the itch.io zip so it excludes internal skill and agent coordination
  files.

## v0.0.005

- Make the game-over overlay visual-only so iframe mouse/touch restart clicks
  route through the canvas instead of relying on HTML button pointer delivery.

## v0.0.004

- Add document-level iframe click fallback so any pointer, mouse, touch, or
  click event that reaches the game frame can restart from the game-over
  overlay.

## v0.0.003

- Harden restart on itch.io iframe builds with pointer, mouse, touch, and
  overlay-level fallback start handlers.

## v0.0.002

- Start the run automatically when the page opens.
- Harden pointer, click, touch, Enter, and Space handling for the restart button.
- Display the active version in the bottom-left corner.
- Document the game versioning, Git push, and autodeploy rule.

## v0.0.001

- First public Orbital Courier build.
