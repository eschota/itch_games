# Changelog

## unsoccer v0.0.055

- Add a local `/admin` entry for the runtime settings page so tuning can start
  from `http://127.0.0.1:5195/admin` without opening the legacy filename.
- Make ball-strike trigger distances shorter by default and label the foot,
  hand, head, and precise kick range controls for tuning in the admin page.
- Reduce default bot fill to three active players while preserving explicit
  full-match bot scenarios in acceptance tests.

## unsoccer v0.0.054

- Fix orange-team keyboard side control: the client now mirrors left/right input
  for orange players in code while preserving the existing blue-team mapping and
  without changing the settings UI.

## unsoccer v0.0.053

- Add an itch.io/itch.zone hosted-build transport fallback: packaged iframe
  builds now connect to the production UnSoccer WebSocket and HTTP API instead
  of trying to use the embedding host as the game server.
- Keep the existing v0.0.052 gameplay contract unchanged while rebuilding the
  client/server/shared release artifacts for the hosted transport fix.

## unsoccer v0.0.052

- Fix point-blank/overlap player hits so a visible no-ball RMB/LMB strike also
  applies one-hit stamina damage and ragdoll knockback instead of becoming a
  harmless animation.
- Extend acceptance with stricter active bot roster checks: bot ids, roles,
  finite positions, playable-area bounds, non-test human join backfill, and
  default bot match stability are now release-gated.
- Cover LMB+Shift possession shots explicitly, keeping Shift as the strong-shot
  modifier while preserving the stamina contract that only Shift movement and
  incoming damage drain stamina.

## unsoccer v0.0.051

- Let default-aggression bots start visible close-range fights again while the
  anti-collapse guard pauses new bot brawls once enough players are already
  exhausted or ragdolled.
- Move bot combat aggression threshold and collapse-guard limits into
  `game-settings.json` and the runtime settings schema so the admin UI can tune
  them.
- Extend acceptance with a default-aggression bot brawl fixture proving one-hit
  stamina knockout, ragdoll, stable bot ids, active bot fill, and no fill
  suppression.

## unsoccer v0.0.050

- Make `/api/leave` remove WebSocket players as well as HTTP fallback players,
  closing the channel, rebalancing roles, and immediately backfilling the freed
  active slot with a bot.
- Send a browser `pagehide` leave beacon for the current joined player on both
  WebSocket and HTTP transports, so reloads/closed tabs do not leave stale human
  slots suppressing bots.
- Shorten the default WebSocket stale-slot timeout to 12 seconds and extend
  acceptance with a WebSocket leave/backfill fixture.
- Widen airborne LMB dash-kick swept player-hit reach so jump attacks more
  reliably knock down the target they dash toward.
- Prevent exhausted standing players from capturing or keeping ball possession,
  while allowing high-aggression bots to finish exhausted opponents into ragdoll
  without breaking bot fill.
- Keep default bot-only play focused on football: normal bot combat pressure now
  starts at aggression 0.55+, so the default 0.50 setup can score without
  stamina/ragdoll collapse.

## unsoccer v0.0.049

- Lock the stamina/combat release gate harder: acceptance now asserts that
  friendly fire, one-hit player knockout, zero jump stamina cost, and zero
  attacker hit stamina cost are active before the player-hit fixtures run.
- Add a non-test local server smoke inside acceptance so default local play
  proves `testMode=false`, bot runtime enabled, unsuppressed bot fill, and a
  full active bot roster before a build is called ready.
- Extend empty-space strike coverage so head whiffs are also proven free: they
  do not spend stamina, block recovery, trigger passive body contact, or emit
  fake kick audio when nothing is hit.

## unsoccer v0.0.048

- Keep exhausted zero-stamina players in slow recovery/walk mode: jump,
  possession shots, foot kicks, hand hits, head hits, held LMB charge, and
  buffered combat inputs are consumed without firing until stamina recovers.
- Make off-ball player hits work at overlap/point-blank range instead of
  skipping targets with near-zero horizontal distance.
- Reuse displaced bots from a dormant runtime pool when humans leave, and
  expose bot reuse, dormant pool size, repair count, and invalid active bot
  diagnostics through `/api/health`.
- Keep team indicator rings visible during exhaustion/ragdoll by pulsing
  opacity and scale, and publish rig QA datasets from the local player instead
  of whichever character updated last.

## unsoccer v0.0.047

- Stabilize the skinned character controller by resetting the procedural IK
  overlay to the bind pose before each animation frame, preventing punch/kick/
  ragdoll bone rotations from accumulating over time.
- Smooth visual ragdoll roots instead of snapping every server snapshot, while
  keeping server-authoritative ragdoll state and no local prediction override.
- Add browser QA counters for active/visible ragdolls, recent strikes, bot
  stamina ranges, bot sprint/exhaustion, visible rigged bots, and rig-level
  ragdoll/strike visibility.
- Extend `/api/health` with active human/test slot counts and stale HTTP/
  WebSocket client counts so bot-fill suppression is diagnosable.

## unsoccer v0.0.046

- Fix test-mode bot tuning persistence so `/api/test/bots` keeps runtime game
  settings synchronized with the file watcher instead of letting a previous
  `/api/bot-settings` target roll bot fill back down.
- Verified the current stamina/combat contract still passes: Shift is the only
  outgoing stamina drain, jumps/whiffs are free, and one-hit player damage
  ragdolls targets with knockback.
- Browser QA on local `5202/8812` confirms one human plus nine visible bots
  with no hidden active players and a ready full stamina meter.

## unsoccer v0.0.045

- Keep bot combat aligned with the current stamina economy: bot attacks are
  free whenever the bot is not exhausted or ragdolling, while stamina still
  drains only from Shift sprint and incoming player-hit damage.
- Add acceptance coverage for low-stamina bot fighting, one-hit ragdoll, and a
  stable full bot roster through combat recovery.

## unsoccer v0.0.044

- Keep bot fill self-healing during the server tick, so bot runtimes, active
  bot roles, and physics bodies are rebalanced even if a nonstandard state path
  skips the usual join/leave/settings rebalance.
- Make possessed balls collide with other players: a carried ball now drops
  ownership and rebounds from a blocker instead of passing through while it is
  attached to the owner.
- Harden acceptance around gameplay dependencies: bot combat must apply the
  same one-hit ragdoll knockout as human combat, and carried-ball blocker
  collision is covered as a regression.

## unsoccer v0.0.043

- Make off-ball fights more reliable: RMB/head inputs are consumed only after
  a successful strike or visible action, so cooldown timing no longer eats the
  next punch before it can animate or apply damage.
- Treat airborne LMB as a swept dash kick: when it misses the ball, the dash
  reach is included in player-hit targeting so jump-kicks can knock down
  players at the intended forward distance.
- Keep the stamina economy locked: Shift drains stamina gradually, incoming
  hits fully drain the target into ragdoll, and jump/attack attempts still do
  not spend attacker stamina.
- Full acceptance passed for bot fill, stable bot roster, possession shots,
  friendly-fire knockout, stamina rules, player-ball collision, and airborne
  dash kick.

## unsoccer v0.0.041

- Move the HTTP fallback stale-player timeout into `game-settings.json` /
  `GameSettings` / admin schema as `httpClientStaleMs` with a 12s default, so
  closed or frozen HTTP fallback tabs release active slots back to bots faster.
- Expose the active HTTP stale timeout through `/api/health` and extend
  acceptance to prove quick stale-player cleanup immediately restores the full
  bot lineup.
- Keep stamina/combat rules locked: stamina drains only from Shift sprint and
  incoming full-hit damage; jumps, attacks, and whiffs do not spend attacker
  stamina.

## unsoccer v0.0.040

- Expose bot runtime diagnostics in `/api/health`, `/api/game-settings`, and
  `/api/bot-settings`: total bots, active bots, target fill, runtime-enabled
  flag, human clients, and test-mode state are now visible without guessing.
- Add client QA datasets for snapshot players, active players, active bots,
  visible bots, hidden active players, and snapshot server version so browser
  testing can separate a dead/wrong local server from a render issue.
- Keep the stamina/combat rule intact and add a server guard so already-ragdoll
  targets cannot be repeatedly knocked by new strikes before they recover.

## unsoccer v0.0.039

- Register WebSocket state handlers before sending join so fast local servers
  cannot race the first authoritative state snapshot.
- Add a WebSocket state watchdog and a throttled render-loop fallback, keeping
  bots, roster, stamina HUD, and player actors visible even when the in-app
  browser throttles `requestAnimationFrame`.
- Keep the stamina/combat rule locked to the current design: Shift drains
  stamina gradually, incoming player hits fully drain stamina and ragdoll, while
  jumps and whiffed strikes do not spend stamina.

## unsoccer v0.0.038

- Upgrade mobile controls from static D-pad buttons to a draggable virtual
  movement pad so one finger can steer and hit diagonals.
- Keep mobile action buttons wired into the same gameplay input path for
  sprint, jump, foot kick charge, hand hit, and head hit.
- Expose mobile input diagnostics through `data-mobile-last-directions`,
  `data-mobile-last-action`, and resolved input datasets for browser QA.

## unsoccer v0.0.037

- Harden bot-fill counting so inactive or spectator non-bot runtimes cannot
  suppress the expected active bot lineup.
- Add acceptance coverage proving jump and empty-space strikes do not spend
  stamina or block stamina recovery.
- Keep the stamina economy rule: only Shift sprint and incoming player-hit
  damage drain stamina by default.

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
