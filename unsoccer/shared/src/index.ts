export const GAME_VERSION = "v0.0.010";
export const ROOM_ID = "unsoccer-default-room";
export const MAX_ACTIVE_PLAYERS = 4;
export const MAX_ROOM_CLIENTS = 32;
export const SERVER_TICK_RATE = 60;
export const SNAPSHOT_RATE = 20;
export const DAY_CYCLE_SECONDS = 120;
export const FIELD_WIDTH = 24;
export const FIELD_LENGTH = 36;
export const GOAL_WIDTH = 8;
export const GOAL_DEPTH = 2.2;
export const PLAYER_RADIUS = 0.52;
export const PLAYER_HEIGHT = 1.75;
export const PLAYER_SPEED = 8.6;
export const BALL_RADIUS = 0.48;
export const KICK_RANGE = 2.05;
export const FOOT_KICK_STRENGTH = 7.6;
export const HEAD_KICK_STRENGTH = 8.8;
export const KICK_COOLDOWN_MS = 320;
export const HEAD_COOLDOWN_MS = 520;
export const BODY_BUMP_RANGE = 1.18;
export const BODY_BUMP_MIN_SPEED = 2.25;
export const BODY_BUMP_STRENGTH = 4.9;
export const BODY_BUMP_COOLDOWN_MS = 140;

export type TeamId = 0 | 1;
export type PlayerRole = "player" | "spectator";
export type KickKind = "left" | "right" | "head" | "body";
export type WeatherKind = "snow";
export type HazardType = "puddle" | "slush" | "snowbank";
export type AudioEventKind = "roster" | "kick" | "goal" | "countdown";
export type RosterAudioChange = "join" | "leave" | "spectator";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  kickLeft: number;
  kickRight: number;
  head: number;
  yaw: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  role: PlayerRole;
  team: TeamId | null;
  index: number;
  characterId: string;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  lastAction: KickKind | null;
  lastActionAt: number;
}

export interface BallSnapshot {
  position: Vec3;
  velocity: Vec3;
}

export interface HazardSnapshot {
  id: string;
  type: HazardType;
  position: Vec3;
  radius: number;
  strength: number;
}

export interface WeatherSnapshot {
  kind: WeatherKind;
  label: string;
  intensity: number;
  wind: Vec3;
  hazards: HazardSnapshot[];
}

export interface ScoreState {
  blue: number;
  orange: number;
}

export interface ServerAudioEventBase {
  id: number;
  serverTime: number;
  tick: number;
}

export interface RosterAudioEvent extends ServerAudioEventBase {
  kind: "roster";
  change: RosterAudioChange;
  playerId: string;
  role: PlayerRole;
}

export interface KickAudioEvent extends ServerAudioEventBase {
  kind: "kick";
  kick: KickKind;
  playerId: string;
  position: Vec3;
  speed: number;
}

export interface GoalAudioEvent extends ServerAudioEventBase {
  kind: "goal";
  team: TeamId;
}

export interface CountdownAudioEvent extends ServerAudioEventBase {
  kind: "countdown";
  remainingSeconds: number;
}

export type ServerAudioEvent = RosterAudioEvent | KickAudioEvent | GoalAudioEvent | CountdownAudioEvent;

export interface JoinRequest {
  name?: string;
}

export interface JoinAccepted {
  id: string;
  role: PlayerRole;
  team: TeamId | null;
  index: number;
  characterId: string;
  version: string;
  maxActivePlayers: number;
  maxRoomClients: number;
}

export interface ServerState {
  version: string;
  serverTime: number;
  tick: number;
  players: PlayerSnapshot[];
  ball: BallSnapshot;
  score: ScoreState;
  message: string;
  countdown: number;
  weather: WeatherSnapshot;
  audioEvents: ServerAudioEvent[];
}

export interface ClientInputMessage {
  input: InputState;
  sequence: number;
}

export interface ServerInfo {
  ok: boolean;
  version: string;
  activePlayers: number;
  connectedClients: number;
  maxActivePlayers: number;
  maxRoomClients: number;
  transports?: {
    websocket: boolean;
    http: boolean;
  };
}

export const DEFAULT_INPUT: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  kickLeft: 0,
  kickRight: 0,
  head: 0,
  yaw: 0
};

export const CHARACTER_ROSTER = ["6299851", "6270753", "6298507", "6300462"] as const;

export function teamName(team: TeamId | null): string {
  if (team === 0) return "\u0421\u0438\u043d\u0438\u0435";
  if (team === 1) return "\u041e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0435";
  return "\u041d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u0435\u043b\u044c";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizePlayerName(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const clean = raw.replace(/[^\p{L}\p{N}_ .-]/gu, "").trim().slice(0, 18);
  return clean || "\u0418\u0433\u0440\u043e\u043a";
}
