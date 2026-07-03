import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  CHARACTER_ROSTER,
  DEFAULT_USER_PICS,
  DEFAULT_INPUT,
  DEFAULT_GAME_SETTINGS,
  GAME_VERSION,
  GAME_SETTINGS_SCHEMA,
  MAX_ROOM_CLIENTS,
  SERVER_TICK_RATE,
  SNAPSHOT_RATE,
  type BallSnapshot,
  type CelebrationKind,
  type ClientInputMessage,
  type GoalResetSnapshot,
  type GameSettings,
  type HazardSnapshot,
  type InputState,
  type JoinAccepted,
  type JoinRequest,
  type KickKind,
  type ChatMessageSnapshot,
  type PlayerEmotionSnapshot,
  type PlayerController,
  type PlayerProfileSnapshot,
  type PlayerRole,
  type PlayerSnapshot,
  type ScoreState,
  type ServerAudioEvent,
  type ServerInfo,
  type ServerState,
  type StrikeSide,
  type TeamId,
  type Vec3,
  type WeatherKind,
  type WeatherSnapshot,
  clamp,
  emotionChoiceById,
  normalizeGameSettingsPatch,
  sanitizePlayerName
} from "@itch-games/unsoccer-shared";

type TransportEventHandler = (data: unknown) => void;

interface TransportChannel {
  id: string;
  emit(eventName: string, data: unknown): void;
  on(eventName: string, handler: TransportEventHandler): void;
  onDisconnect(handler: () => void): void;
  close(): void;
}

interface WireMessage {
  event?: unknown;
  data?: unknown;
}

type ServerAudioEventPayload = ServerAudioEvent extends infer Event
  ? Event extends ServerAudioEvent
    ? Omit<Event, "id" | "serverTime" | "tick">
    : never
  : never;
type BotBehavior = "balanced" | "enforcer";

const WEBSOCKET_ACCEPT_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_WEBSOCKET_PAYLOAD_BYTES = 64 * 1024;
const MAX_WEBSOCKET_BUFFER_BYTES = MAX_WEBSOCKET_PAYLOAD_BYTES + 16;
const CHAT_MESSAGE_LIMIT = 24;
const CHAT_MESSAGE_MAX_LENGTH = 160;
const USER_PIC_MAX_LENGTH = 96;
const EMOTION_VISIBLE_MS = 4200;
const STANCE_MIN_SPEED = 0.22;

class WebSocketChannel implements TransportChannel {
  readonly id = `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private readonly handlers = new Map<string, TransportEventHandler[]>();
  private readonly disconnectHandlers: Array<() => void> = [];
  private buffer = Buffer.alloc(0);
  private closed = false;
  private disconnected = false;

  constructor(private readonly socket: Duplex) {
    socket.on("data", (chunk) => this.receive(chunk));
    socket.on("close", () => this.emitDisconnect());
    socket.on("error", () => {
      // Close performs player cleanup; this listener prevents an unhandled error crash.
    });
  }

  receive(chunk: Buffer): void {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > MAX_WEBSOCKET_BUFFER_BYTES) {
      this.close();
      return;
    }
    this.drainFrames();
  }

  emit(eventName: string, data: unknown): void {
    if (this.closed || this.socket.destroyed) return;
    this.writeFrame(0x1, Buffer.from(JSON.stringify({ event: eventName, data }), "utf8"));
  }

  on(eventName: string, handler: TransportEventHandler): void {
    const handlers = this.handlers.get(eventName) || [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandlers.push(handler);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.socket.destroyed) {
      this.writeFrame(0x8, Buffer.alloc(0));
      this.socket.end();
    }
    this.emitDisconnect();
  }

  private handleMessage(raw: string): void {
    let message: WireMessage;
    try {
      message = JSON.parse(raw) as WireMessage;
    } catch (_) {
      return;
    }
    if (typeof message.event !== "string") return;
    for (const handler of this.handlers.get(message.event) || []) {
      handler(message.data);
    }
  }

  private drainFrames(): void {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let payloadLength = second & 0x7f;
      let offset = 2;
      if (payloadLength === 126) {
        if (this.buffer.length < offset + 2) return;
        payloadLength = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (this.buffer.length < offset + 8) return;
        const largeLength = this.buffer.readBigUInt64BE(offset);
        if (largeLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          this.close();
          return;
        }
        payloadLength = Number(largeLength);
        offset += 8;
      }
      if (!masked || payloadLength > MAX_WEBSOCKET_PAYLOAD_BYTES) {
        this.close();
        return;
      }
      const maskOffset = offset;
      offset += 4;
      if (this.buffer.length < offset + payloadLength) return;

      const mask = masked ? this.buffer.subarray(maskOffset, maskOffset + 4) : null;
      const payload = Buffer.from(this.buffer.subarray(offset, offset + payloadLength));
      this.buffer = this.buffer.subarray(offset + payloadLength);
      if (mask) {
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] = payload[index] ^ mask[index % 4];
        }
      }

      if (opcode === 0x8) {
        this.close();
        return;
      }
      if (opcode === 0x9) {
        this.writeFrame(0xA, payload);
        continue;
      }
      if (opcode !== 0x1) continue;
      this.handleMessage(payload.toString("utf8"));
    }
  }

  private writeFrame(opcode: number, payload: Buffer): void {
    if (this.socket.destroyed) return;
    let header: Buffer;
    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[1] = payload.length;
    } else if (payload.length <= 0xffff) {
      header = Buffer.alloc(4);
      header[1] = 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    header[0] = 0x80 | opcode;
    this.socket.write(Buffer.concat([header, payload]));
  }

  private emitDisconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    for (const handler of this.disconnectHandlers) handler();
  }
}

interface PlayerRuntime {
  id: string;
  name: string;
  role: PlayerRole;
  team: TeamId | null;
  index: number;
  goals: number;
  joinOrder: number;
  characterId: string;
  userPic: string;
  clientFingerprint: string | null;
  emotion: PlayerEmotionSnapshot | null;
  channel: TransportChannel | null;
  transport: "websocket" | "http" | "test" | "bot";
  input: InputState;
  inputSequence: number;
  body: RAPIER.RigidBody | null;
  moveAxis: { x: number; z: number };
  moveVelocity: Vec3;
  lastKickAt: number;
  lastHeadAt: number;
  lastKickLeft: number;
  lastKickLeftHeld: boolean;
  leftKickChargeStartedAt: number;
  leftKickChargeHeldMs: number;
  kickLeftHoldConsumed: boolean;
  leftKickBufferedUntil: number;
  leftKickBufferedCharge: number;
  lastKickRight: number;
  nextHandSide: -1 | 1;
  lastHead: number;
  lastJump: number;
  lastBodyAt: number;
  lastJumpAt: number;
  lastAction: KickKind | null;
  lastActionSide: StrikeSide | null;
  lastActionAt: number;
  trailingFoot: StrikeSide;
  stancePhase: number;
  celebration: CelebrationKind | null;
  celebrationAt: number;
  celebrationAvailableUntil: number;
  lastAudioRole: PlayerRole | null;
  yaw: number;
  velocity: Vec3;
  pushVelocity: Vec3;
  stamina: number;
  staminaRecoveryBlockedUntil: number;
  sprinting: boolean;
  exhausted: boolean;
  ragdoll: boolean;
  ragdollAt: number;
  ragdollVelocity: Vec3;
  grounded: boolean;
  verticalVelocity: number;
  lastSeenAt: number;
  botPersonality: number;
  botFlank: -1 | 1;
  botBehavior: BotBehavior;
  botLastKickCommandAt: number;
  botLastHandCommandAt: number;
  botLastHeadCommandAt: number;
  botLastJumpCommandAt: number;
}

interface GoalResetRuntime {
  scoringTeam: TeamId;
  scoredAt: number;
  returnStartAt: number;
  returnEndAt: number;
  returnStarted: boolean;
  returnFrom: Vec3;
}

interface PersistedPlayerSession {
  id: string;
  name: string;
  characterId: string;
  userPic: string;
  goals: number;
}

interface BotSettings {
  enabled: boolean;
  targetActivePlayers: number;
  aggression: number;
  shootDistance: number;
  fightDistance: number;
  chaseDistance: number;
  sprintDistance: number;
  shotAlignmentMin: number;
  supportReleaseDistance: number;
  kickIntervalMs: number;
  handIntervalMs: number;
  headIntervalMs: number;
  jumpChance: number;
}

const DEFAULT_GAME_SETTINGS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../game-settings.json"
);
const GAME_SETTINGS_FILE = process.env.UNSOCCER_GAME_SETTINGS_FILE || DEFAULT_GAME_SETTINGS_PATH;
const GAME_SETTINGS_SCHEMA_VERSION = 1;
const PHYSICS_SETTING_KEYS = new Set<keyof GameSettings>([
  "fieldWidth",
  "fieldLength",
  "goalWidth",
  "goalDepth",
  "goalPostRadius",
  "goalCrossbarHeight",
  "goalCrossbarRadius",
  "playerRadius",
  "playerHeight",
  "ballRadius",
  "ballDensity",
  "ballRestitution"
]);

let activeGameSettings: GameSettings = { ...DEFAULT_GAME_SETTINGS };

function gameSettings(): GameSettings {
  return activeGameSettings;
}

function botSettingsFromGameSettings(settings: GameSettings): BotSettings {
  return {
    enabled: settings.botsEnabled,
    targetActivePlayers: settings.botTargetActivePlayers,
    aggression: settings.botAggression,
    shootDistance: settings.botShootDistance,
    fightDistance: settings.botFightDistance,
    chaseDistance: settings.botChaseDistance,
    sprintDistance: settings.botSprintDistance,
    shotAlignmentMin: settings.botShotAlignmentMin,
    supportReleaseDistance: settings.botSupportReleaseDistance,
    kickIntervalMs: settings.botKickIntervalMs,
    handIntervalMs: settings.botHandIntervalMs,
    headIntervalMs: settings.botHeadIntervalMs,
    jumpChance: settings.botJumpChance
  };
}

function gameSettingsWithBotPatch(settings: GameSettings, botSettings: BotSettings): GameSettings {
  return normalizeGameSettingsPatch({
    ...settings,
    botsEnabled: botSettings.enabled,
    botTargetActivePlayers: botSettings.targetActivePlayers,
    botAggression: botSettings.aggression,
    botShootDistance: botSettings.shootDistance,
    botFightDistance: botSettings.fightDistance,
    botChaseDistance: botSettings.chaseDistance,
    botSprintDistance: botSettings.sprintDistance,
    botShotAlignmentMin: botSettings.shotAlignmentMin,
    botSupportReleaseDistance: botSettings.supportReleaseDistance,
    botKickIntervalMs: botSettings.kickIntervalMs,
    botHandIntervalMs: botSettings.handIntervalMs,
    botHeadIntervalMs: botSettings.headIntervalMs,
    botJumpChance: botSettings.jumpChance
  }, settings);
}

function settingsDifferOnPhysics(previous: GameSettings, next: GameSettings): boolean {
  for (const key of PHYSICS_SETTING_KEYS) {
    if (previous[key] !== next[key]) return true;
  }
  return false;
}

const PORT = Number(process.env.UNSOCCER_PORT || 8787);
const TEST_MODE = process.env.UNSOCCER_TEST_MODE === "1";
const TEST_TOKEN = process.env.UNSOCCER_TEST_TOKEN || "";
const AUDIO_EVENT_LIMIT = 80;
const AUDIO_EVENT_TTL_MS = 5000;
const BALL_VARIANT_COUNT = 10;
const BOT_ID_PREFIX = "bot-";
const BOT_NAMES = [
  "Artyom",
  "Vera",
  "Timur",
  "Mila",
  "Kirill",
  "Anya",
  "Nikita",
  "Lena",
  "Dima",
  "Sofia"
] as const;
const DEFAULT_BOT_SETTINGS: BotSettings = botSettingsFromGameSettings(DEFAULT_GAME_SETTINGS);

function weatherHazards(): HazardSnapshot[] {
  const settings = gameSettings();
  return [
    {
      id: "puddle-west-box",
      type: "puddle",
      position: { x: -settings.fieldWidth * 0.27, y: 0.03, z: -settings.fieldLength * 0.19 },
      radius: 3.4,
      strength: 0.58
    },
    {
      id: "puddle-east-mid",
      type: "puddle",
      position: { x: settings.fieldWidth * 0.25, y: 0.03, z: settings.fieldLength * 0.11 },
      radius: 3.1,
      strength: 0.52
    },
    {
      id: "slush-center-left",
      type: "slush",
      position: { x: -settings.fieldWidth * 0.12, y: 0.04, z: settings.fieldLength * 0.21 },
      radius: 3.7,
      strength: 0.38
    },
    {
      id: "slush-center-right",
      type: "slush",
      position: { x: settings.fieldWidth * 0.16, y: 0.04, z: -settings.fieldLength * 0.18 },
      radius: 3.5,
      strength: 0.34
    },
    {
      id: "snowbank-north",
      type: "snowbank",
      position: { x: -settings.fieldWidth * 0.34, y: 0.28, z: settings.fieldLength * 0.34 },
      radius: 1.7,
      strength: 0.92
    },
    {
      id: "snowbank-south",
      type: "snowbank",
      position: { x: settings.fieldWidth * 0.33, y: 0.28, z: -settings.fieldLength * 0.33 },
      radius: 1.75,
      strength: 0.92
    }
  ];
}

interface WeatherPreset {
  kind: WeatherKind;
  label: string;
  intensity: number;
  wind: Vec3;
  hazards: HazardSnapshot[];
}

function weatherPresets(): WeatherPreset[] {
  const hazards = weatherHazards();
  return [
    {
      kind: "dawn",
      label: "\u0420\u0430\u0441\u0441\u0432\u0435\u0442, \u0441\u0443\u0445\u043e",
      intensity: 0.02,
      wind: { x: 0.04, y: 0, z: -0.02 },
      hazards: []
    },
    {
      kind: "clear",
      label: "\u042f\u0441\u043d\u043e",
      intensity: 0.02,
      wind: { x: 0.08, y: 0, z: 0.04 },
      hazards: []
    },
    {
      kind: "rain",
      label: "\u0414\u043e\u0436\u0434\u044c \u0438 \u043b\u0443\u0436\u0438",
      intensity: 0.68,
      wind: { x: 0.18, y: 0, z: -0.08 },
      hazards: hazards.filter((hazard) => hazard.type !== "snowbank")
    },
    {
      kind: "snow",
      label: "\u0421\u043d\u0435\u0433, \u043b\u0443\u0436\u0438 \u0438 \u0441\u0443\u0433\u0440\u043e\u0431\u044b",
      intensity: 0.72,
      wind: { x: 0.16, y: 0, z: -0.1 },
      hazards
    }
  ];
}

function weatherWeights(): number[] {
  const settings = gameSettings();
  return [
    settings.weatherDawnWeight,
    settings.weatherClearWeight,
    settings.weatherRainWeight,
    settings.weatherSnowWeight
  ];
}

function vec3FromRapier(value: { x: number; y: number; z: number }): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function zeroVec(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

function distance2d(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function ballOverlapsPlayerBodyHeight(playerPosition: Vec3, ballPosition: Vec3): boolean {
  const settings = gameSettings();
  const bodyBottom = playerPosition.y - settings.playerHeight / 2 + settings.ballRadius * 0.35;
  const bodyTop = playerPosition.y + settings.playerHeight / 2 - settings.ballRadius * 0.25;
  return ballPosition.y + settings.ballRadius >= bodyBottom && ballPosition.y - settings.ballRadius <= bodyTop;
}

function kickContactVerticalRange(kind: KickKind): number {
  const settings = gameSettings();
  if (kind === "head") return settings.ballRadius + 0.18;
  if (kind === "hand") return settings.playerHeight * 0.5;
  return settings.ballRadius + 0.24;
}

function kickAssistHorizontalRange(kind: KickKind): number {
  const settings = gameSettings();
  if (kind === "head") return settings.headKickAssistRange;
  if (kind === "hand") return settings.handKickAssistRange;
  return settings.footKickAssistRange;
}

function playerHitProfile(kind: KickKind): { range: number; cone: number } {
  const settings = gameSettings();
  if (kind === "hand") return { range: Math.max(1.7, settings.handKickAssistRange + settings.playerRadius * 0.35), cone: -0.22 };
  if (kind === "head") return { range: Math.max(1.45, settings.headKickAssistRange + settings.playerRadius * 0.18), cone: -0.08 };
  return { range: Math.max(1.8, settings.footKickAssistRange + settings.playerRadius * 0.22), cone: -0.2 };
}

function playerHitVerticalRange(kind: KickKind): number {
  const settings = gameSettings();
  if (kind === "hand") return settings.playerHeight * 0.78;
  if (kind === "head") return settings.playerHeight * 0.9;
  return settings.playerHeight * 0.86;
}

function playerHitHeightInRange(attackerPosition: Vec3, targetPosition: Vec3, kind: KickKind): boolean {
  return Math.abs(targetPosition.y - attackerPosition.y) <= playerHitVerticalRange(kind);
}

function leftKickPowerMultiplier(charge: number): number {
  const settings = gameSettings();
  return lerp(
    settings.ballHitBasePowerMultiplier,
    settings.leftKickFullChargePowerMultiplier,
    clamp(charge, 0, 1)
  );
}

function ballHitPowerMultiplier(kind: KickKind, charge = 0): number {
  if (kind === "left") return leftKickPowerMultiplier(charge);
  if (kind === "hand" || kind === "head") return gameSettings().ballHitBasePowerMultiplier;
  return 1;
}

function leftKickChargeFractionFromHeldMs(heldMs: number): number {
  return clamp(heldMs / (gameSettings().leftKickChargeSeconds * 1000), 0, 1);
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

function cloneInput(input: InputState): InputState {
  return {
    up: Boolean(input.up),
    down: Boolean(input.down),
    left: Boolean(input.left),
    right: Boolean(input.right),
    kickLeft: Number(input.kickLeft || 0),
    kickLeftHeld: Boolean(input.kickLeftHeld),
    kickLeftCharge: clamp(Number(input.kickLeftCharge || 0), 0, 1),
    kickRight: Number(input.kickRight || 0),
    head: Number(input.head || 0),
    jump: Number(input.jump || 0),
    sprint: Boolean(input.sprint),
    yaw: Number.isFinite(input.yaw) ? input.yaw : 0
  };
}

function approachScalar(current: number, target: number, rate: number, dt: number): number {
  if (current === target) return target;
  const alpha = 1 - Math.exp(-Math.max(0, rate) * dt);
  return current + (target - current) * alpha;
}

function movementAxes(input: InputState, team: TeamId | null): { x: number; z: number; magnitude: number } {
  const xAxis = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const forwardAxis = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const attackDirection = team === 1 ? -1 : 1;
  const zAxis = forwardAxis * attackDirection;
  return {
    x: xAxis,
    z: zAxis,
    magnitude: Math.hypot(xAxis, zAxis)
  };
}

function normalizeMovementAxis(x: number, z: number): { x: number; z: number; magnitude: number } {
  const magnitude = Math.hypot(x, z);
  if (magnitude <= 0) return { x: 0, z: 0, magnitude: 0 };
  const normalizedMagnitude = Math.min(1, magnitude);
  return {
    x: x / magnitude,
    z: z / magnitude,
    magnitude: normalizedMagnitude
  };
}

function approachMovementAxis(current: number, target: number, dt: number): number {
  const settings = gameSettings();
  const rate = target === 0
    ? settings.playerInputAxisReleaseDecay
    : current !== 0 && Math.sign(current) !== Math.sign(target)
      ? settings.playerInputAxisOppositeAcceleration
      : settings.playerInputAxisAcceleration;
  const next = approachScalar(current, target, rate, dt);
  return Math.abs(next) < 0.001 && target === 0 ? 0 : clamp(next, -1, 1);
}

function botPersonality(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function playerControllerForTransport(transport: PlayerRuntime["transport"]): PlayerController {
  if (transport === "bot") return "bot";
  if (transport === "test") return "test";
  return "human";
}

function sideLabel(side: -1 | 1): StrikeSide {
  return side < 0 ? "left" : "right";
}

function sideValue(side: StrikeSide): -1 | 1 {
  return side === "left" ? -1 : 1;
}

function sanitizeSkinId(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value : "";
  return (CHARACTER_ROSTER as readonly string[]).includes(raw) ? raw : fallback;
}

function sanitizeUserPic(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  const clean = raw.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, USER_PIC_MAX_LENGTH).trim();
  if (!clean) return fallback;
  if (/^https?:\/\/[^\s<>"']{6,90}$/i.test(clean)) return clean;
  return clean.slice(0, 12);
}

function sanitizeChatText(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
}

function sanitizeClientFingerprint(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const clean = raw.replace(/[^a-z0-9_.:-]/gi, "").slice(0, 96);
  return clean.length >= 8 ? clean : null;
}

function profileFromPlayer(player: PlayerRuntime): PlayerProfileSnapshot {
  return {
    nickname: player.name,
    skinId: player.characterId,
    userPic: player.userPic
  };
}

function profilePatchSource(source: unknown): Record<string, unknown> {
  return typeof source === "object" && source !== null ? source as Record<string, unknown> : {};
}

class UnsoccerServer {
  private readonly app = express();
  private readonly httpServer = http.createServer(this.app);
  private websocketEnabled = false;

  private world!: RAPIER.World;
  private ballBody!: RAPIER.RigidBody;
  private readonly players = new Map<string, PlayerRuntime>();
  private readonly persistedPlayers = new Map<string, PersistedPlayerSession>();
  private characterDeck: string[] = [];
  private readonly score: ScoreState = { blue: 0, orange: 0 };
  private tickCount = 0;
  private joinCounter = 0;
  private message = "\u0416\u0434\u0451\u043c \u0438\u0433\u0440\u043e\u043a\u043e\u0432";
  private countdownUntil = 0;
  private lastSnapshotAt = 0;
  private nextAudioEventId = 0;
  private lastCountdownAudioSecond: number | null = null;
  private readonly audioEvents: ServerAudioEvent[] = [];
  private readonly chatMessages: ChatMessageSnapshot[] = [];
  private nextChatMessageId = 1;
  private readonly startedAt = Date.now();
  private settings: GameSettings = { ...DEFAULT_GAME_SETTINGS };
  private settingsRevision = 0;
  private settingsLoadedAt = 0;
  private settingsSource = GAME_SETTINGS_FILE;
  private physicsReady = false;
  private currentWeatherIndex = 0;
  private nextWeatherChangeAt = this.startedAt + this.randomWeatherDelayMs();
  private testDayTimeOverrideSeconds: number | null = null;
  private testNow = this.startedAt;
  private activeBallVariant = 0;
  private goalReset: GoalResetRuntime | null = null;
  private botSettings: BotSettings = { ...DEFAULT_BOT_SETTINGS };
  private nextBotId = 1;
  private readonly dormantBots: PlayerRuntime[] = [];
  private botReuseCount = 0;
  private botRepairCount = 0;
  private testBotsEnabled = false;
  private lastBallTouchPlayerId: string | null = null;
  private lastBallTouchTeam: TeamId | null = null;
  private lastBallTouchAt = 0;
  private ballOwnerPlayerId: string | null = null;
  private ballPossessionReleasedUntil = 0;

  async start(): Promise<void> {
    await RAPIER.init();
    this.loadGameSettingsFromDisk({ resetPhysics: false, source: "startup" });
    this.createPhysicsWorld();
    this.physicsReady = true;
    this.watchGameSettingsFile();
    this.configureHttp();
    this.configureWebSocket();
    this.rebalanceRoles();
    this.httpServer.listen(PORT, () => {
      console.log(`unsoccer ${GAME_VERSION} listening on http://127.0.0.1:${PORT}`);
    });

    setInterval(() => this.tick(), 1000 / SERVER_TICK_RATE);
  }

  private configureWebSocket(): void {
    this.websocketEnabled = true;
    this.httpServer.on("upgrade", (request, socket, head) => {
      if (!this.isWebSocketUpgrade(request)) {
        socket.destroy();
        return;
      }
      const key = String(request.headers["sec-websocket-key"] || "");
      const accept = crypto
        .createHash("sha1")
        .update(`${key}${WEBSOCKET_ACCEPT_GUID}`)
        .digest("base64");
      socket.write([
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "\r\n"
      ].join("\r\n"));
      const channel = new WebSocketChannel(socket);
      this.onConnection(channel);
      if (head.length) channel.receive(head);
    });
  }

  private isWebSocketUpgrade(request: http.IncomingMessage): boolean {
    const upgrade = String(request.headers.upgrade || "").toLowerCase();
    const key = request.headers["sec-websocket-key"];
    const version = String(request.headers["sec-websocket-version"] || "");
    if (upgrade !== "websocket" || typeof key !== "string" || version !== "13") return false;
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    return requestUrl.pathname === "/" || requestUrl.pathname === "/ws";
  }

  private loadGameSettingsFromDisk(options: { resetPhysics: boolean; source: string }): void {
    let raw: unknown = {};
    try {
      if (fs.existsSync(GAME_SETTINGS_FILE)) {
        raw = JSON.parse(fs.readFileSync(GAME_SETTINGS_FILE, "utf8")) as unknown;
      } else {
        this.writeGameSettingsFile(this.settings);
      }
    } catch (error) {
      console.warn(`Could not read UnSoccer settings from ${GAME_SETTINGS_FILE}:`, error);
      raw = this.settings;
    }
    const next = normalizeGameSettingsPatch(raw, DEFAULT_GAME_SETTINGS);
    this.applyGameSettings(next, {
      source: options.source,
      writeFile: !fs.existsSync(GAME_SETTINGS_FILE),
      resetPhysics: options.resetPhysics
    });
  }

  private watchGameSettingsFile(): void {
    fs.watchFile(GAME_SETTINGS_FILE, { interval: 1000 }, (current, previous) => {
      if (current.mtimeMs === previous.mtimeMs) return;
      this.loadGameSettingsFromDisk({ resetPhysics: true, source: "file-watch" });
    });
  }

  private applyGameSettings(
    next: GameSettings,
    options: { source: string; writeFile: boolean; resetPhysics: boolean }
  ): void {
    const previous = this.settings;
    const normalized = normalizeGameSettingsPatch(next, previous);
    const physicsChanged = settingsDifferOnPhysics(previous, normalized);
    this.settings = normalized;
    activeGameSettings = normalized;
    this.settingsRevision += 1;
    this.settingsLoadedAt = Date.now();
    this.settingsSource = options.source === "startup" ? GAME_SETTINGS_FILE : options.source;
    this.botSettings = botSettingsFromGameSettings(normalized);
    for (const player of this.players.values()) {
      player.stamina = clamp(player.stamina, 0, normalized.playerStaminaMax);
      if (player.exhausted && player.stamina >= normalized.playerExhaustedRecoveryThreshold) player.exhausted = false;
    }
    if (TEST_MODE && (options.source === "api" || options.source === "api-bot-settings")) {
      this.testBotsEnabled = this.botSettings.enabled;
    }
    if (options.writeFile) this.writeGameSettingsFile(normalized);
    if (this.nextWeatherChangeAt < Date.now()) this.nextWeatherChangeAt = Date.now() + this.randomWeatherDelayMs();
    if (this.physicsReady && options.resetPhysics && physicsChanged) {
      this.rebuildPhysicsWorld(Date.now());
    } else if (this.physicsReady) {
      this.rebalanceRoles();
      this.broadcast("state", this.snapshot());
    }
  }

  private writeGameSettingsFile(settings: GameSettings): void {
    fs.mkdirSync(path.dirname(GAME_SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(GAME_SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }

  private rebuildPhysicsWorld(now: number): void {
    for (const player of this.players.values()) {
      player.body = null;
      player.velocity = zeroVec();
      player.moveAxis = { x: 0, z: 0 };
      player.moveVelocity = zeroVec();
      player.pushVelocity = zeroVec();
      player.ragdollVelocity = zeroVec();
    }
    this.createPhysicsWorld();
    this.resetMatch(now);
    this.message = "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0438\u0433\u0440\u044b \u043f\u0440\u0438\u043c\u0435\u043d\u0435\u043d\u044b";
    this.broadcast("state", this.snapshot(now));
  }

  private configureHttp(): void {
    this.app.use((request, response, next) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Unsoccer-Test-Token");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      if (request.method === "OPTIONS") {
        response.status(204).end();
        return;
      }
      next();
    });
    this.app.use(express.json({ limit: "32kb" }));
    this.app.get("/api/health", (_request, response) => {
      response.json(this.serverInfo());
    });
    this.app.get("/api/game-settings", (_request, response) => {
      response.json(this.gameSettingsPayload());
    });
    this.app.post("/api/game-settings", (request, response) => {
      const body = this.requestBody(request);
      const patch = typeof body.settings === "object" && body.settings !== null ? body.settings : body;
      const next = normalizeGameSettingsPatch({ ...this.settings, ...patch }, this.settings);
      this.applyGameSettings(next, { source: "api", writeFile: true, resetPhysics: true });
      response.json(this.gameSettingsPayload());
    });
    this.app.post("/api/game-settings/reload", (_request, response) => {
      this.loadGameSettingsFromDisk({ resetPhysics: true, source: "api-reload" });
      response.json(this.gameSettingsPayload());
    });
    this.app.get("/api/bot-settings", (_request, response) => {
      response.json(this.botSettingsPayload());
    });
    this.app.post("/api/bot-settings", (request, response) => {
      const body = this.requestBody(request);
      this.botSettings = this.normalizeBotSettings(body.settings || body, this.botSettings);
      this.applyGameSettings(gameSettingsWithBotPatch(this.settings, this.botSettings), {
        source: "api-bot-settings",
        writeFile: true,
        resetPhysics: false
      });
      if (TEST_MODE) this.testBotsEnabled = this.botSettings.enabled;
      this.rebalanceRoles();
      response.json(this.botSettingsPayload());
    });
    this.app.post("/api/join", (request, response) => {
      const body = this.requestBody(request);
      const clientFingerprint = sanitizeClientFingerprint(body.clientFingerprint);
      const existingPlayer = this.playerByFingerprint(clientFingerprint);
      if (!existingPlayer && this.rawConnectedClientCount() >= MAX_ROOM_CLIENTS) {
        response.status(409).json({ ok: false, error: "server-full", maxRoomClients: MAX_ROOM_CLIENTS });
        return;
      }
      const runtime = existingPlayer || this.createRuntime({
        id: `http-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: sanitizePlayerName(body.name),
        channel: null,
        transport: "http",
        clientFingerprint
      });
      runtime.channel = null;
      runtime.transport = "http";
      runtime.clientFingerprint = clientFingerprint;
      runtime.lastSeenAt = Date.now();
      this.applyProfile(runtime, { ...body, ...profilePatchSource(body.profile) });
      this.persistPlayerSession(runtime);
      if (!existingPlayer) this.players.set(runtime.id, runtime);
      this.rebalanceRoles();
      this.message = `${runtime.name} \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u043b\u0441\u044f ${runtime.role === "player" ? "\u043a \u043f\u043e\u043b\u044e" : "\u043a\u0430\u043a \u043d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u0435\u043b\u044c"}`;
      response.json({ ok: true, joined: this.joinPayload(runtime), state: this.snapshot() });
    });
    this.app.post("/api/input", (request, response) => {
      const body = this.requestBody(request);
      const player = this.players.get(String(body.clientId || ""));
      if (!player || player.transport !== "http") {
        response.status(404).json({ ok: false, error: "client not found" });
        return;
      }
      const message = body as Partial<ClientInputMessage> & { clientId?: string };
      if (typeof message.sequence === "number" && message.sequence >= player.inputSequence) {
        player.input = cloneInput(message.input || DEFAULT_INPUT);
        player.inputSequence = message.sequence;
        player.lastSeenAt = Date.now();
      }
      response.json({ ok: true });
    });
    this.app.post("/api/chat", (request, response) => {
      const body = this.requestBody(request);
      const player = this.players.get(String(body.clientId || ""));
      if (!player || player.transport !== "http") {
        response.status(404).json({ ok: false, error: "client not found" });
        return;
      }
      const message = this.addChatMessage(player, body.text, Date.now());
      response.json({ ok: true, message, state: this.snapshot() });
    });
    this.app.post("/api/emotion", (request, response) => {
      const body = this.requestBody(request);
      const player = this.players.get(String(body.clientId || ""));
      if (!player || player.transport !== "http") {
        response.status(404).json({ ok: false, error: "client not found" });
        return;
      }
      const emotion = this.applyEmotion(player, body.emotionId || body.id, Date.now());
      if (!emotion) {
        response.status(400).json({ ok: false, error: "unknown emotion" });
        return;
      }
      response.json({ ok: true, emotion, state: this.snapshot() });
    });
    this.app.post("/api/profile", (request, response) => {
      const body = this.requestBody(request);
      const player = this.players.get(String(body.clientId || ""));
      if (!player || player.transport !== "http") {
        response.status(404).json({ ok: false, error: "client not found" });
        return;
      }
      this.applyProfile(player, { ...body, ...profilePatchSource(body.profile) });
      this.persistPlayerSession(player);
      player.lastSeenAt = Date.now();
      this.message = `${player.name} \u043e\u0431\u043d\u043e\u0432\u0438\u043b \u043f\u0440\u043e\u0444\u0438\u043b\u044c`;
      response.json({ ok: true, joined: this.joinPayload(player), state: this.snapshot() });
    });
    this.app.get("/api/state", (request, response) => {
      const player = this.players.get(String(request.query.clientId || ""));
      if (!player || player.transport !== "http") {
        response.status(404).json({ ok: false, error: "client not found" });
        return;
      }
      player.lastSeenAt = Date.now();
      response.json({ ok: true, joined: this.joinPayload(player), state: this.snapshot() });
    });
    this.app.post("/api/leave", (request, response) => {
      const body = this.requestBody(request);
      const player = this.players.get(String(body.clientId || ""));
      if (player && (player.transport === "http" || player.transport === "websocket")) {
        const channel = player.channel;
        player.channel = null;
        this.persistPlayerSession(player);
        this.pushRosterAudioEvent(player, "leave");
        this.destroyBody(player);
        this.players.delete(player.id);
        channel?.close();
        this.rebalanceRoles();
        this.message = `${player.name} \u0432\u044b\u0448\u0435\u043b`;
      }
      response.json({ ok: true });
    });
    if (TEST_MODE) this.configureTestHttp();
  }

  private configureTestHttp(): void {
    this.app.get("/api/test/state", (request, response) => {
      if (!this.allowTestRequest(request, response)) return;
      response.json({ ok: true, state: this.snapshot() });
    });

    this.app.post("/api/test/reset", (request, response) => {
      if (!this.allowTestRequest(request, response)) return;
      this.testNow = Date.now();
      this.resetMatch(this.testNow);
      response.json({ ok: true, state: this.snapshot() });
    });

    this.app.post("/api/test/players", (request, response) => {
      if (!this.allowTestRequest(request, response)) return;
      const body = this.requestBody(request);
      const count = this.numberField(body.count, 0, 0, MAX_ROOM_CLIENTS);
      this.createTestPlayers(count);
      response.json({ ok: true, state: this.snapshot() });
    });

    this.app.post("/api/test/ball", (request, response) => {
      if (!this.allowTestRequest(request, response)) return;
      const body = this.requestBody(request);
      const currentPosition = vec3FromRapier(this.ballBody.translation());
      const currentVelocity = vec3FromRapier(this.ballBody.linvel());
      const position = this.vecField(body.position, currentPosition);
      const velocity = this.vecField(body.velocity, currentVelocity);
      this.ballOwnerPlayerId = null;
      this.ballPossessionReleasedUntil = 0;
      this.ballBody.setTranslation(position, true);
      this.ballBody.setLinvel(velocity, true);
      this.ballBody.setAngvel(zeroVec(), true);
      response.json({ ok: true, state: this.snapshot() });
    });

    this.app.post("/api/test/player/:index", (request, response) => {
      if (!this.allowTestRequest(request, response)) return;
      const index = Number(request.params.index);
      if (!Number.isInteger(index)) {
        response.status(400).json({ ok: false, error: "index must be an integer" });
        return;
      }
      const player = [...this.players.values()].find((candidate) => candidate.index === index);
      if (!player) {
        response.status(404).json({ ok: false, error: "player not found" });
        return;
      }
      const body = this.requestBody(request);
      this.applyTestPlayerPatch(player, body);
      response.json({ ok: true, player: this.snapshotPlayer(player), state: this.snapshot() });
    });

    this.app.post("/api/test/weather", (request, response) => {
      if (!this.allowTestRequest(request, response)) return;
      const body = this.requestBody(request);
      const kind = String(body.kind || "");
      const presetIndex = weatherPresets().findIndex((preset) => preset.kind === kind);
      if (presetIndex < 0) {
        response.status(400).json({ ok: false, error: "unknown weather kind" });
        return;
      }
      this.currentWeatherIndex = presetIndex;
      this.nextWeatherChangeAt = Date.now() + this.randomWeatherDelayMs();
      response.json({ ok: true, state: this.snapshot() });
    });

    this.app.post("/api/test/day", (request, response) => {
      if (!this.allowTestRequest(request, response)) return;
      const body = this.requestBody(request);
      if (body.clear === true) {
        this.testDayTimeOverrideSeconds = null;
      } else {
        this.testDayTimeOverrideSeconds = this.numberField(body.dayTimeSeconds, this.settings.dayStartSeconds, 0, 24 * 60 * 60 - 1);
      }
      response.json({ ok: true, state: this.snapshot() });
    });

    this.app.post("/api/test/bots", (request, response) => {
      if (!this.allowTestRequest(request, response)) return;
      const body = this.requestBody(request);
      const settingsBody = typeof body.settings === "object" && body.settings !== null ? body.settings as Record<string, unknown> : null;
      let changed = false;
      if (body.settings !== undefined) {
        this.botSettings = this.normalizeBotSettings(body.settings, this.botSettings);
        if (settingsBody && settingsBody.enabled !== undefined) this.testBotsEnabled = this.botSettings.enabled;
        changed = true;
      }
      if (body.enabled !== undefined) {
        this.testBotsEnabled = Boolean(body.enabled);
        this.botSettings = this.normalizeBotSettings({ enabled: this.testBotsEnabled }, this.botSettings);
        changed = true;
      }
      if (changed) {
        this.applyGameSettings(gameSettingsWithBotPatch(this.settings, this.botSettings), {
          source: "api-test-bots",
          writeFile: false,
          resetPhysics: false
        });
      }
      this.rebalanceRoles();
      response.json({ ok: true, settings: this.botSettings, state: this.snapshot() });
    });

    this.app.post("/api/test/tick", (request, response) => {
      if (!this.allowTestRequest(request, response)) return;
      const body = this.requestBody(request);
      const frames = this.numberField(body.frames, 1, 1, SERVER_TICK_RATE * 10);
      let now = Math.max(Date.now(), this.testNow);
      for (let frame = 0; frame < frames; frame += 1) {
        now += 1000 / SERVER_TICK_RATE;
        this.tick(now, false);
      }
      this.testNow = now;
      response.json({ ok: true, state: this.snapshot(now) });
    });
  }

  private allowTestRequest(request: Request, response: Response): boolean {
    if (!TEST_MODE) {
      response.status(404).json({ ok: false, error: "test mode is disabled" });
      return false;
    }
    if (TEST_TOKEN && request.get("x-unsoccer-test-token") !== TEST_TOKEN) {
      response.status(403).json({ ok: false, error: "test token is invalid" });
      return false;
    }
    if (!TEST_TOKEN && !this.isLoopbackRequest(request)) {
      response.status(403).json({ ok: false, error: "test API requires loopback or UNSOCCER_TEST_TOKEN" });
      return false;
    }
    return true;
  }

  private isLoopbackRequest(request: Request): boolean {
    const remote = request.ip || request.socket.remoteAddress || "";
    return remote === "::1" || remote === "127.0.0.1" || remote === "::ffff:127.0.0.1" || remote.startsWith("::ffff:127.");
  }

  private requestBody(request: Request): Record<string, unknown> {
    return typeof request.body === "object" && request.body !== null ? request.body as Record<string, unknown> : {};
  }

  private numberField(value: unknown, fallback: number, min: number, max: number): number {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return fallback;
    return clamp(Math.floor(numberValue), min, max);
  }

  private coordinateField(value: unknown, fallback: number): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
  }

  private vecField(value: unknown, fallback: Vec3): Vec3 {
    const source = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    return {
      x: this.coordinateField(source.x, fallback.x),
      y: this.coordinateField(source.y, fallback.y),
      z: this.coordinateField(source.z, fallback.z)
    };
  }

  private numberSetting(value: unknown, fallback: number, min: number, max: number): number {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return fallback;
    return Math.round(clamp(numberValue, min, max) * 1000) / 1000;
  }

  private normalizeBotSettings(value: unknown, fallback: BotSettings = DEFAULT_BOT_SETTINGS): BotSettings {
    const source = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    return {
      enabled: source.enabled === undefined ? fallback.enabled : Boolean(source.enabled),
      targetActivePlayers: this.numberField(source.targetActivePlayers, fallback.targetActivePlayers, 0, this.settings.maxActivePlayers),
      aggression: this.numberSetting(source.aggression, fallback.aggression, 0, 1),
      shootDistance: this.numberSetting(source.shootDistance, fallback.shootDistance, 1.2, 6),
      fightDistance: this.numberSetting(source.fightDistance, fallback.fightDistance, 0.9, 3),
      chaseDistance: this.numberSetting(source.chaseDistance, fallback.chaseDistance, 1.5, 9),
      sprintDistance: this.numberSetting(source.sprintDistance, fallback.sprintDistance, 0, 14),
      shotAlignmentMin: this.numberSetting(source.shotAlignmentMin, fallback.shotAlignmentMin, -0.5, 1),
      supportReleaseDistance: this.numberSetting(source.supportReleaseDistance, fallback.supportReleaseDistance, 0, 8),
      kickIntervalMs: this.numberField(source.kickIntervalMs, fallback.kickIntervalMs, 180, 1800),
      handIntervalMs: this.numberField(source.handIntervalMs, fallback.handIntervalMs, 260, 2200),
      headIntervalMs: this.numberField(source.headIntervalMs, fallback.headIntervalMs, 360, 2600),
      jumpChance: this.numberSetting(source.jumpChance, fallback.jumpChance, 0, 0.25)
    };
  }

  private gameSettingsPayload(now = Date.now()): {
    ok: true;
    version: string;
    schemaVersion: number;
    revision: number;
    loadedAt: number;
    source: string;
    settingsPath: string;
    settings: GameSettings;
    defaults: GameSettings;
    schema: typeof GAME_SETTINGS_SCHEMA;
    state: ServerState;
    info: ServerInfo;
  } {
    return {
      ok: true,
      version: GAME_VERSION,
      schemaVersion: GAME_SETTINGS_SCHEMA_VERSION,
      revision: this.settingsRevision,
      loadedAt: this.settingsLoadedAt,
      source: this.settingsSource,
      settingsPath: GAME_SETTINGS_FILE,
      settings: { ...this.settings },
      defaults: { ...DEFAULT_GAME_SETTINGS },
      schema: GAME_SETTINGS_SCHEMA,
      state: this.snapshot(now),
      info: this.serverInfo()
    };
  }

  private botSettingsPayload(now = Date.now()): {
    ok: true;
    settings: BotSettings;
    defaults: BotSettings;
    state: ServerState;
    info: ServerInfo;
  } {
    return {
      ok: true,
      settings: { ...this.botSettings },
      defaults: { ...DEFAULT_BOT_SETTINGS },
      state: this.snapshot(now),
      info: this.serverInfo()
    };
  }

  private rawConnectedClientCount(): number {
    let count = 0;
    for (const player of this.players.values()) {
      if (player.transport === "websocket" || player.transport === "http") count += 1;
    }
    return count;
  }

  private isStaleClientPlayer(player: PlayerRuntime, now: number): boolean {
    if (player.transport === "http") return now - player.lastSeenAt >= this.settings.httpClientStaleMs;
    if (player.transport === "websocket") return now - player.lastSeenAt >= this.settings.websocketClientStaleMs;
    return false;
  }

  private liveHumanClientCount(now = Date.now()): number {
    let count = 0;
    for (const player of this.players.values()) {
      if ((player.transport === "websocket" || player.transport === "http") && !this.isStaleClientPlayer(player, now)) count += 1;
    }
    return count;
  }

  private nonBotActiveSlotCount(now = Date.now()): number {
    const nonBots = [...this.players.values()]
      .filter((player) => player.transport !== "bot" && !this.isStaleClientPlayer(player, now))
      .sort((a, b) => a.joinOrder - b.joinOrder);
    return Math.min(nonBots.length, this.settings.maxActivePlayers);
  }

  private playerByFingerprint(clientFingerprint: string | null): PlayerRuntime | null {
    if (!clientFingerprint) return null;
    for (const player of this.players.values()) {
      if (player.clientFingerprint === clientFingerprint) return player;
    }
    return null;
  }

  private persistPlayerSession(player: PlayerRuntime): void {
    if (!player.clientFingerprint || player.transport === "bot" || player.transport === "test") return;
    this.persistedPlayers.set(player.clientFingerprint, {
      id: player.id,
      name: player.name,
      characterId: player.characterId,
      userPic: player.userPic,
      goals: player.goals
    });
  }

  private botPlayers(): PlayerRuntime[] {
    return [...this.players.values()]
      .filter((player) => player.transport === "bot")
      .sort((a, b) => a.joinOrder - b.joinOrder);
  }

  private botsEnabled(): boolean {
    return this.botSettings.enabled && (!TEST_MODE || this.testBotsEnabled);
  }

  private desiredBotCount(now = Date.now()): number {
    if (!this.botsEnabled()) return 0;
    const target = clamp(Math.floor(this.botSettings.targetActivePlayers), 0, this.settings.maxActivePlayers);
    const nonBotCount = this.nonBotActiveSlotCount(now);
    return Math.max(0, target - Math.min(target, nonBotCount));
  }

  private botFillSuppressionReason(nonBotActiveSlots: number): string {
    if (!this.botSettings.enabled) return "bots-disabled";
    if (TEST_MODE && !this.testBotsEnabled) return "test-mode-disabled";
    const target = clamp(Math.floor(this.botSettings.targetActivePlayers), 0, this.settings.maxActivePlayers);
    if (target <= 0) return "target-zero";
    if (nonBotActiveSlots >= target) {
      const activeTestSlots = [...this.players.values()]
        .filter((player) => player.role === "player" && player.transport === "test")
        .length;
      if (activeTestSlots >= target) return "test-slots-full";
      if (activeTestSlots > 0) return "mixed-human-test-slots-full";
      return "human-slots-full";
    }
    return "none";
  }

  private syncBots(now = Date.now()): void {
    const desired = this.desiredBotCount(now);
    const bots = this.botPlayers();
    while (bots.length > desired) {
      const bot = bots.pop();
      if (!bot) break;
      this.pushRosterAudioEvent(bot, "leave", now);
      this.destroyBody(bot);
      this.players.delete(bot.id);
      this.resetBotRuntimeForReuse(bot, now);
      this.dormantBots.push(bot);
      while (this.dormantBots.length > this.settings.maxActivePlayers) this.dormantBots.shift();
    }
    while (bots.length < desired) {
      const runtime = this.dormantBots.pop();
      let botRuntime: PlayerRuntime;
      if (runtime) {
        this.resetBotRuntimeForReuse(runtime, now);
        this.botReuseCount += 1;
        botRuntime = runtime;
      } else {
        const botNumber = this.nextBotId++;
        botRuntime = this.createRuntime({
          id: `${BOT_ID_PREFIX}${botNumber}`,
          name: BOT_NAMES[(botNumber - 1) % BOT_NAMES.length],
          channel: null,
          transport: "bot"
        });
        botRuntime.botPersonality = botPersonality(botNumber);
        botRuntime.botFlank = botNumber % 2 === 0 ? 1 : -1;
      }
      this.players.set(botRuntime.id, botRuntime);
      bots.push(botRuntime);
    }
  }

  private resetBotRuntimeForReuse(bot: PlayerRuntime, now: number): void {
    bot.role = "spectator";
    bot.team = null;
    bot.index = this.players.size;
    bot.joinOrder = this.joinCounter++;
    bot.goals = 0;
    bot.clientFingerprint = null;
    bot.channel = null;
    bot.transport = "bot";
    bot.input = { ...DEFAULT_INPUT };
    bot.inputSequence = 0;
    bot.body = null;
    bot.moveAxis = { x: 0, z: 0 };
    bot.moveVelocity = zeroVec();
    bot.lastKickAt = 0;
    bot.lastHeadAt = 0;
    bot.lastKickLeft = 0;
    bot.lastKickLeftHeld = false;
    bot.leftKickChargeStartedAt = -1;
    bot.leftKickChargeHeldMs = 0;
    bot.kickLeftHoldConsumed = false;
    bot.leftKickBufferedUntil = 0;
    bot.leftKickBufferedCharge = 0;
    bot.lastKickRight = 0;
    bot.nextHandSide = 1;
    bot.lastHead = 0;
    bot.lastJump = 0;
    bot.lastBodyAt = 0;
    bot.lastJumpAt = 0;
    bot.lastAction = null;
    bot.lastActionSide = null;
    bot.lastActionAt = 0;
    bot.celebration = null;
    bot.celebrationAt = 0;
    bot.celebrationAvailableUntil = 0;
    bot.lastAudioRole = null;
    bot.yaw = 0;
    bot.velocity = zeroVec();
    bot.pushVelocity = zeroVec();
    bot.stamina = this.settings.playerStaminaMax;
    bot.staminaRecoveryBlockedUntil = 0;
    bot.sprinting = false;
    bot.exhausted = false;
    bot.ragdoll = false;
    bot.ragdollAt = 0;
    bot.ragdollVelocity = zeroVec();
    bot.grounded = true;
    bot.verticalVelocity = 0;
    bot.lastSeenAt = now;
  }

  private activeBotBodyInvalid(bot: PlayerRuntime): boolean {
    if (bot.transport !== "bot" || bot.role !== "player") return false;
    if (!bot.body) return true;
    const position = bot.body.translation();
    return !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z);
  }

  private ensureBotFill(now = Date.now()): void {
    const desired = this.desiredBotCount(now);
    const bots = this.botPlayers();
    let invalidActiveBotBody = false;
    for (const bot of bots) {
      if (!this.activeBotBodyInvalid(bot)) continue;
      invalidActiveBotBody = true;
      this.destroyBody(bot);
    }
    const activeBots = bots.filter((player) => player.role === "player");
    const bodyMismatch = bots.some((player) => (
      player.role === "player" ? !player.body : Boolean(player.body)
    ));
    if (bots.length !== desired || activeBots.length !== desired || bodyMismatch) {
      if (bodyMismatch || invalidActiveBotBody) this.botRepairCount += 1;
      this.rebalanceRoles();
    }
  }

  private pushAudioEvent(now: number, event: ServerAudioEventPayload): void {
    this.audioEvents.push({
      id: ++this.nextAudioEventId,
      serverTime: now,
      tick: this.tickCount,
      ...event
    } as ServerAudioEvent);
    this.trimAudioEvents(now);
  }

  private trimAudioEvents(now: number): void {
    const minTime = now - AUDIO_EVENT_TTL_MS;
    while (this.audioEvents.length > AUDIO_EVENT_LIMIT || (this.audioEvents[0] && this.audioEvents[0].serverTime < minTime)) {
      this.audioEvents.shift();
    }
  }

  private runtimePosition(player: PlayerRuntime): Vec3 {
    if (player.body) return vec3FromRapier(player.body.translation());
    return { x: 0, y: 3, z: this.settings.fieldLength / 2 + 4 + player.index };
  }

  private ballSpeed(): number {
    const velocity = this.ballBody.linvel();
    return Math.hypot(velocity.x, velocity.y, velocity.z);
  }

  private randomWeatherDelayMs(): number {
    const min = this.settings.weatherChangeMinMs;
    const max = Math.max(min, this.settings.weatherChangeMaxMs);
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  private randomWeatherIndex(previousIndex: number): number {
    const presets = weatherPresets();
    const weights = weatherWeights();
    const totalWeight = presets.reduce((sum, _preset, index) => (
      index === previousIndex ? sum : sum + (weights[index] || 0)
    ), 0);
    if (totalWeight <= 0) return previousIndex === 1 ? 0 : 1;
    let cursor = Math.random() * totalWeight;
    for (let index = 0; index < presets.length; index += 1) {
      if (index === previousIndex) continue;
      cursor -= weights[index] || 0;
      if (cursor <= 0) return index;
    }
    return previousIndex === 1 ? 0 : 1;
  }

  private updateWeather(now: number): void {
    if (now < this.nextWeatherChangeAt) return;
    const previousIndex = this.currentWeatherIndex;
    const presets = weatherPresets();
    const nextIndex = presets.length > 1 ? this.randomWeatherIndex(previousIndex) : previousIndex;
    this.currentWeatherIndex = nextIndex;
    this.nextWeatherChangeAt = now + this.randomWeatherDelayMs();
    this.message = `\u041f\u043e\u0433\u043e\u0434\u0430: ${presets[nextIndex]?.label || presets[0]?.label || ""}`;
  }

  private currentWeather(now = Date.now()): WeatherSnapshot {
    const presets = weatherPresets();
    const preset = presets[this.currentWeatherIndex] || presets[0];
    return {
      kind: preset.kind,
      label: preset.label,
      intensity: preset.intensity,
      wind: { ...preset.wind },
      hazards: preset.hazards.map((hazard) => ({
        id: hazard.id,
        type: hazard.type,
        position: { ...hazard.position },
        radius: hazard.radius,
        strength: hazard.strength
      })),
      nextChangeInMs: Math.max(0, this.nextWeatherChangeAt - now)
    };
  }

  private dayTimeSeconds(now: number): number {
    if (this.testDayTimeOverrideSeconds !== null) return this.testDayTimeOverrideSeconds;
    const elapsedSeconds = Math.max(0, (now - this.startedAt) / 1000);
    const dayAdvanceSeconds = elapsedSeconds / Math.max(1, this.settings.dayCycleSeconds) * 24 * 60 * 60;
    return (this.settings.dayStartSeconds + dayAdvanceSeconds) % (24 * 60 * 60);
  }

  private pushRosterAudioEvent(player: PlayerRuntime, change: "join" | "leave" | "spectator", now = Date.now()): void {
    this.pushAudioEvent(now, {
      kind: "roster",
      change,
      playerId: player.id,
      role: player.role
    });
  }

  private createTestPlayers(count: number): void {
    this.ballOwnerPlayerId = null;
    this.ballPossessionReleasedUntil = 0;
    for (const player of this.players.values()) {
      this.destroyBody(player);
    }
    this.players.clear();
    this.dormantBots.length = 0;
    this.joinCounter = 0;
    if (TEST_MODE) {
      this.testBotsEnabled = false;
      this.botSettings = this.normalizeBotSettings({ enabled: false }, this.botSettings);
    }
    for (let index = 0; index < count; index += 1) {
      const runtime = this.createRuntime({
        id: `test-player-${index + 1}`,
        name: `\u0422\u0435\u0441\u0442 ${index + 1}`,
        channel: null,
        transport: "test"
      });
      this.players.set(runtime.id, runtime);
    }
    this.rebalanceRoles();
    this.message = count > 0
      ? "\u0422\u0435\u0441\u0442\u043e\u0432\u044b\u0435 \u0438\u0433\u0440\u043e\u043a\u0438 \u0433\u043e\u0442\u043e\u0432\u044b"
      : "\u0416\u0434\u0451\u043c \u0438\u0433\u0440\u043e\u043a\u043e\u0432";
  }

  private createRuntime(options: {
    id: string;
    name: string;
    channel: TransportChannel | null;
    transport: PlayerRuntime["transport"];
    clientFingerprint?: string | null;
  }): PlayerRuntime {
    const botSeed = this.joinCounter + this.nextBotId + 1;
    const persisted = options.clientFingerprint ? this.persistedPlayers.get(options.clientFingerprint) : undefined;
    return {
      id: persisted?.id || options.id,
      name: persisted?.name || options.name,
      role: "spectator",
      team: null,
      index: this.players.size,
      joinOrder: this.joinCounter++,
      goals: persisted?.goals || 0,
      characterId: persisted?.characterId || this.nextCharacterId(),
      clientFingerprint: options.clientFingerprint || null,
      userPic: DEFAULT_USER_PICS[botSeed % DEFAULT_USER_PICS.length] || DEFAULT_USER_PICS[0] || "⚽",
      emotion: null,
      channel: options.channel,
      transport: options.transport,
      input: { ...DEFAULT_INPUT },
      inputSequence: 0,
      body: null,
      moveAxis: { x: 0, z: 0 },
      moveVelocity: zeroVec(),
      lastKickAt: 0,
      lastHeadAt: 0,
      lastKickLeft: 0,
      lastKickLeftHeld: false,
      leftKickChargeStartedAt: -1,
      leftKickChargeHeldMs: 0,
      kickLeftHoldConsumed: false,
      leftKickBufferedUntil: 0,
      leftKickBufferedCharge: 0,
      lastKickRight: 0,
      nextHandSide: 1,
      lastHead: 0,
      lastJump: 0,
      lastBodyAt: 0,
      lastJumpAt: 0,
      lastAction: null,
      lastActionSide: null,
      lastActionAt: 0,
      trailingFoot: botSeed % 2 === 0 ? "left" : "right",
      stancePhase: botSeed % 2 === 0 ? 0.25 : 0.75,
      celebration: null,
      celebrationAt: 0,
      celebrationAvailableUntil: 0,
      lastAudioRole: null,
      yaw: 0,
      velocity: zeroVec(),
      pushVelocity: zeroVec(),
      stamina: this.settings.playerStaminaMax,
      staminaRecoveryBlockedUntil: 0,
      sprinting: false,
      exhausted: false,
      ragdoll: false,
      ragdollAt: 0,
      ragdollVelocity: zeroVec(),
      grounded: true,
      verticalVelocity: 0,
      lastSeenAt: Date.now(),
      botPersonality: botPersonality(botSeed),
      botFlank: botSeed % 2 === 0 ? 1 : -1,
      botBehavior: "balanced",
      botLastKickCommandAt: 0,
      botLastHandCommandAt: 0,
      botLastHeadCommandAt: 0,
      botLastJumpCommandAt: 0
    };
  }

  private applyProfile(player: PlayerRuntime, source: Record<string, unknown>): void {
    const nameValue = source.nickname !== undefined ? source.nickname : source.name;
    if (nameValue !== undefined) player.name = sanitizePlayerName(nameValue);
    player.characterId = sanitizeSkinId(source.skinId ?? source.characterId, player.characterId);
    player.userPic = sanitizeUserPic(source.userPic ?? source.user_pic, player.userPic);
  }

  private applyEmotion(player: PlayerRuntime, emotionId: unknown, now: number): PlayerEmotionSnapshot | null {
    const choice = emotionChoiceById(emotionId);
    if (!choice) return null;
    player.emotion = {
      id: choice.id,
      emoji: choice.emoji,
      label: choice.label,
      appliedAt: now,
      expiresAt: now + EMOTION_VISIBLE_MS
    };
    player.lastSeenAt = now;
    return player.emotion;
  }

  private addChatMessage(player: PlayerRuntime, textValue: unknown, now: number): ChatMessageSnapshot | null {
    const text = sanitizeChatText(textValue);
    if (!text) return null;
    const message: ChatMessageSnapshot = {
      id: this.nextChatMessageId++,
      playerId: player.id,
      name: player.name,
      userPic: player.userPic,
      text,
      createdAt: now
    };
    this.chatMessages.push(message);
    while (this.chatMessages.length > CHAT_MESSAGE_LIMIT) this.chatMessages.shift();
    player.lastSeenAt = now;
    return message;
  }

  private resetMatch(now: number): void {
    this.score.blue = 0;
    this.score.orange = 0;
    this.goalReset = null;
    this.lastBallTouchPlayerId = null;
    this.lastBallTouchTeam = null;
    this.lastBallTouchAt = 0;
    this.ballOwnerPlayerId = null;
    this.ballPossessionReleasedUntil = 0;
    for (const session of this.persistedPlayers.values()) session.goals = 0;
    this.resetBall(now);
    this.countdownUntil = 0;
    this.lastCountdownAudioSecond = null;
    this.message = "\u0416\u0434\u0451\u043c \u0438\u0433\u0440\u043e\u043a\u043e\u0432";
    for (const player of this.players.values()) {
      player.input = { ...DEFAULT_INPUT };
      player.goals = 0;
      player.inputSequence = 0;
      player.lastKickAt = 0;
      player.lastHeadAt = 0;
      player.lastKickLeft = 0;
      player.lastKickLeftHeld = false;
      player.leftKickChargeStartedAt = -1;
      player.leftKickChargeHeldMs = 0;
      player.kickLeftHoldConsumed = false;
      player.leftKickBufferedUntil = 0;
      player.leftKickBufferedCharge = 0;
      player.lastKickRight = 0;
      player.lastHead = 0;
      player.lastJump = 0;
      player.lastBodyAt = 0;
      player.lastJumpAt = 0;
      player.botLastKickCommandAt = 0;
      player.botLastHandCommandAt = 0;
      player.botLastHeadCommandAt = 0;
      player.botLastJumpCommandAt = 0;
      player.lastAction = null;
      player.lastActionSide = null;
      player.lastActionAt = 0;
      player.trailingFoot = player.index % 2 === 0 ? "left" : "right";
      player.stancePhase = player.trailingFoot === "left" ? 0.25 : 0.75;
      player.emotion = null;
      player.celebration = null;
      player.celebrationAt = 0;
      player.celebrationAvailableUntil = 0;
      player.lastAudioRole = null;
      player.velocity = zeroVec();
      player.moveAxis = { x: 0, z: 0 };
      player.moveVelocity = zeroVec();
      player.pushVelocity = zeroVec();
      player.stamina = this.settings.playerStaminaMax;
      player.staminaRecoveryBlockedUntil = 0;
      player.sprinting = false;
      player.exhausted = false;
      player.ragdoll = false;
      player.ragdollAt = 0;
      player.ragdollVelocity = zeroVec();
      player.grounded = true;
      player.verticalVelocity = 0;
      this.persistPlayerSession(player);
    }
    this.rebalanceRoles();
  }

  private applyTestPlayerPatch(player: PlayerRuntime, body: Record<string, unknown>): void {
    if (player.body && body.position !== undefined) {
      const position = this.vecField(body.position, vec3FromRapier(player.body.translation()));
      player.body.setTranslation(position, true);
      player.body.setNextKinematicTranslation(position);
      player.moveAxis = { x: 0, z: 0 };
      player.moveVelocity = zeroVec();
    }
    if (body.velocity !== undefined) {
      const velocity = this.vecField(body.velocity, player.velocity);
      player.velocity = velocity;
      player.moveVelocity = { x: velocity.x, y: 0, z: velocity.z };
    }
    if (body.pushVelocity !== undefined) {
      player.pushVelocity = this.vecField(body.pushVelocity, player.pushVelocity);
    }
    if (body.ragdollVelocity !== undefined) {
      player.ragdollVelocity = this.vecField(body.ragdollVelocity, player.ragdollVelocity);
    }
    if (body.stamina !== undefined) {
      const stamina = Number(body.stamina);
      if (Number.isFinite(stamina)) player.stamina = clamp(stamina, 0, this.settings.playerStaminaMax);
      player.exhausted = player.stamina <= 0.01 || player.exhausted && player.stamina < this.settings.playerExhaustedRecoveryThreshold;
    }
    if (body.profile !== undefined || body.name !== undefined || body.nickname !== undefined || body.skinId !== undefined || body.userPic !== undefined) {
      this.applyProfile(player, { ...body, ...profilePatchSource(body.profile) });
    }
    if (body.trailingFoot !== undefined) {
      const side = String(body.trailingFoot) === "right" ? "right" : "left";
      player.trailingFoot = side;
      player.stancePhase = side === "left" ? 0.25 : 0.75;
    }
    if (body.stancePhase !== undefined) {
      const value = Number(body.stancePhase);
      if (Number.isFinite(value)) {
        player.stancePhase = ((value % 1) + 1) % 1;
        player.trailingFoot = Math.sin(player.stancePhase * Math.PI * 2) >= 0 ? "left" : "right";
      }
    }
    if (body.emotionId !== undefined || body.emotion !== undefined) {
      const emotionId = body.emotionId ?? profilePatchSource(body.emotion).id;
      this.applyEmotion(player, emotionId, Date.now());
    }
    if (body.ragdoll !== undefined) {
      player.ragdoll = Boolean(body.ragdoll);
      player.ragdollAt = player.ragdoll ? Date.now() : 0;
      if (!player.ragdoll) player.ragdollVelocity = zeroVec();
    }
    if (body.grounded !== undefined) {
      player.grounded = Boolean(body.grounded);
    }
    if (body.verticalVelocity !== undefined) {
      const verticalVelocity = Number(body.verticalVelocity);
      if (Number.isFinite(verticalVelocity)) player.verticalVelocity = verticalVelocity;
    }
    if (body.yaw !== undefined) {
      const yaw = Number(body.yaw);
      if (Number.isFinite(yaw)) player.yaw = yaw;
    }
    if (body.input !== undefined) {
      const patch = typeof body.input === "object" && body.input !== null ? body.input as Partial<InputState> : {};
      player.input = cloneInput({ ...player.input, ...patch });
    }
  }

  private createPhysicsWorld(): void {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(this.settings.fieldWidth / 2 + 1, 0.2, this.settings.fieldLength / 2 + 1)
        .setTranslation(0, -0.2, 0)
        .setFriction(1.2),
      ground
    );

    this.ballBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, this.settings.ballRadius + 0.04, 0)
        .setLinearDamping(0.8)
        .setAngularDamping(0.45)
        .setCanSleep(false)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(this.settings.ballRadius)
        .setRestitution(this.settings.ballRestitution)
        .setFriction(0.78)
        .setDensity(this.settings.ballDensity),
      this.ballBody
    );
  }

  private onConnection(channel: TransportChannel): void {
    const id = channel.id;
    let runtime: PlayerRuntime | null = null;

    channel.on("join", (data: unknown) => {
      const request = data as JoinRequest;
      const clientFingerprint = sanitizeClientFingerprint(request?.clientFingerprint);
      let firstJoin = false;
      if (!runtime) {
        const existingPlayer = this.playerByFingerprint(clientFingerprint);
        if (!existingPlayer && this.rawConnectedClientCount() >= MAX_ROOM_CLIENTS) {
          channel.emit("server-full", { maxRoomClients: MAX_ROOM_CLIENTS });
          channel.close();
          return;
        }
        runtime = existingPlayer || this.createRuntime({
          id,
          name: sanitizePlayerName(request?.name),
          channel,
          transport: "websocket",
          clientFingerprint
        });
        runtime.channel = channel;
        runtime.transport = "websocket";
        runtime.clientFingerprint = clientFingerprint;
        runtime.lastSeenAt = Date.now();
        this.applyProfile(runtime, { ...profilePatchSource(request), ...profilePatchSource(request?.profile) });
        this.persistPlayerSession(runtime);
        if (!existingPlayer) this.players.set(runtime.id, runtime);
        this.rebalanceRoles();
        firstJoin = true;
      }
      this.applyProfile(runtime, { ...profilePatchSource(request), ...profilePatchSource(request?.profile) });
      this.persistPlayerSession(runtime);
      if (!firstJoin) this.sendJoin(runtime);
      this.message = `${runtime.name} \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u043b\u0441\u044f ${runtime.role === "player" ? "\u043a \u043f\u043e\u043b\u044e" : "\u043a\u0430\u043a \u043d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u0435\u043b\u044c"}`;
    });

    channel.on("input", (data: unknown) => {
      if (!runtime) return;
      if (runtime.channel !== channel) return;
      const message = data as ClientInputMessage;
      if (!message || typeof message.sequence !== "number") return;
      if (message.sequence < runtime.inputSequence) return;
      runtime.input = cloneInput(message.input || DEFAULT_INPUT);
      runtime.inputSequence = message.sequence;
      runtime.lastSeenAt = Date.now();
    });

    channel.on("chat", (data: unknown) => {
      if (!runtime) return;
      if (runtime.channel !== channel) return;
      const body = profilePatchSource(data);
      runtime.lastSeenAt = Date.now();
      this.addChatMessage(runtime, body.text, Date.now());
    });

    channel.on("emotion", (data: unknown) => {
      if (!runtime) return;
      if (runtime.channel !== channel) return;
      const body = profilePatchSource(data);
      runtime.lastSeenAt = Date.now();
      this.applyEmotion(runtime, body.emotionId || body.id, Date.now());
    });

    channel.on("profile", (data: unknown) => {
      if (!runtime) return;
      if (runtime.channel !== channel) return;
      const body = profilePatchSource(data);
      this.applyProfile(runtime, { ...body, ...profilePatchSource(body.profile) });
      this.persistPlayerSession(runtime);
      runtime.lastSeenAt = Date.now();
      this.message = `${runtime.name} \u043e\u0431\u043d\u043e\u0432\u0438\u043b \u043f\u0440\u043e\u0444\u0438\u043b\u044c`;
      this.sendJoin(runtime);
    });

    channel.onDisconnect(() => {
      if (!runtime) return;
      if (runtime.channel !== channel) return;
      this.persistPlayerSession(runtime);
      this.pushRosterAudioEvent(runtime, "leave");
      this.destroyBody(runtime);
      this.players.delete(runtime.id);
      this.rebalanceRoles();
      this.message = `${runtime.name} \u0432\u044b\u0448\u0435\u043b`;
    });
  }

  private rebalanceRoles(): void {
    const now = Date.now();
    this.removeStaleClientPlayers(now);
    this.syncBots(now);
    const ordered = [...this.players.values()].sort((a, b) => {
      const controllerOrder = Number(a.transport === "bot") - Number(b.transport === "bot");
      return controllerOrder || a.joinOrder - b.joinOrder;
    });
    ordered.forEach((player, orderIndex) => {
      const previousRole = player.lastAudioRole;
      const active = orderIndex < this.settings.maxActivePlayers;
      player.role = active ? "player" : "spectator";
      player.index = orderIndex;
      player.team = active ? ((orderIndex % 2) as TeamId) : null;
      if (active) {
        const teamSlot = Math.floor(orderIndex / 2);
        player.botFlank = teamSlot % 2 === 0 ? -1 : 1;
        if (player.transport === "bot") {
          const secondEnforcer = this.botSettings.aggression >= 0.72 && teamSlot === 3;
          player.botBehavior = this.botSettings.aggression >= 0.35 && (teamSlot === 1 || secondEnforcer)
            ? "enforcer"
            : "balanced";
        }
      } else if (player.transport === "bot") {
        player.botBehavior = "balanced";
      }
      if (active && !player.body) this.createBody(player);
      if (!active && player.body) this.destroyBody(player);
      if (previousRole !== player.role) {
        this.pushRosterAudioEvent(player, player.role === "spectator" ? "spectator" : "join", now);
        player.lastAudioRole = player.role;
      }
      this.sendJoin(player);
    });
  }

  private createBody(player: PlayerRuntime): void {
    const spawn = this.spawnForIndex(player.index);
    player.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setCanSleep(false)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.capsule(
        (this.settings.playerHeight - this.settings.playerRadius * 2) / 2,
        this.settings.playerRadius
      )
        .setFriction(1.1)
        .setRestitution(0.05)
        .setSensor(true),
      player.body
    );
  }

  private destroyBody(player: PlayerRuntime): void {
    if (!player.body) return;
    if (this.ballOwnerPlayerId === player.id) this.dropBallOwner(Date.now());
    this.world.removeRigidBody(player.body);
    player.body = null;
  }

  private sendJoin(player: PlayerRuntime): void {
    const channel = player.channel;
    if (!channel) return;
    channel.emit("joined", this.joinPayload(player));
  }

  private joinPayload(player: PlayerRuntime): JoinAccepted {
    return {
      id: player.id,
      role: player.role,
      team: player.team,
      index: player.index,
      goals: player.goals,
      characterId: player.characterId,
      profile: profileFromPlayer(player),
      version: GAME_VERSION,
      maxActivePlayers: this.settings.maxActivePlayers,
      maxRoomClients: MAX_ROOM_CLIENTS
    };
  }

  private spawnForIndex(index: number): Vec3 {
    const team = index % 2;
    const row = Math.floor(index / 2);
    const laneOffsets = [-7.2, -3.6, 0, 3.6, 7.2];
    return {
      x: laneOffsets[row % laneOffsets.length] ?? 0,
      y: this.settings.playerHeight / 2,
      z: team === 0 ? -this.settings.fieldLength * 0.24 : this.settings.fieldLength * 0.24
    };
  }

  private updateBotInputs(now: number): void {
    const activePlayers = [...this.players.values()].filter((player) => (
      player.role === "player" && Boolean(player.body)
    ));
    if (!activePlayers.length) return;
    const ballPosition = vec3FromRapier(this.ballBody.translation());
    const ballVelocity = vec3FromRapier(this.ballBody.linvel());
    for (const bot of activePlayers) {
      if (bot.transport !== "bot") continue;
      bot.input = this.botInput(bot, activePlayers, ballPosition, ballVelocity, now);
      bot.inputSequence += 1;
      bot.lastSeenAt = now;
    }
  }

  private botInput(
    bot: PlayerRuntime,
    activePlayers: PlayerRuntime[],
    ballPosition: Vec3,
    ballVelocity: Vec3,
    now: number
  ): InputState {
    const input = cloneInput({ ...DEFAULT_INPUT });
    const botPosition = this.runtimePosition(bot);
    const attackDirection = bot.team === 1 ? -1 : 1;
    const goalAim = this.botGoalAim(ballPosition, attackDirection);
    const nearestOpponent = this.nearestOpponent(bot, activePlayers);
    const opponentPosition = nearestOpponent ? this.runtimePosition(nearestOpponent) : null;
    const opponentDistance = opponentPosition ? distance2d(botPosition, opponentPosition) : Infinity;
    const ballDistance = distance2d(botPosition, ballPosition);
    const ballIsHigh = ballPosition.y > this.settings.playerHeight * 0.62 || ballVelocity.y > 1.4;
    const fightWeight = clamp(this.botSettings.aggression + (bot.botPersonality - 0.5) * 0.3, 0, 1);
    const ballOrder = activePlayers
      .filter((player) => player.body)
      .map((player) => ({
        player,
        distance: distance2d(this.runtimePosition(player), ballPosition)
      }))
      .sort((a, b) => a.distance - b.distance || a.player.index - b.player.index);
    const closestBallEntry = ballOrder[0] || null;
    const ballLoose = !closestBallEntry || closestBallEntry.distance > this.botSettings.chaseDistance;
    const ballInOwnDanger = ballPosition.z * attackDirection < -this.settings.fieldLength * 0.36;
    const neutralAttackTeam = ((this.score.blue + this.score.orange) % 2) as TeamId;
    const ballInNeutralLane = Math.abs(ballPosition.z) <= this.settings.fieldLength * 0.075;
    const ballOnAttackSide = ballInNeutralLane
      ? bot.team === neutralAttackTeam
      : ballPosition.z * attackDirection > 0;
    const teamCanContestBall = ballLoose || ballOnAttackSide || ballInOwnDanger;
    const teammateBallRank = activePlayers
      .filter((player) => player.team === bot.team && player.body)
      .map((player) => ({
        player,
        distance: distance2d(this.runtimePosition(player), ballPosition)
      }))
      .sort((a, b) => a.distance - b.distance || a.player.index - b.player.index)
      .findIndex((entry) => entry.player.id === bot.id);
    const isPrimaryBallBot = teammateBallRank <= 0 && teamCanContestBall;
    const canAct = !bot.exhausted && !bot.ragdoll;
    const canFight = canAct;
    const canStrike = canAct;
    const disabledPlayerCount = activePlayers.filter((player) => player.ragdoll || player.exhausted).length;
    const collapseGuardLimit = Math.max(
      this.settings.botCombatCollapseGuardMinDisabled,
      Math.floor(activePlayers.length * this.settings.botCombatCollapseGuardRatio)
    );
    const collapseGuardActive = disabledPlayerCount >= collapseGuardLimit;
    const nearestOpponentExhausted = nearestOpponent?.exhausted === true;
    const canFinishExhaustedOpponent = nearestOpponentExhausted && fightWeight >= 0.8;
    const botCombatPressureAllowed = this.botSettings.aggression >= this.settings.botCombatAggressionThreshold || canFinishExhaustedOpponent;
    const opponentBetweenBotAndBall = opponentPosition !== null
      && ballDistance > 0.35
      && opponentDistance < ballDistance
      && (((opponentPosition.x - botPosition.x) / Math.max(opponentDistance, 0.001)) * ((ballPosition.x - botPosition.x) / ballDistance)
        + ((opponentPosition.z - botPosition.z) / Math.max(opponentDistance, 0.001)) * ((ballPosition.z - botPosition.z) / ballDistance)) > 0.62;
    const opponentBallDistance = opponentPosition ? distance2d(opponentPosition, ballPosition) : Infinity;
    const canPressureOpponent = nearestOpponent !== null
      && opponentPosition !== null
      && !isPrimaryBallBot
      && canFight
      && botCombatPressureAllowed
      && (!collapseGuardActive || canFinishExhaustedOpponent)
      && !nearestOpponent.ragdoll
      && (!nearestOpponent.exhausted || canFinishExhaustedOpponent)
      && teammateBallRank >= 1;
    const standardSupportCanPressure = canPressureOpponent
      && teammateBallRank <= 2 + Math.round(fightWeight * 2)
      && opponentBallDistance <= this.botSettings.chaseDistance + this.botSettings.supportReleaseDistance * 0.5
      && opponentDistance <= this.botSettings.fightDistance + this.botSettings.supportReleaseDistance + 0.9
      && ballDistance > this.settings.footKickAssistRange;
    const enforcerPressDistance = this.botSettings.fightDistance + this.botSettings.supportReleaseDistance + 2.6 + fightWeight * 1.2;
    const enforcerCanPressure = canPressureOpponent
      && bot.botBehavior === "enforcer"
      && !collapseGuardActive
      && fightWeight >= 0.45
      && opponentDistance <= enforcerPressDistance
      && ballDistance > this.settings.footKickAssistRange * 0.75;
    const supportCanPressure = standardSupportCanPressure || enforcerCanPressure;
    const shouldFight = nearestOpponent !== null
      && opponentPosition !== null
      && canFight
      && botCombatPressureAllowed
      && (!collapseGuardActive || canFinishExhaustedOpponent)
      && !nearestOpponent.ragdoll
      && (!nearestOpponent.exhausted || canFinishExhaustedOpponent)
      && opponentDistance <= this.botSettings.fightDistance
      && (
        isPrimaryBallBot
          ? ballDistance > this.botSettings.shootDistance * 0.8
            && (opponentBetweenBotAndBall || fightWeight >= 0.82)
          : supportCanPressure
      );

    let target: Vec3;
    let yawTarget: Vec3;
    if (shouldFight && opponentPosition) {
      target = opponentDistance > 1.05 ? opponentPosition : botPosition;
      yawTarget = opponentPosition;
      const headFightReady = opponentDistance <= Math.min(this.botSettings.fightDistance, this.settings.headKickAssistRange + 0.45)
        && now - bot.botLastHeadCommandAt >= this.botSettings.headIntervalMs
        && (ballIsHigh || Math.sin(now * 0.006 + bot.botPersonality * 17) > 0.35);
      if (headFightReady) {
        input.head = bot.lastHead + 1;
        bot.botLastHeadCommandAt = now;
      } else if (now - bot.botLastHandCommandAt >= this.botSettings.handIntervalMs) {
        input.kickRight = bot.lastKickRight + 1;
        bot.botLastHandCommandAt = now;
      } else if (ballIsHigh && now - bot.botLastHeadCommandAt >= this.botSettings.headIntervalMs) {
        input.head = bot.lastHead + 1;
        bot.botLastHeadCommandAt = now;
      } else if (now - bot.botLastKickCommandAt >= this.botSettings.kickIntervalMs * 1.6) {
        input.kickLeft = bot.lastKickLeft + 1;
        bot.botLastKickCommandAt = now;
      }
    } else {
      const botToBall = {
        x: ballPosition.x - botPosition.x,
        y: 0,
        z: ballPosition.z - botPosition.z
      };
      const botToBallMagnitude = Math.hypot(botToBall.x, botToBall.z);
      const ballAheadForShot = botToBallMagnitude > 0.001
        ? (botToBall.x / botToBallMagnitude) * goalAim.x + (botToBall.z / botToBallMagnitude) * goalAim.z
        : 1;
      const behindDistance = this.settings.playerRadius + this.settings.ballRadius + 0.72;
      const teamSlot = Math.floor(bot.index / 2);
      const supportBand = Math.floor(teamSlot / 2);
      const supportRank = Math.max(1, teammateBallRank);
      const supportWidth = 3.4
        + supportBand * 1.75
        + Math.min(supportRank, 4) * 0.35
        + bot.botPersonality * 0.7;
      const supportDepth = 3.6
        + this.botSettings.supportReleaseDistance * 0.45
        + Math.min(supportRank, 4) * 1.2
        + supportBand * 0.9
        + bot.botPersonality * 0.75;
      const flank = bot.botFlank * (0.16 + bot.botPersonality * 0.26);
      const behindPoint = {
        x: clamp(ballPosition.x - goalAim.x * behindDistance + goalAim.z * flank, -this.settings.fieldWidth / 2 + 1.2, this.settings.fieldWidth / 2 - 1.2),
        y: botPosition.y,
        z: clamp(ballPosition.z - goalAim.z * behindDistance - goalAim.x * flank, -this.settings.fieldLength / 2 - this.settings.goalDepth + 1.2, this.settings.fieldLength / 2 + this.settings.goalDepth - 1.2)
      };
      const supportPoint = {
        x: clamp(
          ballPosition.x + bot.botFlank * supportWidth,
          -this.settings.fieldWidth / 2 + 1.2,
          this.settings.fieldWidth / 2 - 1.2
        ),
        y: botPosition.y,
        z: clamp(
          ballPosition.z - attackDirection * supportDepth,
          -this.settings.fieldLength / 2 - this.settings.goalDepth + 1.2,
          this.settings.fieldLength / 2 + this.settings.goalDepth - 1.2
        )
      };
      const behindPointDistance = distance2d(botPosition, behindPoint);
      const closeEnoughToShoot = isPrimaryBallBot
        && ballDistance <= this.botSettings.shootDistance
        && (ballAheadForShot >= this.botSettings.shotAlignmentMin || behindPointDistance <= 0.95);
      const kickReady = now - Math.max(bot.botLastKickCommandAt, bot.lastKickAt) >= this.botSettings.kickIntervalMs;
      const isChargingLeftKick = bot.leftKickChargeStartedAt >= 0 && !bot.kickLeftHoldConsumed;
      const shouldHoldChargedShot = canStrike
        && isPrimaryBallBot
        && closeEnoughToShoot
        && ballAheadForShot >= this.botSettings.shotAlignmentMin
        && (isChargingLeftKick || (kickReady && ballDistance >= this.settings.footKickAssistRange + 0.55));
      target = supportCanPressure && opponentPosition
        ? opponentPosition
        : !isPrimaryBallBot
        ? supportPoint
        : closeEnoughToShoot
        ? {
            x: ballPosition.x + goalAim.x * 0.85,
            y: botPosition.y,
            z: ballPosition.z + goalAim.z * 0.85
          }
        : behindPoint;
      yawTarget = supportCanPressure && opponentPosition ? opponentPosition : !isPrimaryBallBot ? ballPosition : closeEnoughToShoot ? {
        x: botPosition.x + goalAim.x,
        y: botPosition.y,
        z: botPosition.z + goalAim.z
      } : ballPosition;

      if (shouldHoldChargedShot) {
        input.kickLeftHeld = true;
        if (!isChargingLeftKick) bot.botLastKickCommandAt = now;
      }

      if (canStrike && closeEnoughToShoot && !input.kickLeftHeld && kickReady) {
        input.kickLeft = bot.lastKickLeft + 1;
        bot.botLastKickCommandAt = now;
      }
      if (canStrike && isPrimaryBallBot && ballIsHigh && ballDistance <= this.settings.headKickAssistRange + 0.5 && now - bot.botLastHeadCommandAt >= this.botSettings.headIntervalMs) {
        input.head = bot.lastHead + 1;
        bot.botLastHeadCommandAt = now;
      }
    }

    const move = this.botMovementInput(bot, botPosition, target);
    input.up = move.up;
    input.down = move.down;
    input.left = move.left;
    input.right = move.right;
    input.sprint = (isPrimaryBallBot || enforcerCanPressure)
      && bot.stamina >= this.settings.playerStaminaMax * 0.52
      && !bot.exhausted
      && !bot.ragdoll
      && (
        distance2d(botPosition, target) >= this.botSettings.sprintDistance
        || (enforcerCanPressure && opponentDistance > this.botSettings.fightDistance)
        || (isPrimaryBallBot && ballDistance <= this.botSettings.chaseDistance && Math.abs(ballPosition.z) > this.settings.fieldLength * 0.28)
      );
    input.yaw = this.yawTowards(botPosition, yawTarget, attackDirection);
    if (
      ballIsHigh
      && canStrike
      && isPrimaryBallBot
      && ballDistance <= 2.1
      && now - bot.botLastJumpCommandAt >= this.settings.playerJumpCooldownMs * 1.6
      && Math.sin(now * 0.009 + bot.botPersonality * 12) > 1 - this.botSettings.jumpChance * 2
    ) {
      input.jump = bot.lastJump + 1;
      bot.botLastJumpCommandAt = now;
    }
    return input;
  }

  private botMovementInput(
    bot: PlayerRuntime,
    from: Vec3,
    target: Vec3
  ): Pick<InputState, "up" | "down" | "left" | "right"> {
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.18) return { up: false, down: false, left: false, right: false };
    const nx = dx / distance;
    const nz = dz / distance;
    const attackDirection = bot.team === 1 ? -1 : 1;
    const forwardAxis = nz * attackDirection;
    return {
      up: forwardAxis > 0.22,
      down: forwardAxis < -0.22,
      left: nx < -0.22,
      right: nx > 0.22
    };
  }

  private botGoalAim(ballPosition: Vec3, attackDirection: -1 | 1): { x: number; z: number } {
    const targetX = clamp(-ballPosition.x * 0.12, -this.settings.goalWidth / 2 + 1, this.settings.goalWidth / 2 - 1);
    const targetZ = attackDirection * (this.settings.fieldLength / 2 + this.settings.ballRadius);
    const dx = targetX - ballPosition.x;
    const dz = targetZ - ballPosition.z;
    const magnitude = Math.hypot(dx, dz) || 1;
    return { x: dx / magnitude, z: dz / magnitude };
  }

  private yawTowards(from: Vec3, target: Vec3, fallbackDirection: -1 | 1): number {
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    if (Math.hypot(dx, dz) < 0.001) return fallbackDirection > 0 ? 0 : Math.PI;
    return Math.atan2(dx, dz);
  }

  private nearestOpponent(bot: PlayerRuntime, activePlayers: PlayerRuntime[]): PlayerRuntime | null {
    let best: PlayerRuntime | null = null;
    let bestDistance = Infinity;
    const origin = this.runtimePosition(bot);
    for (const candidate of activePlayers) {
      if (candidate.id === bot.id || candidate.team === bot.team || !candidate.body) continue;
      if (candidate.ragdoll) continue;
      const distance = distance2d(origin, this.runtimePosition(candidate));
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  private tick(now = Date.now(), emitSnapshot = true): void {
    const dt = 1 / SERVER_TICK_RATE;
    this.tickCount += 1;
    this.cleanupStaleClientPlayers(now);
    this.ensureBotFill(now);
    this.updateWeather(now);
    this.updateBotInputs(now);

    const previousPlayerPositions = new Map<string, Vec3>();
    for (const player of this.players.values()) {
      if (player.body) previousPlayerPositions.set(player.id, vec3FromRapier(player.body.translation()));
    }

    for (const player of this.players.values()) {
      this.updatePlayer(player, dt, now);
    }
    this.syncBallToOwner(now);

    const previousBallTranslation = this.ballBody.translation();
    const previousBallPosition = {
      x: previousBallTranslation.x,
      y: previousBallTranslation.y,
      z: previousBallTranslation.z
    };
    this.world.timestep = dt;
    this.world.step();
    const ownerBeforePostStepSync = this.ballOwnerPlayerId;
    if (this.syncBallToOwner(now)) {
      this.resolvePlayerBallCollision(previousBallPosition, now, previousPlayerPositions, {
        skipPlayerId: ownerBeforePostStepSync,
        dropOwnerOnHit: true
      });
      this.containBall();
    } else {
      this.resolvePlayerBallCollision(previousBallPosition, now, previousPlayerPositions);
      this.containBall();
    }
    const goalResetActive = this.updateGoalReset(now);
    if (!goalResetActive) this.checkGoal(previousBallPosition, now);
    this.emitCountdownAudio(now);

    if (emitSnapshot && now - this.lastSnapshotAt >= 1000 / SNAPSHOT_RATE) {
      this.lastSnapshotAt = now;
      this.broadcast("state", this.snapshot(now));
    }
  }

  private broadcast(eventName: string, data: unknown): void {
    for (const player of this.players.values()) {
      if (player.transport === "websocket") player.channel?.emit(eventName, data);
    }
  }

  private cleanupStaleClientPlayers(now: number): void {
    const changed = this.removeStaleClientPlayers(now);
    if (changed) {
      this.rebalanceRoles();
      this.message = "Игрок вышел";
    }
  }

  private removeStaleClientPlayers(now: number): boolean {
    let changed = false;
    for (const player of this.players.values()) {
      if (player.transport !== "http" && player.transport !== "websocket") continue;
      if (!this.isStaleClientPlayer(player, now)) continue;
      const staleChannel = player.channel;
      player.channel = null;
      this.persistPlayerSession(player);
      this.pushRosterAudioEvent(player, "leave", now);
      this.destroyBody(player);
      this.players.delete(player.id);
      staleChannel?.close();
      changed = true;
    }
    return changed;
  }

  private nextCharacterId(): string {
    if (this.characterDeck.length === 0) {
      this.characterDeck = [...CHARACTER_ROSTER];
      for (let index = this.characterDeck.length - 1; index > 0; index -= 1) {
        const swapIndex = crypto.randomInt(index + 1);
        const value = this.characterDeck[index] || CHARACTER_ROSTER[0];
        const swapValue = this.characterDeck[swapIndex] || CHARACTER_ROSTER[0];
        this.characterDeck[index] = swapValue;
        this.characterDeck[swapIndex] = value;
      }
    }
    return this.characterDeck.pop() || CHARACTER_ROSTER[0];
  }

  private beginRagdoll(player: PlayerRuntime, now: number, impulse: Vec3 = zeroVec()): void {
    if (!player.body) return;
    if (this.ballOwnerPlayerId === player.id) this.dropBallOwner(now);
    const carry = player.ragdoll
      ? player.ragdollVelocity
      : {
          x: player.velocity.x + player.pushVelocity.x,
          y: Math.max(player.velocity.y, player.verticalVelocity, 0),
          z: player.velocity.z + player.pushVelocity.z
        };
    player.ragdoll = true;
    if (player.ragdollAt <= 0) player.ragdollAt = now;
    player.exhausted = true;
    player.sprinting = false;
    player.stamina = Math.max(0, player.stamina);
    player.ragdollVelocity = {
      x: carry.x + impulse.x,
      y: Math.max(carry.y, 0) + impulse.y,
      z: carry.z + impulse.z
    };
    player.verticalVelocity = player.ragdollVelocity.y;
    if (player.verticalVelocity > 0.05) player.grounded = false;
    player.moveVelocity = zeroVec();
    player.pushVelocity = zeroVec();
  }

  private updateRagdollPlayer(player: PlayerRuntime, dt: number, now: number): void {
    if (!player.body) return;
    const current = player.body.translation();
    const groundY = this.settings.playerHeight / 2;

    if (now >= player.staminaRecoveryBlockedUntil) {
      player.stamina = Math.min(this.settings.playerStaminaMax, player.stamina + this.settings.playerStaminaRecoveryPerSecond * dt);
    }

    player.ragdollVelocity.y -= this.settings.playerGravity * dt;
    let y = current.y + player.ragdollVelocity.y * dt;
    if (y <= groundY) {
      y = groundY;
      player.grounded = true;
      player.ragdollVelocity.y = 0;
      player.verticalVelocity = 0;
    } else {
      player.grounded = false;
      player.verticalVelocity = player.ragdollVelocity.y;
    }

    const next = this.resolvePlayerHazards({
      x: current.x + player.ragdollVelocity.x * dt,
      y,
      z: current.z + player.ragdollVelocity.z * dt
    });
    player.velocity = {
      x: (next.x - current.x) / dt,
      y: (next.y - current.y) / dt,
      z: (next.z - current.z) / dt
    };

    const horizontalSpeed = Math.hypot(player.ragdollVelocity.x, player.ragdollVelocity.z);
    if (horizontalSpeed > 0.15) player.yaw = Math.atan2(player.ragdollVelocity.x, player.ragdollVelocity.z);
    const decay = Math.exp(-dt * this.settings.playerRagdollFrictionPerSecond);
    player.ragdollVelocity.x *= decay;
    player.ragdollVelocity.z *= decay;
    if (Math.abs(player.ragdollVelocity.x) < 0.025) player.ragdollVelocity.x = 0;
    if (Math.abs(player.ragdollVelocity.z) < 0.025) player.ragdollVelocity.z = 0;

    player.body.setNextKinematicTranslation(next);
    if (
      player.grounded &&
      now - player.ragdollAt >= this.settings.playerRagdollMinMs &&
      player.stamina >= this.settings.playerExhaustedRecoveryThreshold &&
      horizontalSpeed < 1.25
    ) {
      player.ragdoll = false;
      player.ragdollAt = 0;
      player.ragdollVelocity = zeroVec();
      player.exhausted = false;
      player.moveVelocity = zeroVec();
      player.pushVelocity = zeroVec();
    }
  }

  private updatePlayer(player: PlayerRuntime, dt: number, now: number): void {
    if (!player.body) return;
    const current = player.body.translation();
    const groundY = this.settings.playerHeight / 2;
    if (player.ragdoll) {
      this.updateRagdollPlayer(player, dt, now);
      return;
    }
    const currentPoint = { x: current.x, y: current.y, z: current.z };
    const environment = this.environmentAt(currentPoint);
    const rawMovement = movementAxes(player.input, player.team);
    player.moveAxis.x = approachMovementAxis(player.moveAxis.x, rawMovement.x, dt);
    player.moveAxis.z = approachMovementAxis(player.moveAxis.z, rawMovement.z, dt);
    const movement = normalizeMovementAxis(player.moveAxis.x, player.moveAxis.z);
    const rawMoving = rawMovement.magnitude > 0.05;
    const controlledMoving = movement.magnitude > 0.05 || Math.hypot(player.moveVelocity.x, player.moveVelocity.z) > 0.05;
    const canSprint = rawMoving && player.input.sprint && !player.exhausted && player.stamina > 0.01;
    player.sprinting = canSprint;

    if (canSprint) {
      player.stamina = Math.max(0, player.stamina - this.settings.playerStaminaSprintDrainPerSecond * dt);
      player.staminaRecoveryBlockedUntil = now + this.settings.playerStaminaRecoveryDelayMs;
      if (player.stamina <= 0.01) {
        player.exhausted = true;
        player.sprinting = false;
      }
    } else if (now >= player.staminaRecoveryBlockedUntil) {
      player.stamina = Math.min(this.settings.playerStaminaMax, player.stamina + this.settings.playerStaminaRecoveryPerSecond * dt);
      if (player.exhausted && player.stamina >= this.settings.playerExhaustedRecoveryThreshold) player.exhausted = false;
    }
    if (player.ragdoll) {
      this.updateRagdollPlayer(player, dt, now);
      return;
    }

    if (player.input.jump > player.lastJump) {
      player.lastJump = player.input.jump;
      this.tryJump(player, now);
    }

    if (!player.grounded || player.verticalVelocity > 0) {
      player.verticalVelocity -= this.settings.playerGravity * dt;
    }
    let y = current.y + player.verticalVelocity * dt;
    if (y <= groundY) {
      y = groundY;
      player.verticalVelocity = 0;
      player.grounded = true;
    } else {
      player.grounded = false;
    }

    const staminaSpeed = player.exhausted ? this.settings.playerExhaustedSpeedMultiplier : canSprint ? this.settings.playerSprintMultiplier : 1;
    const airSpeed = player.grounded ? 1 : this.settings.playerAirControlMultiplier;
    const weatherSpeed = this.settings.playerSpeed * staminaSpeed * airSpeed * environment.playerSpeedMultiplier;
    const desiredMoveVelocity = {
      x: movement.x * weatherSpeed * movement.magnitude,
      y: 0,
      z: movement.z * weatherSpeed * movement.magnitude
    };
    const desiredMoveSpeed = Math.hypot(desiredMoveVelocity.x, desiredMoveVelocity.z);
    const currentMoveSpeed = Math.hypot(player.moveVelocity.x, player.moveVelocity.z);
    const velocityDot = currentMoveSpeed > 0.001 && desiredMoveSpeed > 0.001
      ? (player.moveVelocity.x * desiredMoveVelocity.x + player.moveVelocity.z * desiredMoveVelocity.z) / (currentMoveSpeed * desiredMoveSpeed)
      : 1;
    const movementRate = desiredMoveSpeed < currentMoveSpeed - 0.01
      ? this.settings.playerMovementDeceleration
      : velocityDot < -0.05
        ? this.settings.playerMovementTurnAcceleration
        : this.settings.playerMovementAcceleration;
    player.moveVelocity.x = approachScalar(player.moveVelocity.x, desiredMoveVelocity.x, movementRate, dt);
    player.moveVelocity.z = approachScalar(player.moveVelocity.z, desiredMoveVelocity.z, movementRate, dt);
    if (desiredMoveSpeed <= 0.001 && Math.abs(player.moveVelocity.x) < 0.001) player.moveVelocity.x = 0;
    if (desiredMoveSpeed <= 0.001 && Math.abs(player.moveVelocity.z) < 0.001) player.moveVelocity.z = 0;
    player.pushVelocity.x *= Math.exp(-dt * 4.2);
    player.pushVelocity.z *= Math.exp(-dt * 4.2);
    const next = {
      x: current.x + (player.moveVelocity.x + player.pushVelocity.x) * dt,
      y,
      z: current.z + (player.moveVelocity.z + player.pushVelocity.z) * dt
    };
    const resolvedNext = this.resolvePlayerHazards(next);

    player.velocity = {
      x: (resolvedNext.x - current.x) / dt,
      y: (resolvedNext.y - current.y) / dt,
      z: (resolvedNext.z - current.z) / dt
    };
    this.updateStance(player, dt);
    if (controlledMoving) player.yaw = Math.atan2(player.moveVelocity.x, player.moveVelocity.z);
    else player.yaw = player.input.yaw;

    player.body.setNextKinematicTranslation(resolvedNext);
    if (!this.tryCaptureBall(player, now, resolvedNext)) this.processBodyContact(player, now, resolvedNext);
    this.processKick(player, now, dt, resolvedNext);
  }

  private tryJump(player: PlayerRuntime, now: number): void {
    if (!player.body || !player.grounded) return;
    if (player.ragdoll) return;
    if (player.exhausted) return;
    if (now - player.lastJumpAt < this.settings.playerJumpCooldownMs) return;
    player.lastJumpAt = now;
    player.verticalVelocity = this.settings.playerJumpStrength;
    player.grounded = false;
    player.lastAction = "jump";
    player.lastActionSide = null;
    player.lastActionAt = now;
    this.pushAudioEvent(now, {
      kind: "kick",
      kick: "jump",
      playerId: player.id,
      position: this.runtimePosition(player),
      speed: this.settings.playerJumpStrength
    });
  }

  private updateStance(player: PlayerRuntime, dt: number): void {
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    if (speed > STANCE_MIN_SPEED && player.grounded) {
      const normalizedSpeed = clamp(speed / Math.max(1, this.settings.playerSpeed * this.settings.playerSprintMultiplier), 0, 1);
      player.stancePhase = (player.stancePhase + dt * (0.95 + normalizedSpeed * 1.35)) % 1;
    }
    player.trailingFoot = Math.sin(player.stancePhase * Math.PI * 2) >= 0 ? "left" : "right";
  }

  private environmentAt(point: Vec3): { playerSpeedMultiplier: number; ballDrag: number } {
    let playerSpeedMultiplier = 1;
    let ballDrag = 0.997;
    for (const hazard of this.currentWeather().hazards) {
      if (hazard.type === "snowbank") continue;
      const distance = distance2d(point, hazard.position);
      if (distance > hazard.radius) continue;
      const falloff = 1 - distance / hazard.radius;
      if (hazard.type === "puddle") {
        playerSpeedMultiplier *= 1 - hazard.strength * 0.34 * falloff;
        ballDrag *= 1 - hazard.strength * 0.11 * falloff;
      } else if (hazard.type === "slush") {
        playerSpeedMultiplier *= 1 - hazard.strength * 0.48 * falloff;
        ballDrag *= 1 - hazard.strength * 0.18 * falloff;
      }
    }
    return {
      playerSpeedMultiplier: clamp(playerSpeedMultiplier, 0.42, 1),
      ballDrag: clamp(ballDrag, 0.82, 0.997)
    };
  }

  private resolvePlayerHazards(next: Vec3): Vec3 {
    const resolved = { ...next };
    for (const hazard of this.currentWeather().hazards) {
      if (hazard.type !== "snowbank") continue;
      const dx = resolved.x - hazard.position.x;
      const dz = resolved.z - hazard.position.z;
      const distance = Math.hypot(dx, dz);
      const safeRadius = hazard.radius + this.settings.playerRadius * 0.84;
      if (distance >= safeRadius) continue;
      const nx = distance > 0.001 ? dx / distance : 1;
      const nz = distance > 0.001 ? dz / distance : 0;
      resolved.x = hazard.position.x + nx * safeRadius;
      resolved.z = hazard.position.z + nz * safeRadius;
    }
    return resolved;
  }

  private processBodyContact(player: PlayerRuntime, now: number, nextPosition?: Vec3): void {
    if (!player.body) return;
    if (this.goalReset) return;
    if (this.ballOwnerPlayerId === player.id) return;
    if (this.hasPendingActiveStrike(player, now)) return;
    if (this.hasRecentActiveStrike(player, now)) return;
    if (now - player.lastBodyAt < this.settings.bodyBumpCooldownMs) return;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    if (speed < this.settings.bodyBumpMinSpeed) return;

    const playerPosition = nextPosition || vec3FromRapier(player.body.translation());
    const ballPosition = this.ballBody.translation();
    const dx = ballPosition.x - playerPosition.x;
    const dz = ballPosition.z - playerPosition.z;
    const distance = Math.hypot(dx, dz);
    if (distance > this.settings.bodyBumpRange + this.settings.ballRadius || distance < 0.001) return;
    if (!ballOverlapsPlayerBodyHeight(playerPosition, vec3FromRapier(ballPosition))) return;

    const directionX = distance > 0.01 ? dx / distance : Math.sin(player.yaw);
    const directionZ = distance > 0.01 ? dz / distance : Math.cos(player.yaw);
    const approachSpeed = player.velocity.x * directionX + player.velocity.z * directionZ;
    if (approachSpeed < this.settings.bodyBumpMinSpeed * 0.62) return;

    const strength = this.settings.bodyBumpStrength + Math.min(0.45, approachSpeed * 0.055);
    this.ballBody.applyImpulse(
      {
        x: directionX * strength + player.velocity.x * 0.025,
        y: 0.04,
        z: directionZ * strength + player.velocity.z * 0.025
      },
      true
    );
    this.recordBallTouch(player, now);
    player.lastBodyAt = now;
    player.lastAction = "body";
    player.lastActionSide = null;
    player.lastActionAt = now;
    this.pushAudioEvent(now, {
      kind: "kick",
      kick: "body",
      playerId: player.id,
      position: this.runtimePosition(player),
      speed: Math.max(speed, approachSpeed, this.ballSpeed())
    });
    this.message = `${player.name} \u043f\u0440\u043e\u0434\u0430\u0432\u0438\u043b \u043c\u044f\u0447 \u043a\u043e\u0440\u043f\u0443\u0441\u043e\u043c`;
  }

  private hasPendingActiveStrike(player: PlayerRuntime, now: number): boolean {
    return Boolean(player.input.kickLeftHeld)
      || player.input.kickLeft > player.lastKickLeft
      || player.input.kickRight > player.lastKickRight
      || player.input.head > player.lastHead
      || player.leftKickBufferedUntil >= now;
  }

  private hasRecentActiveStrike(player: PlayerRuntime, now: number): boolean {
    return (player.lastAction === "left" || player.lastAction === "hand" || player.lastAction === "head")
      && now - player.lastActionAt < this.settings.bodyBumpCooldownMs;
  }

  private recordBallTouch(player: PlayerRuntime, now: number): void {
    if (player.role !== "player" || player.team === null) return;
    this.lastBallTouchPlayerId = player.id;
    this.lastBallTouchTeam = player.team;
    this.lastBallTouchAt = now;
  }

  private ballOwner(): PlayerRuntime | null {
    if (!this.ballOwnerPlayerId) return null;
    const owner = this.players.get(this.ballOwnerPlayerId) || null;
    if (!owner || owner.role !== "player" || !owner.body || owner.ragdoll || owner.exhausted) return null;
    return owner;
  }

  private dropBallOwner(now: number): void {
    this.ballOwnerPlayerId = null;
    this.ballPossessionReleasedUntil = now + this.settings.ballPossessionRecaptureDelayMs;
  }

  private ballCarryPosition(player: PlayerRuntime, playerPosition = player.body?.translation()): Vec3 {
    const base = playerPosition ? vec3FromRapier(playerPosition) : this.runtimePosition(player);
    const forwardX = Math.sin(player.yaw);
    const forwardZ = Math.cos(player.yaw);
    return {
      x: base.x + forwardX * this.settings.ballPossessionCarryDistance,
      y: base.y - this.settings.playerHeight / 2 + this.settings.ballRadius + this.settings.ballPossessionCarryHeight,
      z: base.z + forwardZ * this.settings.ballPossessionCarryDistance
    };
  }

  private syncBallToOwner(now: number): boolean {
    if (!this.settings.ballPossessionEnabled) {
      if (this.ballOwnerPlayerId) this.dropBallOwner(now);
      return false;
    }
    const owner = this.ballOwner();
    if (!owner || !owner.body) {
      if (this.ballOwnerPlayerId) this.dropBallOwner(now);
      return false;
    }
    const carryPosition = this.ballCarryPosition(owner);
    this.ballBody.setTranslation(carryPosition, true);
    this.ballBody.setLinvel({
      x: owner.velocity.x,
      y: Math.max(0, owner.velocity.y),
      z: owner.velocity.z
    }, true);
    this.ballBody.setAngvel({ x: owner.velocity.z * 1.8, y: 0, z: -owner.velocity.x * 1.8 }, true);
    this.recordBallTouch(owner, now);
    return true;
  }

  private tryCaptureBall(player: PlayerRuntime, now: number, playerPosition?: Vec3): boolean {
    if (!this.settings.ballPossessionEnabled) return false;
    if (this.ballOwnerPlayerId || now < this.ballPossessionReleasedUntil) return false;
    if (!player.body || player.role !== "player" || player.ragdoll || player.exhausted) return false;
    const position = playerPosition || vec3FromRapier(player.body.translation());
    const ballPosition = vec3FromRapier(this.ballBody.translation());
    const ballSpeed = this.ballSpeed();
    const groundBallY = this.settings.ballRadius + this.settings.ballPossessionMaxCaptureHeight;
    if (ballSpeed > this.settings.ballPossessionMaxCaptureSpeed || ballPosition.y > groundBallY) return false;
    const distance = distance2d(position, ballPosition);
    if (distance > this.settings.ballPossessionRange) return false;
    if (!ballOverlapsPlayerBodyHeight(position, ballPosition)) return false;
    this.ballOwnerPlayerId = player.id;
    this.syncBallToOwner(now);
    return true;
  }

  private possessionShotPowerMultiplier(charge: number, strong: boolean): number {
    const chargeFraction = strong ? 1 : clamp(charge, 0, 1);
    const base = Math.max(0, this.settings.ballPossessionBasePowerMultiplier);
    const full = Math.max(
      base,
      this.settings.ballPossessionFullPowerMultiplier,
      base * Math.max(1, this.settings.ballPossessionStrongMultiplier)
    );
    return lerp(base, full, chargeFraction);
  }

  private releasePossessionShot(player: PlayerRuntime, now: number, shot: "low" | "upper", charge = 0): boolean {
    if (this.ballOwnerPlayerId !== player.id || !player.body) return false;
    if (this.goalReset || player.ragdoll || player.exhausted) return false;
    const cooldown = shot === "upper" ? this.settings.handCooldownMs : this.settings.kickCooldownMs;
    if (now - player.lastKickAt < cooldown) return false;
    player.lastKickAt = now;
    const forwardX = Math.sin(player.yaw);
    const forwardZ = Math.cos(player.yaw);
    const strong = Boolean(player.input.sprint);
    const multiplier = this.possessionShotPowerMultiplier(charge, strong);
    const shotSpeed = (shot === "upper" ? this.settings.ballPossessionUpperShotSpeed : this.settings.ballPossessionLowShotSpeed) * multiplier;
    const lift = (shot === "upper" ? this.settings.ballPossessionUpperShotLift : this.settings.ballPossessionLowShotLift) * (strong ? 1.18 : 1);
    const carryPosition = this.ballCarryPosition(player);
    this.ballOwnerPlayerId = null;
    this.ballPossessionReleasedUntil = now + this.settings.ballPossessionRecaptureDelayMs;
    this.ballBody.setTranslation(carryPosition, true);
    this.ballBody.setLinvel({
      x: forwardX * shotSpeed + player.velocity.x * 0.18,
      y: lift,
      z: forwardZ * shotSpeed + player.velocity.z * 0.18
    }, true);
    this.recordBallTouch(player, now);
    player.lastAction = shot === "upper" ? "hand" : "left";
    player.lastActionSide = shot === "upper" ? sideLabel(player.nextHandSide) : player.trailingFoot;
    player.lastActionAt = now;
    if (shot === "upper") player.nextHandSide = player.nextHandSide === 1 ? -1 : 1;
    this.pushAudioEvent(now, {
      kind: "kick",
      kick: player.lastAction,
      playerId: player.id,
      position: this.runtimePosition(player),
      speed: this.ballSpeed()
    });
    this.message = `${player.name} ${shot === "upper" ? "\u043f\u043e\u0434\u0431\u0440\u043e\u0441\u0438\u043b \u043c\u044f\u0447 \u0432\u0435\u0440\u0445\u043e\u043c" : "\u043f\u0440\u043e\u0431\u0438\u043b \u043c\u044f\u0447 \u043d\u0438\u0437\u043e\u043c"}${strong ? " \u0441 \u0443\u0441\u0438\u043b\u0435\u043d\u0438\u0435\u043c" : ""}`;
    return true;
  }

  private processKick(player: PlayerRuntime, now: number, dt: number, contactPosition?: Vec3): void {
    const leftHeld = Boolean(player.input.kickLeftHeld);
    if (player.exhausted) {
      this.consumeExhaustedCombatInput(player, leftHeld);
      return;
    }
    const ownsBall = this.ballOwnerPlayerId === player.id;
    if (leftHeld && !player.lastKickLeftHeld) {
      player.leftKickChargeStartedAt = now;
      player.leftKickChargeHeldMs = 0;
      player.kickLeftHoldConsumed = false;
    }
    if (leftHeld) {
      player.leftKickChargeHeldMs = Math.min(
        this.settings.leftKickChargeSeconds * 1000,
        player.leftKickChargeHeldMs + dt * 1000
      );
    }
    const leftKickCharge = player.leftKickChargeStartedAt >= 0 || player.leftKickChargeHeldMs > 0
      ? leftKickChargeFractionFromHeldMs(player.leftKickChargeHeldMs)
      : 0;
    if (!ownsBall && leftHeld && !player.kickLeftHoldConsumed) {
      if (this.tryKick(player, "left", now, {
        charge: leftKickCharge,
        requireBallContact: true,
        contactPosition
      })) {
        player.kickLeftHoldConsumed = true;
      }
    }

    if (player.input.kickLeft > player.lastKickLeft) {
      const nextKickLeft = player.input.kickLeft;
      if (this.tryCelebration(player, "celebrate1", now)) {
        player.lastKickLeft = nextKickLeft;
        if (!leftHeld && player.lastKickLeftHeld) {
          player.leftKickChargeStartedAt = -1;
          player.leftKickChargeHeldMs = 0;
          player.kickLeftHoldConsumed = false;
        }
        player.lastKickLeftHeld = leftHeld;
        return;
      }
      let consumedLeftKick = player.kickLeftHoldConsumed;
      if (!player.kickLeftHoldConsumed) {
        if (this.ballOwnerPlayerId === player.id) {
          consumedLeftKick = this.releasePossessionShot(player, now, "low", leftKickCharge);
          if (consumedLeftKick) {
            player.leftKickBufferedUntil = 0;
            player.leftKickBufferedCharge = 0;
          }
        } else if (this.tryKick(player, "left", now, { charge: leftKickCharge, contactPosition })) {
          consumedLeftKick = true;
          player.leftKickBufferedUntil = 0;
          player.leftKickBufferedCharge = 0;
        } else {
          consumedLeftKick = true;
          player.leftKickBufferedUntil = now + this.settings.leftKickInputBufferMs;
          player.leftKickBufferedCharge = leftKickCharge;
        }
      }
      if (consumedLeftKick) player.lastKickLeft = nextKickLeft;
      player.kickLeftHoldConsumed = false;
    }
    if (!leftHeld && player.lastKickLeftHeld) {
      player.leftKickChargeStartedAt = -1;
      player.leftKickChargeHeldMs = 0;
      player.kickLeftHoldConsumed = false;
    }
    player.lastKickLeftHeld = leftHeld;
    if (!leftHeld && player.leftKickBufferedUntil >= now) {
      if (this.tryKick(player, "left", now, {
        charge: player.leftKickBufferedCharge,
        requireBallContact: true,
        contactPosition
      })) {
        player.leftKickBufferedUntil = 0;
        player.leftKickBufferedCharge = 0;
      }
    } else if (player.leftKickBufferedUntil > 0 && player.leftKickBufferedUntil < now) {
      player.leftKickBufferedUntil = 0;
      player.leftKickBufferedCharge = 0;
    }
    if (player.input.kickRight > player.lastKickRight) {
      const nextKickRight = player.input.kickRight;
      if (this.tryCelebration(player, "celebrate2", now)) {
        player.lastKickRight = nextKickRight;
        return;
      }
      const acted = this.ballOwnerPlayerId === player.id
        ? this.releasePossessionShot(player, now, "upper")
        : this.tryKick(player, "hand", now, { contactPosition });
      if (acted) player.lastKickRight = nextKickRight;
    }
    if (player.input.head > player.lastHead) {
      const nextHead = player.input.head;
      if (this.tryCelebration(player, "celebrate3", now)) {
        player.lastHead = nextHead;
        return;
      }
      if (this.tryKick(player, "head", now, { contactPosition })) player.lastHead = nextHead;
    }
  }

  private consumeExhaustedCombatInput(player: PlayerRuntime, leftHeld: boolean): void {
    if (player.input.kickLeft > player.lastKickLeft) player.lastKickLeft = player.input.kickLeft;
    if (player.input.kickRight > player.lastKickRight) player.lastKickRight = player.input.kickRight;
    if (player.input.head > player.lastHead) player.lastHead = player.input.head;
    player.leftKickChargeStartedAt = -1;
    player.leftKickChargeHeldMs = 0;
    player.kickLeftHoldConsumed = false;
    player.leftKickBufferedUntil = 0;
    player.leftKickBufferedCharge = 0;
    player.lastKickLeftHeld = leftHeld;
  }

  private tryCelebration(player: PlayerRuntime, kind: CelebrationKind, now: number): boolean {
    if (!player.body || player.role !== "player") return false;
    if (now > player.celebrationAvailableUntil) return false;
    player.celebration = kind;
    player.celebrationAt = now;
    this.pushAudioEvent(now, {
      kind: "celebration",
      celebration: kind,
      playerId: player.id,
      position: this.runtimePosition(player)
    });
    this.message = `${player.name} ${this.celebrationLabel(kind)}`;
    return true;
  }

  private tryKick(
    player: PlayerRuntime,
    kind: KickKind,
    now: number,
    options: { charge?: number; requireBallContact?: boolean; contactPosition?: Vec3 } = {}
  ): boolean {
    if (!player.body) return false;
    if (player.ragdoll) return false;
    if (player.exhausted) return false;
    if (kind === "jump" || kind === "body") return false;
    if (this.goalReset) return false;

    const playerPosition = options.contactPosition ?? player.body.translation();
    const ballPosition = this.ballBody.translation();
    const forwardX = Math.sin(player.yaw);
    const forwardZ = Math.cos(player.yaw);
    const sideX = Math.cos(player.yaw);
    const sideZ = -Math.sin(player.yaw);
    const resolvedActionSide = kind === "left"
      ? player.trailingFoot
      : kind === "hand"
        ? sideLabel(player.nextHandSide)
        : null;
    const side = kind === "left" ? sideValue(player.trailingFoot) : kind === "hand" ? player.nextHandSide : 0;
    const contact = kind === "head"
      ? {
          x: playerPosition.x + forwardX * 0.18,
          y: playerPosition.y + this.settings.playerHeight * 0.48,
          z: playerPosition.z + forwardZ * 0.18
        }
      : kind === "hand"
        ? {
            x: playerPosition.x + sideX * 0.36 + forwardX * 0.42,
            y: playerPosition.y + this.settings.playerHeight * 0.08,
            z: playerPosition.z + sideZ * 0.36 + forwardZ * 0.42
          }
      : {
          x: playerPosition.x + sideX * side * 0.34 + forwardX * 0.28,
          y: playerPosition.y - this.settings.playerHeight / 2 + this.settings.ballRadius * 1.05,
          z: playerPosition.z + sideZ * side * 0.34 + forwardZ * 0.28
        };
    const dx = ballPosition.x - contact.x;
    const dy = ballPosition.y - contact.y;
    const dz = ballPosition.z - contact.z;
    const distance = Math.hypot(dx, dz);
    const playerToBallX = ballPosition.x - playerPosition.x;
    const playerToBallZ = ballPosition.z - playerPosition.z;
    const playerToBallDistance = Math.hypot(playerToBallX, playerToBallZ);
    const playerToBallAlignment = playerToBallDistance > 0.001
      ? (playerToBallX / playerToBallDistance) * forwardX + (playerToBallZ / playerToBallDistance) * forwardZ
      : 1;
    const closeBodyContact = playerToBallDistance <= this.settings.playerRadius + this.settings.ballRadius + 0.42;
    const verticalInRange = Math.abs(dy) <= kickContactVerticalRange(kind);
    const preciseInRange = distance <= (kind === "hand" ? this.settings.kickRange * 0.82 : this.settings.kickRange) && verticalInRange;
    const assistedInRange = playerToBallDistance <= kickAssistHorizontalRange(kind)
      && verticalInRange
      && (closeBodyContact || playerToBallAlignment >= -0.15);
    const ballInRange = preciseInRange || assistedInRange;
    const airborneDashReach = kind === "left" && !player.grounded && !ballInRange
      ? this.settings.jumpKickDashSpeed * 0.5
      : 0;
    const playerHitInRange = !options.requireBallContact
      && this.canApplyPlayerHit(player, kind, { x: forwardX, z: forwardZ }, { rangeBonus: airborneDashReach });
    if (options.requireBallContact && !ballInRange) return false;
    const shouldKeepLeftKickBuffered = kind === "left"
      && !ballInRange
      && !playerHitInRange
      && playerToBallDistance <= this.settings.footKickAssistRange + 1.05
      && verticalInRange
      && playerToBallAlignment >= -0.15;
    if (shouldKeepLeftKickBuffered) return false;
    if (kind === "head" && !ballInRange && !playerHitInRange) return false;
    const visualOnlyStrike = kind !== "head" && !options.requireBallContact && !ballInRange && !playerHitInRange;
    if (kind === "head") {
      if (now - player.lastHeadAt < this.settings.headCooldownMs) return false;
      player.lastHeadAt = now;
    } else if (kind === "hand") {
      if (now - player.lastKickAt < this.settings.handCooldownMs) return false;
      player.lastKickAt = now;
    } else {
      if (now - player.lastKickAt < this.settings.kickCooldownMs) return false;
      player.lastKickAt = now;
    }
    let acted = false;

    if (ballInRange) {
      const aimX = forwardX;
      const aimZ = forwardZ;
      const aimMagnitude = Math.hypot(aimX, aimZ) || 1;
      const airborneHead = kind === "head" && !player.grounded;
      const strength = kind === "head"
        ? this.settings.headKickStrength * (airborneHead ? 1.14 : 1)
        : kind === "hand"
          ? this.settings.handHitStrength
          : this.settings.footKickStrength;
      const powerMultiplier = ballHitPowerMultiplier(kind, options.charge);
      const lift = kind === "head" ? 0.9 : kind === "hand" ? 0.12 : 0.28;
      this.ballBody.applyImpulse(
        {
          x: aimX / aimMagnitude * strength * powerMultiplier,
          y: lift * powerMultiplier,
          z: aimZ / aimMagnitude * strength * powerMultiplier
        },
        true
      );
      this.recordBallTouch(player, now);
      acted = true;
    }

    if (!ballInRange && kind === "left" && !player.grounded) this.applyJumpKickDash(player, { x: forwardX, z: forwardZ });
    acted = (!options.requireBallContact
      && this.applyPlayerHit(player, kind, now, { x: forwardX, z: forwardZ }, { rangeBonus: airborneDashReach }))
      || acted;
    acted = acted || visualOnlyStrike;
    if (!acted) return false;

    player.lastAction = kind;
    player.lastActionSide = resolvedActionSide;
    player.lastActionAt = now;
    if (kind === "hand") player.nextHandSide = player.nextHandSide === 1 ? -1 : 1;
    this.pushAudioEvent(now, {
      kind: "kick",
      kick: kind,
      playerId: player.id,
      position: this.runtimePosition(player),
      speed: Math.max(kind === "head" ? this.settings.headKickStrength : kind === "hand" ? this.settings.handHitStrength : this.settings.footKickStrength, this.ballSpeed())
    });
    this.message = `${player.name} ${this.actionLabel(kind, player.lastActionSide)}`;
    return true;
  }

  private applyJumpKickDash(player: PlayerRuntime, forward: { x: number; z: number }): void {
    const dash = this.settings.jumpKickDashSpeed;
    if (dash <= 0) return;
    player.pushVelocity.x += forward.x * dash;
    player.pushVelocity.z += forward.z * dash;
    player.velocity = {
      x: player.velocity.x + forward.x * dash,
      y: player.velocity.y,
      z: player.velocity.z + forward.z * dash
    };
  }

  private applyPlayerHit(
    attacker: PlayerRuntime,
    kind: KickKind,
    now: number,
    forward: { x: number; z: number },
    options: { rangeBonus?: number } = {}
  ): boolean {
    if (!attacker.body || kind === "body" || kind === "jump") return false;
    const origin = attacker.body.translation();
    const profile = playerHitProfile(kind);
    const dashReach = Math.max(0, options.rangeBonus || 0);
    const range = profile.range + (kind === "left" && !attacker.grounded ? this.settings.jumpKickHitRangeBonus : 0) + dashReach;
    const cone = profile.cone;
    let hit = false;
    for (const target of this.players.values()) {
      if (target.id === attacker.id || target.role !== "player" || !target.body || target.ragdoll) continue;
      if (!this.settings.friendlyFireEnabled && target.team !== null && target.team === attacker.team) continue;
      const targetPosition = target.body.translation();
      const dx = targetPosition.x - origin.x;
      const dz = targetPosition.z - origin.z;
      const distance = Math.hypot(dx, dz);
      if (distance > range) continue;
      if (!playerHitHeightInRange(origin, targetPosition, kind)) continue;
      const pointBlank = distance <= this.settings.playerRadius * 0.65;
      const alignment = distance > 0.001 ? (dx / distance) * forward.x + (dz / distance) * forward.z : 1;
      if (!pointBlank && alignment < cone) continue;
      const airborneHead = kind === "head" && !attacker.grounded;
      const damage = this.settings.playerHitFullKnockoutEnabled
        ? this.settings.playerStaminaMax
        : kind === "left"
          ? this.settings.footPlayerStaminaDamage
          : kind === "hand"
            ? this.settings.handPlayerStaminaDamage
            : this.settings.headPlayerStaminaDamage + (airborneHead ? this.settings.airborneHeadStaminaDamageBonus : 0);
      target.stamina = Math.max(0, target.stamina - damage);
      target.staminaRecoveryBlockedUntil = now + this.settings.playerHitRecoveryDelayMs;
      if (target.stamina <= 0.01) target.exhausted = true;
      target.lastAction = "body";
      target.lastActionSide = null;
      target.lastActionAt = now;
      if (target.stamina <= 0.01) {
        const knockoutPower = this.settings.playerRagdollHitKnockback * (kind === "hand" ? 1.12 : kind === "head" ? 1.05 : 0.96);
        this.beginRagdoll(target, now, {
          x: forward.x * knockoutPower + attacker.velocity.x * 0.22,
          y: this.settings.playerRagdollVerticalKnockback,
          z: forward.z * knockoutPower + attacker.velocity.z * 0.22
        });
      } else {
        target.pushVelocity.x += forward.x * (kind === "hand" ? 3.7 : 2.7);
        target.pushVelocity.z += forward.z * (kind === "hand" ? 3.7 : 2.7);
      }
      hit = true;
    }
    return hit;
  }

  private canApplyPlayerHit(
    attacker: PlayerRuntime,
    kind: KickKind,
    forward: { x: number; z: number },
    options: { rangeBonus?: number } = {}
  ): boolean {
    if (!attacker.body || kind === "body" || kind === "jump") return false;
    const origin = attacker.body.translation();
    const profile = playerHitProfile(kind);
    const dashReach = Math.max(0, options.rangeBonus || 0);
    const range = profile.range + (kind === "left" && !attacker.grounded ? this.settings.jumpKickHitRangeBonus : 0) + dashReach;
    const cone = profile.cone;
    for (const target of this.players.values()) {
      if (target.id === attacker.id || target.role !== "player" || !target.body || target.ragdoll) continue;
      if (!this.settings.friendlyFireEnabled && target.team !== null && target.team === attacker.team) continue;
      const targetPosition = target.body.translation();
      const dx = targetPosition.x - origin.x;
      const dz = targetPosition.z - origin.z;
      const distance = Math.hypot(dx, dz);
      if (distance > range) continue;
      if (!playerHitHeightInRange(origin, targetPosition, kind)) continue;
      const pointBlank = distance <= this.settings.playerRadius * 0.65;
      const alignment = distance > 0.001 ? (dx / distance) * forward.x + (dz / distance) * forward.z : 1;
      if (pointBlank || alignment >= cone) return true;
    }
    return false;
  }

  private actionLabel(kind: KickKind, side: StrikeSide | null = null): string {
    if (kind === "left") return side === "right" ? "\u0443\u0434\u0430\u0440\u0438\u043b \u043f\u0440\u0430\u0432\u043e\u0439 \u043d\u043e\u0433\u043e\u0439" : "\u0443\u0434\u0430\u0440\u0438\u043b \u043b\u0435\u0432\u043e\u0439 \u043d\u043e\u0433\u043e\u0439";
    if (kind === "hand") return side === "left" ? "\u0443\u0434\u0430\u0440\u0438\u043b \u043b\u0435\u0432\u043e\u0439 \u0440\u0443\u043a\u043e\u0439" : "\u0443\u0434\u0430\u0440\u0438\u043b \u043f\u0440\u0430\u0432\u043e\u0439 \u0440\u0443\u043a\u043e\u0439";
    if (kind === "head") return "\u0441\u044b\u0433\u0440\u0430\u043b \u0433\u043e\u043b\u043e\u0432\u043e\u0439";
    if (kind === "jump") return "\u043f\u0440\u044b\u0433\u043d\u0443\u043b";
    return "\u0441\u044b\u0433\u0440\u0430\u043b \u043a\u043e\u0440\u043f\u0443\u0441\u043e\u043c";
  }

  private celebrationLabel(kind: CelebrationKind): string {
    if (kind === "celebrate1") return "\u043f\u043e\u0434\u043d\u0438\u043c\u0430\u0435\u0442 \u0440\u0443\u043a\u0438 \u043f\u043e\u0441\u043b\u0435 \u0433\u043e\u043b\u0430";
    if (kind === "celebrate2") return "\u043f\u0440\u044b\u0433\u0430\u0435\u0442 \u0438 \u043a\u0430\u0447\u0430\u0435\u0442 \u0442\u0440\u0438\u0431\u0443\u043d\u044b";
    return "\u043a\u0438\u0432\u0430\u0435\u0442 \u0438 \u0434\u0435\u043b\u0430\u0435\u0442 \u0444\u0438\u0441\u0442-\u043f\u0430\u043c\u043f";
  }

  private openCelebrationWindow(scoringTeam: TeamId, now: number): void {
    for (const player of this.players.values()) {
      if (player.role !== "player" || player.team !== scoringTeam) continue;
      player.celebrationAvailableUntil = now + this.settings.celebrationWindowMs;
    }
  }

  private kickoffBallPosition(): Vec3 {
    return { x: 0, y: this.settings.ballRadius + 0.04, z: 0 };
  }

  private resetPlayersForKickoff(): void {
    for (const player of this.players.values()) {
      if (!player.body) continue;
      const spawn = this.spawnForIndex(player.index);
      player.body.setNextKinematicTranslation(spawn);
      player.body.setTranslation(spawn, true);
      player.grounded = true;
      player.verticalVelocity = 0;
      player.velocity = zeroVec();
      player.moveAxis = { x: 0, z: 0 };
      player.moveVelocity = zeroVec();
      player.pushVelocity = zeroVec();
      player.input = { ...DEFAULT_INPUT };
      player.sprinting = false;
    }
  }

  private startGoalReset(scoringTeam: TeamId, now: number): void {
    this.openCelebrationWindow(scoringTeam, now);
    this.lastCountdownAudioSecond = null;
    this.goalReset = {
      scoringTeam,
      scoredAt: now,
      returnStartAt: now + this.settings.postGoalCelebrationMs,
      returnEndAt: now + this.settings.postGoalCelebrationMs + this.settings.postGoalBallReturnMs,
      returnStarted: false,
      returnFrom: vec3FromRapier(this.ballBody.translation())
    };
  }

  private updateGoalReset(now: number): boolean {
    const sequence = this.goalReset;
    if (!sequence) return false;

    if (now < sequence.returnStartAt) {
      return true;
    }

    if (!sequence.returnStarted) {
      sequence.returnStarted = true;
      sequence.returnFrom = vec3FromRapier(this.ballBody.translation());
      this.resetPlayersForKickoff();
      this.ballBody.setLinvel(zeroVec(), true);
      this.ballBody.setAngvel(zeroVec(), true);
      this.message = "\u041c\u044f\u0447 \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442\u0441\u044f \u0432 \u0446\u0435\u043d\u0442\u0440";
    }

    const target = this.kickoffBallPosition();
    const rawProgress = (now - sequence.returnStartAt) / this.settings.postGoalBallReturnMs;
    const progress = easeOutCubic(rawProgress);
    const nextPosition = {
      x: lerp(sequence.returnFrom.x, target.x, progress),
      y: lerp(sequence.returnFrom.y, target.y, progress),
      z: lerp(sequence.returnFrom.z, target.z, progress)
    };
    this.ballBody.setTranslation(nextPosition, true);
    this.ballBody.setLinvel({
      x: (target.x - sequence.returnFrom.x) / (this.settings.postGoalBallReturnMs / 1000),
      y: (target.y - sequence.returnFrom.y) / (this.settings.postGoalBallReturnMs / 1000),
      z: (target.z - sequence.returnFrom.z) / (this.settings.postGoalBallReturnMs / 1000)
    }, true);
    this.ballBody.setAngvel(zeroVec(), true);

    if (rawProgress < 1) return true;

    this.ballBody.setTranslation(target, true);
    this.ballBody.setLinvel(zeroVec(), true);
    this.ballBody.setAngvel(zeroVec(), true);
    this.activeBallVariant = (this.activeBallVariant + 1) % BALL_VARIANT_COUNT;
    this.countdownUntil = now + this.settings.kickoffCountdownMs;
    this.goalReset = null;
    this.message = "\u0420\u043e\u0437\u044b\u0433\u0440\u044b\u0448 \u0441 \u0446\u0435\u043d\u0442\u0440\u0430";
    return true;
  }

  private containBall(): void {
    const position = this.ballBody.translation();
    const velocity = this.ballBody.linvel();
    let nextPosition = { x: position.x, y: Math.max(position.y, this.settings.ballRadius), z: position.z };
    let nextVelocity = { x: velocity.x * 0.997, y: velocity.y, z: velocity.z * 0.997 };
    const halfWidth = this.settings.fieldWidth / 2 - this.settings.ballRadius;
    const halfLength = this.settings.fieldLength / 2 + this.settings.goalDepth;
    const environment = this.environmentAt(nextPosition);
    const weather = this.currentWeather();
    nextVelocity.x = nextVelocity.x * environment.ballDrag + weather.wind.x * weather.intensity * 0.004;
    nextVelocity.z = nextVelocity.z * environment.ballDrag + weather.wind.z * weather.intensity * 0.004;

    if (Math.abs(nextPosition.x) > halfWidth) {
      nextPosition.x = clamp(nextPosition.x, -halfWidth, halfWidth);
      nextVelocity.x *= -this.settings.ballRestitution;
    }
    if (Math.abs(nextPosition.z) > halfLength) {
      nextPosition.z = clamp(nextPosition.z, -halfLength, halfLength);
      nextVelocity.z *= -this.settings.ballRestitution;
    }
    if (nextPosition.y <= this.settings.ballRadius && nextVelocity.y < 0) {
      nextVelocity.y *= -0.72;
    }

    this.resolveGoalPostBounce(nextPosition, nextVelocity);

    for (const hazard of weather.hazards) {
      if (hazard.type !== "snowbank") continue;
      const dx = nextPosition.x - hazard.position.x;
      const dz = nextPosition.z - hazard.position.z;
      const distance = Math.hypot(dx, dz);
      const safeRadius = hazard.radius + this.settings.ballRadius;
      if (distance >= safeRadius) continue;
      const nx = distance > 0.001 ? dx / distance : 1;
      const nz = distance > 0.001 ? dz / distance : 0;
      const approach = nextVelocity.x * nx + nextVelocity.z * nz;
      nextPosition.x = hazard.position.x + nx * safeRadius;
      nextPosition.z = hazard.position.z + nz * safeRadius;
      if (approach < 0) {
        nextVelocity.x -= approach * nx * (1.55 + hazard.strength * 0.2);
        nextVelocity.z -= approach * nz * (1.55 + hazard.strength * 0.2);
        nextVelocity.y = Math.max(nextVelocity.y, 0.85);
      }
      nextVelocity.x *= 0.88;
      nextVelocity.z *= 0.88;
    }

    this.ballBody.setTranslation(nextPosition, true);
    this.ballBody.setLinvel(nextVelocity, true);
  }

  private resolvePlayerBallCollision(
    previousBallPosition: Vec3,
    now: number,
    previousPlayerPositions: Map<string, Vec3> = new Map(),
    options: { skipPlayerId?: string | null; dropOwnerOnHit?: boolean } = {}
  ): void {
    if (this.goalReset) return;
    const ballPosition = this.ballBody.translation();
    const ballVelocity = this.ballBody.linvel();
    const nextPosition = { x: ballPosition.x, y: Math.max(ballPosition.y, this.settings.ballRadius), z: ballPosition.z };
    const nextVelocity = { x: ballVelocity.x, y: ballVelocity.y, z: ballVelocity.z };
    const safeRadius = this.settings.playerRadius + this.settings.ballRadius + this.settings.playerBallCollisionSkin;
    const restitution = Math.max(0, this.settings.playerBallCollisionRestitution);
    let resolved = false;

    for (const player of this.players.values()) {
      if (player.role !== "player" || !player.body) continue;
      if (options.skipPlayerId && player.id === options.skipPlayerId) continue;
      const playerPosition = vec3FromRapier(player.body.translation());
      const previousPlayerPosition = previousPlayerPositions.get(player.id) || playerPosition;
      const verticalOverlap = ballOverlapsPlayerBodyHeight(playerPosition, nextPosition)
        || ballOverlapsPlayerBodyHeight(playerPosition, previousBallPosition)
        || ballOverlapsPlayerBodyHeight(previousPlayerPosition, nextPosition)
        || ballOverlapsPlayerBodyHeight(previousPlayerPosition, previousBallPosition);
      if (!verticalOverlap) continue;

      const currentDx = nextPosition.x - playerPosition.x;
      const currentDz = nextPosition.z - playerPosition.z;
      const currentDistance = Math.hypot(currentDx, currentDz);
      let normalX = currentDistance > 0.001 ? currentDx / currentDistance : 0;
      let normalZ = currentDistance > 0.001 ? currentDz / currentDistance : 0;
      let hit = currentDistance < safeRadius;

      if (!hit) {
        const relativePreviousX = previousBallPosition.x - previousPlayerPosition.x;
        const relativePreviousZ = previousBallPosition.z - previousPlayerPosition.z;
        const relativeNextX = nextPosition.x - playerPosition.x;
        const relativeNextZ = nextPosition.z - playerPosition.z;
        const segmentX = relativeNextX - relativePreviousX;
        const segmentZ = relativeNextZ - relativePreviousZ;
        const segmentLengthSq = segmentX * segmentX + segmentZ * segmentZ;
        if (segmentLengthSq > 0.000001) {
          const t = clamp(
            -(relativePreviousX * segmentX + relativePreviousZ * segmentZ) / segmentLengthSq,
            0,
            1
          );
          const closestDx = relativePreviousX + segmentX * t;
          const closestDz = relativePreviousZ + segmentZ * t;
          const closestDistance = Math.hypot(closestDx, closestDz);
          hit = closestDistance < safeRadius;
          if (hit) {
            const previousDx = previousBallPosition.x - previousPlayerPosition.x;
            const previousDz = previousBallPosition.z - previousPlayerPosition.z;
            const previousDistance = Math.hypot(previousDx, previousDz);
            if (previousDistance > 0.001) {
              normalX = previousDx / previousDistance;
              normalZ = previousDz / previousDistance;
            } else if (closestDistance > 0.001) {
              normalX = closestDx / closestDistance;
              normalZ = closestDz / closestDistance;
            } else {
              const speed = Math.hypot(nextVelocity.x, nextVelocity.z);
              normalX = speed > 0.001 ? -nextVelocity.x / speed : Math.sin(player.yaw);
              normalZ = speed > 0.001 ? -nextVelocity.z / speed : Math.cos(player.yaw);
            }
          }
        }
      }

      if (!hit) continue;
      if (Math.hypot(normalX, normalZ) < 0.001) {
        normalX = Math.sin(player.yaw);
        normalZ = Math.cos(player.yaw);
      }
      nextPosition.x = playerPosition.x + normalX * safeRadius;
      nextPosition.z = playerPosition.z + normalZ * safeRadius;

      const approach = nextVelocity.x * normalX + nextVelocity.z * normalZ;
      if (approach < 0) {
        nextVelocity.x -= (1 + restitution) * approach * normalX;
        nextVelocity.z -= (1 + restitution) * approach * normalZ;
        nextVelocity.y = Math.max(nextVelocity.y, 0.08);
      }

      const bodyPush = player.velocity.x * normalX + player.velocity.z * normalZ;
      if (bodyPush > 0) {
        const currentPushSpeed = nextVelocity.x * normalX + nextVelocity.z * normalZ;
        const targetPushSpeed = bodyPush * this.settings.playerBallCollisionPush;
        if (currentPushSpeed < targetPushSpeed) {
          const pushDelta = targetPushSpeed - currentPushSpeed;
          nextVelocity.x += normalX * pushDelta;
          nextVelocity.z += normalZ * pushDelta;
          nextVelocity.y = Math.max(nextVelocity.y, 0.04);
        }
      }

      this.recordBallTouch(player, now);
      if (options.dropOwnerOnHit && this.ballOwnerPlayerId) this.dropBallOwner(now);
      resolved = true;
    }

    if (!resolved) return;
    this.ballBody.setTranslation(nextPosition, true);
    this.ballBody.setLinvel(nextVelocity, true);
  }

  private resolveGoalPostBounce(nextPosition: Vec3, nextVelocity: Vec3): void {
    const goalZs = [-this.settings.fieldLength / 2, this.settings.fieldLength / 2];
    for (const goalZ of goalZs) {
      for (const postX of [-this.settings.goalWidth / 2, this.settings.goalWidth / 2]) {
        const dx = nextPosition.x - postX;
        const dz = nextPosition.z - goalZ;
        const distance = Math.hypot(dx, dz);
        const safeRadius = this.settings.goalPostRadius + this.settings.ballRadius;
        if (distance >= safeRadius || distance < 0.001 || nextPosition.y > this.settings.goalCrossbarHeight + this.settings.ballRadius) continue;
        const nx = dx / distance;
        const nz = dz / distance;
        const approach = nextVelocity.x * nx + nextVelocity.z * nz;
        nextPosition.x = postX + nx * safeRadius;
        nextPosition.z = goalZ + nz * safeRadius;
        if (approach < 0) {
          nextVelocity.x -= approach * nx * (1 + this.settings.ballRestitution);
          nextVelocity.z -= approach * nz * (1 + this.settings.ballRestitution);
          nextVelocity.y = Math.max(nextVelocity.y, 0.55);
        }
      }
      const inCrossbarX = Math.abs(nextPosition.x) <= this.settings.goalWidth / 2 + this.settings.goalPostRadius;
      const nearGoalPlane = Math.abs(nextPosition.z - goalZ) <= this.settings.goalPostRadius + this.settings.ballRadius;
      const nearCrossbarY = Math.abs(nextPosition.y - this.settings.goalCrossbarHeight) <= this.settings.goalCrossbarRadius + this.settings.ballRadius;
      if (inCrossbarX && nearGoalPlane && nearCrossbarY && nextVelocity.y > 0) {
        nextPosition.y = this.settings.goalCrossbarHeight - this.settings.goalCrossbarRadius - this.settings.ballRadius;
        nextVelocity.y *= -this.settings.ballRestitution;
        nextVelocity.z *= 0.92;
      }
    }
  }

  private checkGoal(previousPosition: Vec3, now: number): void {
    const position = this.ballBody.translation();
    if (this.didCrossGoalFace(previousPosition, position, -this.settings.fieldLength / 2, -1)) {
      this.score.orange += 1;
      const scorer = this.creditPlayerGoal(1, now);
      this.message = scorer ? `\u041e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442: ${scorer.name}` : "\u041e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442";
      this.pushAudioEvent(now, { kind: "goal", team: 1 });
      this.startGoalReset(1, now);
    } else if (this.didCrossGoalFace(previousPosition, position, this.settings.fieldLength / 2, 1)) {
      this.score.blue += 1;
      const scorer = this.creditPlayerGoal(0, now);
      this.message = scorer ? `\u0421\u0438\u043d\u0438\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442: ${scorer.name}` : "\u0421\u0438\u043d\u0438\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442";
      this.pushAudioEvent(now, { kind: "goal", team: 0 });
      this.startGoalReset(0, now);
    }
  }

  private creditPlayerGoal(scoringTeam: TeamId, now: number): PlayerRuntime | null {
    if (this.lastBallTouchTeam !== scoringTeam || now - this.lastBallTouchAt > 20000) return null;
    const scorer = this.lastBallTouchPlayerId ? this.players.get(this.lastBallTouchPlayerId) : null;
    if (!scorer || scorer.role !== "player" || scorer.team !== scoringTeam) return null;
    scorer.goals += 1;
    this.persistPlayerSession(scorer);
    return scorer;
  }

  private didCrossGoalFace(previousPosition: Vec3, position: Vec3, goalZ: number, side: -1 | 1): boolean {
    const movedThroughFace = side > 0
      ? previousPosition.z <= goalZ && position.z > goalZ
      : previousPosition.z >= goalZ && position.z < goalZ;
    if (!movedThroughFace) return false;

    const dz = position.z - previousPosition.z;
    if (Math.abs(dz) < 0.0001) return false;
    const t = (goalZ - previousPosition.z) / dz;
    if (t < 0 || t > 1) return false;

    const crossingX = previousPosition.x + (position.x - previousPosition.x) * t;
    const crossingY = previousPosition.y + (position.y - previousPosition.y) * t;
    return Math.abs(crossingX) <= this.settings.goalWidth / 2
      && crossingY <= this.settings.goalCrossbarHeight + this.settings.ballRadius;
  }

  private emitCountdownAudio(now: number): void {
    const remainingMs = Math.max(0, this.countdownUntil - now);
    if (remainingMs <= 0) {
      this.lastCountdownAudioSecond = null;
      return;
    }
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    if (remainingSeconds !== this.lastCountdownAudioSecond) {
      this.lastCountdownAudioSecond = remainingSeconds;
      this.pushAudioEvent(now, { kind: "countdown", remainingSeconds });
    }
  }

  private resetBall(now: number): void {
    this.lastBallTouchPlayerId = null;
    this.lastBallTouchTeam = null;
    this.lastBallTouchAt = 0;
    this.ballOwnerPlayerId = null;
    this.ballPossessionReleasedUntil = now + this.settings.ballPossessionRecaptureDelayMs;
    this.ballBody.setTranslation(this.kickoffBallPosition(), true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.activeBallVariant = (this.activeBallVariant + 1) % BALL_VARIANT_COUNT;
    this.countdownUntil = now + this.settings.kickoffCountdownMs;
    this.resetPlayersForKickoff();
  }

  private snapshotGoalReset(now: number): GoalResetSnapshot {
    if (this.goalReset) {
      const phase = now < this.goalReset.returnStartAt ? "celebration" : "returning";
      const phaseEndAt = phase === "celebration" ? this.goalReset.returnStartAt : this.goalReset.returnEndAt;
      return {
        phase,
        scoringTeam: this.goalReset.scoringTeam,
        elapsedMs: Math.max(0, now - this.goalReset.scoredAt),
        remainingMs: Math.max(0, phaseEndAt - now),
        returnProgress: phase === "returning"
          ? clamp((now - this.goalReset.returnStartAt) / this.settings.postGoalBallReturnMs, 0, 1)
          : 0
      };
    }
    if (this.countdownUntil > now) {
      return {
        phase: "kickoff",
        scoringTeam: null,
        elapsedMs: 0,
        remainingMs: Math.max(0, this.countdownUntil - now),
        returnProgress: 1
      };
    }
    return {
      phase: "none",
      scoringTeam: null,
      elapsedMs: 0,
      remainingMs: 0,
      returnProgress: 0
    };
  }

  private snapshot(now = Date.now()): ServerState {
    this.trimAudioEvents(now);
    const ball: BallSnapshot = {
      position: vec3FromRapier(this.ballBody.translation()),
      velocity: vec3FromRapier(this.ballBody.linvel()),
      variant: this.activeBallVariant,
      ownerPlayerId: this.ballOwnerPlayerId
    };
    return {
      version: GAME_VERSION,
      settingsRevision: this.settingsRevision,
      serverTime: now,
      dayTimeSeconds: this.dayTimeSeconds(now),
      settings: { ...this.settings },
      tick: this.tickCount,
      players: [...this.players.values()]
        .sort((a, b) => a.index - b.index)
        .map((player) => this.snapshotPlayer(player, now)),
      ball,
      score: { ...this.score },
      message: this.message,
      countdown: Math.max(0, this.countdownUntil - now),
      goalReset: this.snapshotGoalReset(now),
      weather: this.currentWeather(now),
      chatMessages: this.chatMessages.slice(),
      audioEvents: this.audioEvents.slice()
    };
  }

  private snapshotPlayer(player: PlayerRuntime, now = Date.now()): PlayerSnapshot {
    const position = player.body ? vec3FromRapier(player.body.translation()) : { x: 0, y: 3, z: this.settings.fieldLength / 2 + 4 + player.index };
    const emotion = player.emotion && player.emotion.expiresAt > now ? player.emotion : null;
    if (!emotion && player.emotion && player.emotion.expiresAt <= now) player.emotion = null;
    return {
      id: player.id,
      name: player.name,
      profile: profileFromPlayer(player),
      userPic: player.userPic,
      controller: playerControllerForTransport(player.transport),
      role: player.role,
      team: player.team,
      index: player.index,
      goals: player.goals,
      characterId: player.characterId,
      position,
      velocity: player.velocity,
      yaw: player.yaw,
      stamina: Math.round(player.stamina * 10) / 10,
      sprinting: player.sprinting,
      airborne: !player.grounded,
      exhausted: player.exhausted,
      ragdoll: player.ragdoll,
      ragdollAt: player.ragdollAt,
      grounded: player.grounded,
      lastAction: player.lastAction,
      lastActionSide: player.lastActionSide,
      lastActionAt: player.lastActionAt,
      trailingFoot: player.trailingFoot,
      stancePhase: player.stancePhase,
      celebration: player.celebration,
      celebrationAt: player.celebrationAt,
      celebrationAvailableUntil: player.celebrationAvailableUntil,
      emotion
    };
  }

  private serverInfo(): ServerInfo {
    const now = Date.now();
    let activePlayers = 0;
    let activeBotPlayers = 0;
    let activeHumanPlayers = 0;
    let activeTestPlayers = 0;
    let staleHumanClients = 0;
    let staleHttpClients = 0;
    let staleWebSocketClients = 0;
    for (const player of this.players.values()) {
      const clientTransport = player.transport === "http" || player.transport === "websocket";
      const staleClient = clientTransport && this.isStaleClientPlayer(player, now);
      if (staleClient) {
        staleHumanClients += 1;
        if (player.transport === "http") staleHttpClients += 1;
        if (player.transport === "websocket") staleWebSocketClients += 1;
      }
      if (player.role === "player") {
        activePlayers += 1;
        if (player.transport === "bot") activeBotPlayers += 1;
        else if (player.transport === "test") activeTestPlayers += 1;
        else if (!staleClient) activeHumanPlayers += 1;
      }
    }
    const botPlayers = this.botPlayers().length;
    const invalidActiveBotPlayers = [...this.players.values()].filter((player) => this.activeBotBodyInvalid(player)).length;
    const humanClients = this.liveHumanClientCount(now);
    const desiredBotPlayers = this.desiredBotCount(now);
    const nonBotActiveSlots = this.nonBotActiveSlotCount(now);
    return {
      ok: true,
      version: GAME_VERSION,
      settingsRevision: this.settingsRevision,
      activePlayers,
      botPlayers,
      activeBotPlayers,
      dormantBotPlayers: this.dormantBots.length,
      botReuseCount: this.botReuseCount,
      botRepairCount: this.botRepairCount,
      invalidActiveBotPlayers,
      desiredBotPlayers,
      nonBotActiveSlots,
      activeHumanPlayers,
      activeTestPlayers,
      staleHumanClients,
      staleHttpClients,
      staleWebSocketClients,
      botFillSuppressionReason: this.botFillSuppressionReason(nonBotActiveSlots),
      humanClients,
      connectedClients: humanClients,
      maxActivePlayers: this.settings.maxActivePlayers,
      maxRoomClients: MAX_ROOM_CLIENTS,
      botsRuntimeEnabled: this.botsEnabled(),
      botTargetActivePlayers: this.botSettings.targetActivePlayers,
      httpClientStaleMs: this.settings.httpClientStaleMs,
      websocketClientStaleMs: this.settings.websocketClientStaleMs,
      testMode: TEST_MODE,
      transports: {
        websocket: this.websocketEnabled,
        http: true
      }
    };
  }
}

new UnsoccerServer().start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
