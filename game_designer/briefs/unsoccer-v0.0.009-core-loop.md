# UnSoccer v0.0.009 Core Loop Brief

Date: 2026-07-01
Owner: Game Designer
Task: `task_game_designer_core_loop`
Current public build: `v0.0.008` on `main@f115185`

## Current Loop

Players spawn into a snowy residential courtyard, chase the ball, fight the
weather lanes, and try to score before the reset countdown pulls everyone back
into shape. The fun moment should be: read the field, choose a safer route,
spend a burst of stamina, then time a kick that turns messy physics into a
clear goal chance.

## Friction

- The game has spectacle, but the player goal is still only "touch ball, kick
  ball, hope physics helps".
- Snow, puddles, slush, and snowbanks exist, but they need a clearer tactical
  promise: hazards should create route decisions, not just random drag.
- Movement smoothing improved readability, so the next mechanics pass can add
  pressure without feeling like network jitter.
- There is no player resource yet, so sprinting and super shots cannot create
  risk/reward.
- Score has no short-session target, so there is not yet a strong "one more
  round" cadence.

## Idea: Snowyard Pressure

The smallest playable milestone is a 2v2 courtyard match where weather is the
main opponent:

- Puddles are fast-risk zones: players slow lightly, the ball loses a little
  speed, and kicks through a puddle become harder to aim.
- Slush is control tax: players slow more strongly and stamina recovers slower
  while standing in it.
- Snowbanks are hard tactical blockers: they redirect players and ball, making
  the courtyard feel like a changing street-football arena.
- Stamina gives players one clear decision: hold Shift to sprint around hazards,
  or save stamina for a stronger shot.
- Super shot is not a new button at first. A normal kick becomes a super shot
  only when stamina is high enough, the player is near the ball, and the kick
  is timed cleanly.

## Rules

- Match target: first team to 3 goals wins the micro-match. Until match-end UI
  exists, keep the current score/reset loop and treat first-to-3 as the design
  target for Programmer/UI.
- Round rhythm: after each goal, reset countdown stays short and readable.
- Stamina range: 0-100.
- Sprint: Shift drains stamina while moving; no drain when stationary.
- Recovery: stamina recovers after a short delay when not sprinting.
- Hazard interaction:
  - Puddle: mild player slowdown, mild ball drag.
  - Slush: stronger player slowdown, stronger stamina recovery penalty.
  - Snowbank: physical blocker/deflector, not a slow zone.
- Super shot threshold: stamina at 70 or higher when a kick starts.
- Super shot cost: spend enough stamina that a missed super shot matters.
- Counterplay: sprinting through slush makes super shots harder to reach,
  forcing players to choose route safety or shot power.

## Win/Loss And Scoring

- Short-term win: score the next goal.
- Match win target: first to 3 goals.
- Loss pressure: low stamina near hazards leaves the player unable to chase or
  launch a strong kick.
- Score should reward deliberate route choice: a player who avoids slush and
  saves stamina gets a better kick window than a player who chases straight
  through every obstacle.

## Affected Roles

- Art Director: keep hazards visually readable over the v0.0.009 courtyard,
  sun, IBL-like lighting, and day-cycle pass.
- Programmer: implement stamina, Shift sprint, stamina recovery delay, and
  kick strength gating after the current visual pass is stable.
- UI Designer: add a compact stamina meter near the player/status HUD without
  weakening the always-visible version and weight badge.
- Sound Designer: add light stamina/sprint and super-shot cues after gameplay
  events are authoritative.
- Tester: verify two-client public behavior, hazard readability, first-to-3
  target behavior when implemented, and no regression to interpolation.

## Risks

- Too much slowdown will feel like lag. Hazard penalties must stay readable and
  intentionally avoid network-jitter feel.
- Super shot can dominate if stamina recovery is too fast.
- A stamina meter can clutter the already dense HUD on mobile.
- Day-cycle lighting can hide puddles/snowbanks unless Art and Tester capture
  morning, day, golden-hour, and night evidence.
- Generated `dist/` is still tracked historically; release validation must not
  rely on committed client dist as source of truth.

## Acceptance

- Design acceptance: this brief is linked from the skill hierarchy and posted
  to `/ai_chat`.
- Gameplay acceptance for the future implementation task:
  - Local deterministic gate still passes spectator assignment, kicks, body
    contact, score/reset, and audio-event checks.
  - Browser evidence shows hazards are visible and readable while players and
    ball move smoothly.
  - Stamina drains only during sprint movement, recovers after delay, and is
    visibly represented without hiding score, weather, roster, version, or
    weight.
  - Super shot only triggers above the stamina threshold and consumes stamina.
  - Public `/unsoccer/` version, badge, API health, deploy-health, and browser
    smoke all agree before QA treats the release as shipped.

## Next Task Proposal

Promote the implementation only after the active v0.0.009 Art Director visual
pass reaches review:

Title: Implement UnSoccer stamina sprint and stamina-gated super shots

Owner: Programmer, with UI Designer for meter placement and Tester for public
two-client evidence.

Scope: `unsoccer/shared/src/index.ts`, `unsoccer/server/src/index.ts`,
`unsoccer/client/src/main.ts`, `unsoccer/client/src/styles.css`,
`tools/unsoccer_acceptance.mjs`, version/docs/skill updates.
