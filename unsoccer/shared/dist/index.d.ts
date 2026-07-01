export declare const GAME_VERSION = "v0.0.008";
export declare const ROOM_ID = "unsoccer-default-room";
export declare const MAX_ACTIVE_PLAYERS = 4;
export declare const MAX_ROOM_CLIENTS = 32;
export declare const SERVER_TICK_RATE = 60;
export declare const SNAPSHOT_RATE = 20;
export declare const DAY_CYCLE_SECONDS = 120;
export declare const FIELD_WIDTH = 24;
export declare const FIELD_LENGTH = 36;
export declare const GOAL_WIDTH = 8;
export declare const GOAL_DEPTH = 2.2;
export declare const PLAYER_RADIUS = 0.52;
export declare const PLAYER_HEIGHT = 1.75;
export declare const PLAYER_SPEED = 8.6;
export declare const BALL_RADIUS = 0.48;
export declare const KICK_RANGE = 2.05;
export declare const FOOT_KICK_STRENGTH = 7.6;
export declare const HEAD_KICK_STRENGTH = 8.8;
export declare const KICK_COOLDOWN_MS = 320;
export declare const HEAD_COOLDOWN_MS = 520;
export declare const BODY_BUMP_RANGE = 1.18;
export declare const BODY_BUMP_MIN_SPEED = 2.25;
export declare const BODY_BUMP_STRENGTH = 4.9;
export declare const BODY_BUMP_COOLDOWN_MS = 140;
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
export declare const DEFAULT_INPUT: InputState;
export declare const CHARACTER_ROSTER: readonly ["6299851", "6270753", "6298507", "6300462"];
export declare function teamName(team: TeamId | null): string;
export declare function clamp(value: number, min: number, max: number): number;
export declare function sanitizePlayerName(value: unknown): string;
