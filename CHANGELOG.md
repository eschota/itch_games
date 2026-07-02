# Changelog

## unsoccer v0.0.030

- Make active ball strikes more user-friendly by giving foot/hand/head actions
  a player-centered assist reach in addition to the limb contact point.
- Give active strike inputs priority over passive body contact so the body
  collider no longer steals the interaction in the same frame as a kick.
- Add a short LMB/left-foot input buffer so slightly early clicks can still
  fire when the ball enters assisted reach.
- Reduce passive body bump range, minimum trigger aggression, and impulse so
  ordinary running contact nudges the ball without competing with deliberate
  kicks.
- Add acceptance coverage for active-strike priority, assisted left-foot reach,
  and softer body contact speed.
- Add a local post-commit autodeploy hook script so commits to `main` can run
  the UnSoccer gate, push to GitHub, and wait for the production webhook
  release to match deploy-health.
- Shorten local hook deploy-health waiting and let qwertystock autodeploy skip
  server-side npm/build work when committed UnSoccer dist artifacts already
  match the expected release.

## unsoccer v0.0.029

- Double normal foot/hand/head ball-hit impulse power so ordinary contacts no
  longer feel underpowered after the recent ball/contact tuning.
- Add server-authored left-foot charge: holding LMB starts a one-second charge
  window, interpolating left-foot ball power from 2x tap strength to 4x full
  strength, and a held charge can fire on ball contact before release.
- Expose local charge QA data through `data-local-kick-charge` and slightly
  expand the local player marker ring while charging.
- Widen the gameplay camera framing and add close sideline pennant/bench strips
  so the v0.0.028 courtyard dressing is visible during normal play, not only in
  far-edge views.

## unsoccer v0.0.028

- Extend the residential courtyard into a denser outer block with roads,
  sidewalks, garden pockets, lamps, planters, bicycles, utility props, tables,
  crates, puddles, and ground decals while preserving pitch readability.
- Add a local Free3D environment roster with 8 shipped GLB prop sources and
  clone them around the courtyard as benches, bins, cones, and background ruins.
- Expose `data-environment-model-instances`,
  `data-procedural-environment-instances`, `data-free3d-environment-instances`,
  and `data-free3d-environment-asset-count` for browser QA of the 100+ model
  requirement.
- Keep spectator benches and pennant frames just outside the pitch lines so the
  enriched courtyard reads in the player camera while the field stays clear.

## unsoccer v0.0.027

- Make player-ball body contact height-aware so a sufficiently airborne player
  can jump over a ground ball instead of pushing it by horizontal radius alone.
- Gate foot/hand/head ball hits by vertical contact reach, with head hits only
  applying when the ball is near the player's actual head height.
- Add acceptance regressions for airborne ball clearance and unreachable
  high-ball head attempts.

## unsoccer v0.0.026

- Widen night floodlight beams and volumetric cones so the masts cover the
  field instead of only the center circle.
- Give each mast a slightly different white temperature and a subtle
  deterministic flicker, with QA datasets for beam angle, beam radius, palette,
  and flicker strength.

## unsoccer v0.0.025

- Make the runtime camera follow a lerped authoritative player offset instead
  of any animated character/bone transform, removing movement bobble from the
  camera target.
- Smooth measured camera velocity from that anchor before calculating dynamic
  lead, and expose QA datasets for anchor smoothing, offset, and follow speed.
- Add a server-authored `ragdoll` state when stamina reaches zero: sprint
  exhaustion preserves movement inertia, stamina-emptying hits launch the target
  with heavy knockback/lift, and skinned characters switch to limp ragdoll IK.

## unsoccer v0.0.024

- Add team-colored indicator circles under players: each player now has a
  colored ground glow plus brighter ring using the current team color.
- Expose `data-local-team-marker` and `data-local-team-marker-color` for browser
  QA of the local player's marker color.
- Add a distinct `jumpRun` controller state for sprint/high-velocity jumps, with
  stronger forward-leap IK, faster playback, and QA datasets for jump style.

## unsoccer v0.0.023

- Assign each newly joined player a random ready character from the shared
  runtime roster instead of always starting from the first footballer.
- Use a shuffled non-repeating server deck so the roster is distributed across
  players before any character can repeat.
- Preserve the assigned `characterId` across role/team rebalancing so reconnects
  and spectator promotion do not silently remap the avatar.
## unsoccer v0.0.022

- Add authoritative keyboard movement smoothing: direction axes now ramp, a
  released side axis fades instead of disappearing instantly, opposite input
  wins faster, and controlled player velocity accelerates/brakes smoothly.
- Mirror the same smoothing model in local client prediction and expose
  `data-movement-smoothing`, `data-local-move-speed`, and
  `data-local-move-axis` for browser QA.
- Retarget Free3D character hand-strike IK so alternating left/right hand hits
  drive the punch forward at upper-chest/shoulder height instead of low across
  the torso.
- Raise the runtime hand-strike flash/trail target to match the corrected
  punch height.

## unsoccer v0.0.021

- Keep goals in a post-goal celebration phase for 5 seconds, then return the
  ball to kickoff over a 1-second server-authored flight instead of teleporting
  it to center immediately.
- Expose `goalReset` phase/progress snapshots and browser QA datasets for
  `celebration`, `returning`, and `kickoff`.
- Rebalance the half-size ball by raising its density to preserve useful mass
  and reducing foot/hand/head/body impulses so normal hits no longer launch it
  like a runaway projectile.

## unsoccer v0.0.020

- Halve the authoritative ball radius from `0.48` to `0.24` so the visual ball,
  Rapier collider, Free3D ball scale, sideline balls, and acceptance fixtures
  all use the smaller match ball.

## unsoccer v0.0.019

- Extend local-only Verlet goal nets from a rear sheet into closed netted
  goals with back, roof, left-side, and right-side cloth panels.
- Expose goal-net QA datasets for panel count and coverage while keeping net
  motion visual-only and off the network.

## unsoccer v0.0.018

- Make the gameplay camera stay anchored to the controlled player with
  smoothed velocity lead instead of blending toward the ball.
- Add a large HUD direction arrow for the ball when it leaves the camera view.
- Add compact offscreen direction arrows for other players outside the camera
  view, with QA-readable camera/offscreen datasets.

## unsoccer v0.0.017

- Add a local-player stamina HUD meter with numeric percent, state label, and
  ready/recovering/low/sprint/exhausted colors.
- Expose local stamina QA datasets for browser verification.
- Make right-hand hits visibly read with a longer orange strike trail and
  hand-action QA datasets.

## unsoccer v0.0.016

- Thin the goal posts and crossbar to half radius and switch them to neutral
  light metal instead of team-colored/yellow posts.
- Score only when the ball crosses the front goal-line plane from the field
  side; balls entering the net volume from the back no longer count.
- Add visible halfway/center-circle/center-spot, penalty-box, goal-area, and
  penalty-spot field markings.

## unsoccer v0.0.011

- Expand the authoritative pitch and courtyard footprint to 2x width/length and
  move roads, lights, props, hazards, and spectators out around the larger
  field.
- Replace static snow-only weather with server-randomized 60-120 second weather
  cycles, sunrise start time, smooth day/night sun rotation, dawn bird ambience,
  and daylight road traffic ambience.
- Add player stamina, sprint, exhaustion, jump, foot/hand/head attacks, player
  stamina damage, lighter body bumps, and a bouncier ball tuned for headers.
- Add local-only goal net cloth ripples, thicker goal posts/crossbars, and
  explicit post/crossbar ball rebound handling.
- Download 10 Free3D Online LowPoly 1k soccer-ball GLBs from public worker
  inventory paths, bake/derive textureless vertex-color optimized GLBs with
  Blender, record provenance, and load them as the sideline ball rack.
- Remove the camera-attached central sun/moon blob and keep sun/moon markers in
  world space.

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
- Stabilize the network HUD widget with fixed numeric columns and tabular
  numerals so ping/snapshot updates do not resize the panel.
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
