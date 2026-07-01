import { DEFAULT_INPUT, type InputState, type TeamId } from "@itch-games/unsoccer-shared";
import type { ControlSettings, InputAction } from "./settings";

export function actionPressed(settings: ControlSettings, action: InputAction, pressedCodes: ReadonlySet<string>): boolean {
  return (settings.bindings[action] || []).some((code) => pressedCodes.has(code));
}

export function codeForAction(settings: ControlSettings, action: InputAction): string {
  return settings.bindings[action]?.[0] || "";
}

export function resolveMovementInput(
  settings: ControlSettings,
  pressedCodes: ReadonlySet<string>,
  team: TeamId | null,
  baseInput: InputState
): InputState {
  let forward = (actionPressed(settings, "moveForward", pressedCodes) ? 1 : 0) -
    (actionPressed(settings, "moveBack", pressedCodes) ? 1 : 0);
  let side = (actionPressed(settings, "moveRight", pressedCodes) ? 1 : 0) -
    (actionPressed(settings, "moveLeft", pressedCodes) ? 1 : 0);
  if (settings.invertForwardBack) forward *= -1;
  if (settings.invertLeftRight) side *= -1;

  let xAxis = side;
  let zAxis = -forward;
  if (settings.movementMode === "team-goal") zAxis = team === 0 ? forward : -forward;
  if (settings.mirrorOnTeamSide && team === 1) xAxis *= -1;

  const next = { ...DEFAULT_INPUT, ...baseInput };
  next.left = xAxis < -0.05;
  next.right = xAxis > 0.05;
  next.up = zAxis < -0.05;
  next.down = zAxis > 0.05;
  if (xAxis !== 0 || zAxis !== 0) next.yaw = Math.atan2(xAxis, zAxis);
  return next;
}
