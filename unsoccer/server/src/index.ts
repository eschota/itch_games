import crypto from "node:crypto";
import http from "node:http";
import type { Duplex } from "node:stream";
import express, { type Request, type Response } from "express";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  AIRBORNE_HEAD_STAMINA_DAMAGE_BONUS,
  BALL_DENSITY,
  BALL_HIT_BASE_POWER_MULTIPLIER,
  BALL_RADIUS,
  BALL_RESTITUTION,
  BODY_BUMP_COOLDOWN_MS,
  BODY_BUMP_MIN_SPEED,
  BODY_BUMP_RANGE,
  BODY_BUMP_STRENGTH,
  CELEBRATION_WINDOW_MS,
  CHARACTER_ROSTER,
  DAY_CYCLE_SECONDS,
  DAY_START_SECONDS,
  DEFAULT_INPUT,
  FIELD_LENGTH,
  FIELD_WIDTH,
  FOOT_PLAYER_STAMINA_DAMAGE,
  FOOT_KICK_STRENGTH,
  GAME_VERSION,
  GOAL_DEPTH,
  GOAL_WIDTH,
  HAND_COOLDOWN_MS,
  HAND_HIT_STRENGTH,
  HAND_PLAYER_STAMINA_DAMAGE,
  HEAD_PLAYER_STAMINA_DAMAGE,
  HEAD_KICK_STRENGTH,
  HEAD_COOLDOWN_MS,
  KICKOFF_COUNTDOWN_MS,
  KICK_COOLDOWN_MS,
  KICK_RANGE,
  LEFT_KICK_CHARGE_SECONDS,
  LEFT_KICK_FULL_CHARGE_POWER_MULTIPLIER,
  MAX_ACTIVE_PLAYERS,
  MAX_ROOM_CLIENTS,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_AIR_CONTROL_MULTIPLIER,
  PLAYER_EXHAUSTED_RECOVERY_THRESHOLD,
  PLAYER_EXHAUSTED_SPEED_MULTIPLIER,
  PLAYER_GRAVITY,
  PLAYER_INPUT_AXIS_ACCELERATION,
  PLAYER_INPUT_AXIS_OPPOSITE_ACCELERATION,
  PLAYER_INPUT_AXIS_RELEASE_DECAY,
  PLAYER_JUMP_COOLDOWN_MS,
  PLAYER_JUMP_STRENGTH,
  PLAYER_MOVEMENT_ACCELERATION,
  PLAYER_MOVEMENT_DECELERATION,
  PLAYER_MOVEMENT_TURN_ACCELERATION,
  PLAYER_RAGDOLL_FRICTION_PER_SECOND,
  PLAYER_RAGDOLL_HIT_KNOCKBACK,
  PLAYER_RAGDOLL_MIN_MS,
  PLAYER_RAGDOLL_VERTICAL_KNOCKBACK,
  PLAYER_SPRINT_MULTIPLIER,
  PLAYER_STAMINA_HIT_COST,
  PLAYER_STAMINA_JUMP_COST,
  PLAYER_STAMINA_MAX,
  PLAYER_STAMINA_RECOVERY_DELAY_MS,
  PLAYER_STAMINA_RECOVERY_PER_SECOND,
  PLAYER_STAMINA_SPRINT_DRAIN_PER_SECOND,
  POST_GOAL_BALL_RETURN_MS,
  POST_GOAL_CELEBRATION_MS,
  SERVER_TICK_RATE,
  SNAPSHOT_RATE,
  type BallSnapshot,
  type CelebrationKind,
  type ClientInputMessage,
  type GoalResetSnapshot,
  type HazardSnapshot,
  type InputState,
  type JoinAccepted,
  type JoinRequest,
  type KickKind,
  type PlayerRole,
  type PlayerSnapshot,
  type ScoreState,
  type ServerAudioEvent,
  type ServerInfo,
  type ServerState,
  type TeamId,
  type Vec3,
  type WeatherKind,
  type WeatherSnapshot,
  clamp,
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

const WEBSOCKET_ACCEPT_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_WEBSOCKET_PAYLOAD_BYTES = 64 * 1024;
const MAX_WEBSOCKET_BUFFER_BYTES = MAX_WEBSOCKET_PAYLOAD_BYTES + 16;

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
  joinOrder: number;
  characterId: string;
  channel: TransportChannel | null;
  transport: "websocket" | "http" | "test";
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
  lastKickRight: number;
  nextHandSide: -1 | 1;
  lastHead: number;
  lastJump: number;
  lastBodyAt: number;
  lastJumpAt: number;
  lastAction: KickKind | null;
  lastActionAt: number;
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
}

interface GoalResetRuntime {
  scoringTeam: TeamId;
  scoredAt: number;
  returnStartAt: number;
  returnEndAt: number;
  returnStarted: boolean;
  returnFrom: Vec3;
}

const PORT = Number(process.env.UNSOCCER_PORT || 8787);
const TEST_MODE = process.env.UNSOCCER_TEST_MODE === "1";
const TEST_TOKEN = process.env.UNSOCCER_TEST_TOKEN || "";
const AUDIO_EVENT_LIMIT = 80;
const AUDIO_EVENT_TTL_MS = 5000;
const WEATHER_CHANGE_MIN_MS = 60000;
const WEATHER_CHANGE_MAX_MS = 120000;
const PLAYER_HIT_RECOVERY_DELAY_MS = 600;
const GOAL_POST_RADIUS = 0.19;
const GOAL_CROSSBAR_HEIGHT = 2.18;
const GOAL_CROSSBAR_RADIUS = 0.16;
const BALL_VARIANT_COUNT = 10;
const WEATHER_PICK_WEIGHTS = [3, 12, 1, 1] as const;
const BODY_CONTACT_BOTTOM_CLEARANCE = BALL_RADIUS * 0.35;
const BODY_CONTACT_TOP_CLEARANCE = BALL_RADIUS * 0.25;
const FOOT_CONTACT_HEIGHT_FROM_GROUND = BALL_RADIUS * 1.05;
const HAND_CONTACT_HEIGHT_FROM_CENTER = PLAYER_HEIGHT * 0.08;
const HEAD_CONTACT_HEIGHT_FROM_CENTER = PLAYER_HEIGHT * 0.48;
const FOOT_CONTACT_VERTICAL_RANGE = BALL_RADIUS + 0.24;
const HAND_CONTACT_VERTICAL_RANGE = PLAYER_HEIGHT * 0.5;
const HEAD_CONTACT_VERTICAL_RANGE = BALL_RADIUS + 0.18;

const WEATHER_HAZARDS: HazardSnapshot[] = [
  {
    id: "puddle-west-box",
    type: "puddle",
    position: { x: -FIELD_WIDTH * 0.27, y: 0.03, z: -FIELD_LENGTH * 0.19 },
    radius: 3.4,
    strength: 0.58
  },
  {
    id: "puddle-east-mid",
    type: "puddle",
    position: { x: FIELD_WIDTH * 0.25, y: 0.03, z: FIELD_LENGTH * 0.11 },
    radius: 3.1,
    strength: 0.52
  },
  {
    id: "slush-center-left",
    type: "slush",
    position: { x: -FIELD_WIDTH * 0.12, y: 0.04, z: FIELD_LENGTH * 0.21 },
    radius: 3.7,
    strength: 0.38
  },
  {
    id: "slush-center-right",
    type: "slush",
    position: { x: FIELD_WIDTH * 0.16, y: 0.04, z: -FIELD_LENGTH * 0.18 },
    radius: 3.5,
    strength: 0.34
  },
  {
    id: "snowbank-north",
    type: "snowbank",
    position: { x: -FIELD_WIDTH * 0.34, y: 0.28, z: FIELD_LENGTH * 0.34 },
    radius: 1.7,
    strength: 0.92
  },
  {
    id: "snowbank-south",
    type: "snowbank",
    position: { x: FIELD_WIDTH * 0.33, y: 0.28, z: -FIELD_LENGTH * 0.33 },
    radius: 1.75,
    strength: 0.92
  }
];

interface WeatherPreset {
  kind: WeatherKind;
  label: string;
  intensity: number;
  wind: Vec3;
  hazards: HazardSnapshot[];
}

const WEATHER_PRESETS: WeatherPreset[] = [
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
    hazards: WEATHER_HAZARDS.filter((hazard) => hazard.type !== "snowbank")
  },
  {
    kind: "snow",
    label: "\u0421\u043d\u0435\u0433, \u043b\u0443\u0436\u0438 \u0438 \u0441\u0443\u0433\u0440\u043e\u0431\u044b",
    intensity: 0.72,
    wind: { x: 0.16, y: 0, z: -0.1 },
    hazards: WEATHER_HAZARDS
  }
];

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
  const bodyBottom = playerPosition.y - PLAYER_HEIGHT / 2 + BODY_CONTACT_BOTTOM_CLEARANCE;
  const bodyTop = playerPosition.y + PLAYER_HEIGHT / 2 - BODY_CONTACT_TOP_CLEARANCE;
  return ballPosition.y + BALL_RADIUS >= bodyBottom && ballPosition.y - BALL_RADIUS <= bodyTop;
}

function kickContactVerticalRange(kind: KickKind): number {
  if (kind === "head") return HEAD_CONTACT_VERTICAL_RANGE;
  if (kind === "hand") return HAND_CONTACT_VERTICAL_RANGE;
  return FOOT_CONTACT_VERTICAL_RANGE;
}

function leftKickPowerMultiplier(charge: number): number {
  return lerp(
    BALL_HIT_BASE_POWER_MULTIPLIER,
    LEFT_KICK_FULL_CHARGE_POWER_MULTIPLIER,
    clamp(charge, 0, 1)
  );
}

function ballHitPowerMultiplier(kind: KickKind, charge = 0): number {
  if (kind === "left") return leftKickPowerMultiplier(charge);
  if (kind === "hand" || kind === "head") return BALL_HIT_BASE_POWER_MULTIPLIER;
  return 1;
}

function leftKickChargeFractionFromHeldMs(heldMs: number): number {
  return clamp(heldMs / (LEFT_KICK_CHARGE_SECONDS * 1000), 0, 1);
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
  const rate = target === 0
    ? PLAYER_INPUT_AXIS_RELEASE_DECAY
    : current !== 0 && Math.sign(current) !== Math.sign(target)
      ? PLAYER_INPUT_AXIS_OPPOSITE_ACCELERATION
      : PLAYER_INPUT_AXIS_ACCELERATION;
  const next = approachScalar(current, target, rate, dt);
  return Math.abs(next) < 0.001 && target === 0 ? 0 : clamp(next, -1, 1);
}

class UnsoccerServer {
  private readonly app = express();
  private readonly httpServer = http.createServer(this.app);
  private websocketEnabled = false;

  private world!: RAPIER.World;
  private ballBody!: RAPIER.RigidBody;
  private readonly players = new Map<string, PlayerRuntime>();
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
  private readonly startedAt = Date.now();
  private currentWeatherIndex = 0;
  private nextWeatherChangeAt = this.startedAt + this.randomWeatherDelayMs();
  private testDayTimeOverrideSeconds: number | null = null;
  private activeBallVariant = 0;
  private goalReset: GoalResetRuntime | null = null;

  async start(): Promise<void> {
    await RAPIER.init();
    this.createPhysicsWorld();
    this.configureHttp();
    this.configureWebSocket();
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

  private configureHttp(): void {
    this.app.use(express.json({ limit: "32kb" }));
    this.app.get("/api/health", (_request, response) => {
      response.json(this.serverInfo());
    });
    this.app.post("/api/join", (request, response) => {
      if (this.players.size >= MAX_ROOM_CLIENTS) {
        response.status(409).json({ ok: false, error: "server-full", maxRoomClients: MAX_ROOM_CLIENTS });
        return;
      }
      const body = this.requestBody(request);
      const runtime = this.createRuntime({
        id: `http-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: sanitizePlayerName(body.name),
        channel: null,
        transport: "http"
      });
      this.players.set(runtime.id, runtime);
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
      if (player && player.transport === "http") {
        this.pushRosterAudioEvent(player, "leave");
        this.destroyBody(player);
        this.players.delete(player.id);
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
      this.resetMatch(Date.now());
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
      const presetIndex = WEATHER_PRESETS.findIndex((preset) => preset.kind === kind);
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
        this.testDayTimeOverrideSeconds = this.numberField(body.dayTimeSeconds, DAY_START_SECONDS, 0, 24 * 60 * 60 - 1);
      }
      response.json({ ok: true, state: this.snapshot() });
    });

    this.app.post("/api/test/tick", (request, response) => {
      if (!this.allowTestRequest(request, response)) return;
      const body = this.requestBody(request);
      const frames = this.numberField(body.frames, 1, 1, SERVER_TICK_RATE * 10);
      let now = Date.now();
      for (let frame = 0; frame < frames; frame += 1) {
        now += 1000 / SERVER_TICK_RATE;
        this.tick(now, false);
      }
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
    return { x: 0, y: 3, z: FIELD_LENGTH / 2 + 4 + player.index };
  }

  private ballSpeed(): number {
    const velocity = this.ballBody.linvel();
    return Math.hypot(velocity.x, velocity.y, velocity.z);
  }

  private randomWeatherDelayMs(): number {
    return WEATHER_CHANGE_MIN_MS + Math.floor(Math.random() * (WEATHER_CHANGE_MAX_MS - WEATHER_CHANGE_MIN_MS + 1));
  }

  private randomWeatherIndex(previousIndex: number): number {
    const totalWeight = WEATHER_PRESETS.reduce((sum, _preset, index) => (
      index === previousIndex ? sum : sum + (WEATHER_PICK_WEIGHTS[index] || 1)
    ), 0);
    let cursor = Math.random() * totalWeight;
    for (let index = 0; index < WEATHER_PRESETS.length; index += 1) {
      if (index === previousIndex) continue;
      cursor -= WEATHER_PICK_WEIGHTS[index] || 1;
      if (cursor <= 0) return index;
    }
    return previousIndex === 1 ? 0 : 1;
  }

  private updateWeather(now: number): void {
    if (now < this.nextWeatherChangeAt) return;
    const previousIndex = this.currentWeatherIndex;
    const nextIndex = WEATHER_PRESETS.length > 1 ? this.randomWeatherIndex(previousIndex) : previousIndex;
    this.currentWeatherIndex = nextIndex;
    this.nextWeatherChangeAt = now + this.randomWeatherDelayMs();
    this.message = `\u041f\u043e\u0433\u043e\u0434\u0430: ${WEATHER_PRESETS[nextIndex].label}`;
  }

  private currentWeather(now = Date.now()): WeatherSnapshot {
    const preset = WEATHER_PRESETS[this.currentWeatherIndex] || WEATHER_PRESETS[0];
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
    const dayAdvanceSeconds = elapsedSeconds / DAY_CYCLE_SECONDS * 24 * 60 * 60;
    return (DAY_START_SECONDS + dayAdvanceSeconds) % (24 * 60 * 60);
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
    for (const player of this.players.values()) {
      this.destroyBody(player);
    }
    this.players.clear();
    this.joinCounter = 0;
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
  }): PlayerRuntime {
    return {
      id: options.id,
      name: options.name,
      role: "spectator",
      team: null,
      index: this.players.size,
      joinOrder: this.joinCounter++,
      characterId: this.nextCharacterId(),
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
      lastKickRight: 0,
      nextHandSide: 1,
      lastHead: 0,
      lastJump: 0,
      lastBodyAt: 0,
      lastJumpAt: 0,
      lastAction: null,
      lastActionAt: 0,
      celebration: null,
      celebrationAt: 0,
      celebrationAvailableUntil: 0,
      lastAudioRole: null,
      yaw: 0,
      velocity: zeroVec(),
      pushVelocity: zeroVec(),
      stamina: PLAYER_STAMINA_MAX,
      staminaRecoveryBlockedUntil: 0,
      sprinting: false,
      exhausted: false,
      ragdoll: false,
      ragdollAt: 0,
      ragdollVelocity: zeroVec(),
      grounded: true,
      verticalVelocity: 0,
      lastSeenAt: Date.now()
    };
  }

  private resetMatch(now: number): void {
    this.score.blue = 0;
    this.score.orange = 0;
    this.goalReset = null;
    this.resetBall(now);
    this.countdownUntil = 0;
    this.lastCountdownAudioSecond = null;
    this.message = "\u0416\u0434\u0451\u043c \u0438\u0433\u0440\u043e\u043a\u043e\u0432";
    for (const player of this.players.values()) {
      player.input = { ...DEFAULT_INPUT };
      player.inputSequence = 0;
      player.lastKickAt = 0;
      player.lastHeadAt = 0;
      player.lastKickLeft = 0;
      player.lastKickLeftHeld = false;
      player.leftKickChargeStartedAt = -1;
      player.leftKickChargeHeldMs = 0;
      player.kickLeftHoldConsumed = false;
      player.lastKickRight = 0;
      player.lastHead = 0;
      player.lastJump = 0;
      player.lastBodyAt = 0;
      player.lastJumpAt = 0;
      player.lastAction = null;
      player.lastActionAt = 0;
      player.celebration = null;
      player.celebrationAt = 0;
      player.celebrationAvailableUntil = 0;
      player.lastAudioRole = null;
      player.velocity = zeroVec();
      player.moveAxis = { x: 0, z: 0 };
      player.moveVelocity = zeroVec();
      player.pushVelocity = zeroVec();
      player.stamina = PLAYER_STAMINA_MAX;
      player.staminaRecoveryBlockedUntil = 0;
      player.sprinting = false;
      player.exhausted = false;
      player.ragdoll = false;
      player.ragdollAt = 0;
      player.ragdollVelocity = zeroVec();
      player.grounded = true;
      player.verticalVelocity = 0;
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
      if (Number.isFinite(stamina)) player.stamina = clamp(stamina, 0, PLAYER_STAMINA_MAX);
      player.exhausted = player.stamina <= 0.01 || player.exhausted && player.stamina < PLAYER_EXHAUSTED_RECOVERY_THRESHOLD;
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
      RAPIER.ColliderDesc.cuboid(FIELD_WIDTH / 2 + 1, 0.2, FIELD_LENGTH / 2 + 1)
        .setTranslation(0, -0.2, 0)
        .setFriction(1.2),
      ground
    );

    this.ballBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, BALL_RADIUS + 0.04, 0)
        .setLinearDamping(0.8)
        .setAngularDamping(0.45)
        .setCanSleep(false)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setRestitution(BALL_RESTITUTION)
        .setFriction(0.78)
        .setDensity(BALL_DENSITY),
      this.ballBody
    );
  }

  private onConnection(channel: TransportChannel): void {
    const id = channel.id;
    let runtime: PlayerRuntime | null = null;

    channel.on("join", (data: unknown) => {
      const request = data as JoinRequest;
      let firstJoin = false;
      if (!runtime) {
        if (this.players.size >= MAX_ROOM_CLIENTS) {
          channel.emit("server-full", { maxRoomClients: MAX_ROOM_CLIENTS });
          channel.close();
          return;
        }
        runtime = this.createRuntime({
          id,
          name: sanitizePlayerName(request?.name),
          channel,
          transport: "websocket"
        });
        this.players.set(id, runtime);
        this.rebalanceRoles();
        firstJoin = true;
      }
      runtime.name = sanitizePlayerName(request?.name);
      if (!firstJoin) this.sendJoin(runtime);
      this.message = `${runtime.name} \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u043b\u0441\u044f ${runtime.role === "player" ? "\u043a \u043f\u043e\u043b\u044e" : "\u043a\u0430\u043a \u043d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u0435\u043b\u044c"}`;
    });

    channel.on("input", (data: unknown) => {
      if (!runtime) return;
      const message = data as ClientInputMessage;
      if (!message || typeof message.sequence !== "number") return;
      if (message.sequence < runtime.inputSequence) return;
      runtime.input = cloneInput(message.input || DEFAULT_INPUT);
      runtime.inputSequence = message.sequence;
      runtime.lastSeenAt = Date.now();
    });

    channel.onDisconnect(() => {
      if (!runtime) return;
      this.pushRosterAudioEvent(runtime, "leave");
      this.destroyBody(runtime);
      this.players.delete(id);
      this.rebalanceRoles();
      this.message = `${runtime.name} \u0432\u044b\u0448\u0435\u043b`;
    });
  }

  private rebalanceRoles(): void {
    const ordered = [...this.players.values()].sort((a, b) => a.joinOrder - b.joinOrder);
    const now = Date.now();
    ordered.forEach((player, orderIndex) => {
      const previousRole = player.lastAudioRole;
      const active = orderIndex < MAX_ACTIVE_PLAYERS;
      player.role = active ? "player" : "spectator";
      player.index = orderIndex;
      player.team = active ? ((orderIndex % 2) as TeamId) : null;
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
      RAPIER.ColliderDesc.capsule((PLAYER_HEIGHT - PLAYER_RADIUS * 2) / 2, PLAYER_RADIUS)
        .setFriction(1.1)
        .setRestitution(0.05)
        .setSensor(true),
      player.body
    );
  }

  private destroyBody(player: PlayerRuntime): void {
    if (!player.body) return;
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
      characterId: player.characterId,
      version: GAME_VERSION,
      maxActivePlayers: MAX_ACTIVE_PLAYERS,
      maxRoomClients: MAX_ROOM_CLIENTS
    };
  }

  private spawnForIndex(index: number): Vec3 {
    const team = index % 2;
    const row = Math.floor(index / 2);
    return {
      x: row === 0 ? -3.2 : 3.2,
      y: PLAYER_HEIGHT / 2,
      z: team === 0 ? -FIELD_LENGTH * 0.24 : FIELD_LENGTH * 0.24
    };
  }

  private tick(now = Date.now(), emitSnapshot = true): void {
    const dt = 1 / SERVER_TICK_RATE;
    this.tickCount += 1;
    this.cleanupStaleHttpPlayers(now);
    this.updateWeather(now);

    for (const player of this.players.values()) {
      this.updatePlayer(player, dt, now);
    }

    const previousBallTranslation = this.ballBody.translation();
    const previousBallPosition = {
      x: previousBallTranslation.x,
      y: previousBallTranslation.y,
      z: previousBallTranslation.z
    };
    this.world.timestep = dt;
    this.world.step();
    this.containBall();
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

  private cleanupStaleHttpPlayers(now: number): void {
    let changed = false;
    for (const player of this.players.values()) {
      if (player.transport !== "http") continue;
      if (now - player.lastSeenAt < 30000) continue;
      this.pushRosterAudioEvent(player, "leave", now);
      this.destroyBody(player);
      this.players.delete(player.id);
      changed = true;
    }
    if (changed) {
      this.rebalanceRoles();
      this.message = "\u0418\u0433\u0440\u043e\u043a \u0432\u044b\u0448\u0435\u043b";
    }
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
    const groundY = PLAYER_HEIGHT / 2;

    if (now >= player.staminaRecoveryBlockedUntil) {
      player.stamina = Math.min(PLAYER_STAMINA_MAX, player.stamina + PLAYER_STAMINA_RECOVERY_PER_SECOND * dt);
    }

    player.ragdollVelocity.y -= PLAYER_GRAVITY * dt;
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
    const decay = Math.exp(-dt * PLAYER_RAGDOLL_FRICTION_PER_SECOND);
    player.ragdollVelocity.x *= decay;
    player.ragdollVelocity.z *= decay;
    if (Math.abs(player.ragdollVelocity.x) < 0.025) player.ragdollVelocity.x = 0;
    if (Math.abs(player.ragdollVelocity.z) < 0.025) player.ragdollVelocity.z = 0;

    player.body.setNextKinematicTranslation(next);
    if (
      player.grounded &&
      now - player.ragdollAt >= PLAYER_RAGDOLL_MIN_MS &&
      player.stamina >= PLAYER_EXHAUSTED_RECOVERY_THRESHOLD &&
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
    const groundY = PLAYER_HEIGHT / 2;
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
      player.stamina = Math.max(0, player.stamina - PLAYER_STAMINA_SPRINT_DRAIN_PER_SECOND * dt);
      player.staminaRecoveryBlockedUntil = now + PLAYER_STAMINA_RECOVERY_DELAY_MS;
      if (player.stamina <= 0.01) this.beginRagdoll(player, now);
    } else if (now >= player.staminaRecoveryBlockedUntil) {
      player.stamina = Math.min(PLAYER_STAMINA_MAX, player.stamina + PLAYER_STAMINA_RECOVERY_PER_SECOND * dt);
      if (player.exhausted && player.stamina >= PLAYER_EXHAUSTED_RECOVERY_THRESHOLD) player.exhausted = false;
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
      player.verticalVelocity -= PLAYER_GRAVITY * dt;
    }
    let y = current.y + player.verticalVelocity * dt;
    if (y <= groundY) {
      y = groundY;
      player.verticalVelocity = 0;
      player.grounded = true;
    } else {
      player.grounded = false;
    }

    const staminaSpeed = player.exhausted ? PLAYER_EXHAUSTED_SPEED_MULTIPLIER : canSprint ? PLAYER_SPRINT_MULTIPLIER : 1;
    const airSpeed = player.grounded ? 1 : PLAYER_AIR_CONTROL_MULTIPLIER;
    const weatherSpeed = PLAYER_SPEED * staminaSpeed * airSpeed * environment.playerSpeedMultiplier;
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
      ? PLAYER_MOVEMENT_DECELERATION
      : velocityDot < -0.05
        ? PLAYER_MOVEMENT_TURN_ACCELERATION
        : PLAYER_MOVEMENT_ACCELERATION;
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
    if (controlledMoving) player.yaw = Math.atan2(player.moveVelocity.x, player.moveVelocity.z);
    else player.yaw = player.input.yaw;

    player.body.setNextKinematicTranslation(resolvedNext);
    this.processBodyContact(player, now, resolvedNext);
    this.processKick(player, now, dt);
  }

  private tryJump(player: PlayerRuntime, now: number): void {
    if (!player.body || !player.grounded) return;
    if (player.ragdoll) return;
    if (now - player.lastJumpAt < PLAYER_JUMP_COOLDOWN_MS) return;
    if (player.stamina < PLAYER_STAMINA_JUMP_COST) return;
    player.lastJumpAt = now;
    player.stamina = Math.max(0, player.stamina - PLAYER_STAMINA_JUMP_COST);
    player.staminaRecoveryBlockedUntil = now + PLAYER_STAMINA_RECOVERY_DELAY_MS;
    player.verticalVelocity = PLAYER_JUMP_STRENGTH;
    player.grounded = false;
    player.lastAction = "jump";
    player.lastActionAt = now;
    this.pushAudioEvent(now, {
      kind: "kick",
      kick: "jump",
      playerId: player.id,
      position: this.runtimePosition(player),
      speed: PLAYER_JUMP_STRENGTH
    });
    if (player.stamina <= 0.01) this.beginRagdoll(player, now);
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
      const safeRadius = hazard.radius + PLAYER_RADIUS * 0.84;
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
    if (now - player.lastBodyAt < BODY_BUMP_COOLDOWN_MS) return;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    if (speed < BODY_BUMP_MIN_SPEED) return;

    const playerPosition = nextPosition || vec3FromRapier(player.body.translation());
    const ballPosition = this.ballBody.translation();
    const dx = ballPosition.x - playerPosition.x;
    const dz = ballPosition.z - playerPosition.z;
    const distance = Math.hypot(dx, dz);
    if (distance > BODY_BUMP_RANGE + BALL_RADIUS || distance < 0.001) return;
    if (!ballOverlapsPlayerBodyHeight(playerPosition, vec3FromRapier(ballPosition))) return;

    const directionX = distance > 0.01 ? dx / distance : Math.sin(player.yaw);
    const directionZ = distance > 0.01 ? dz / distance : Math.cos(player.yaw);
    const approachSpeed = player.velocity.x * directionX + player.velocity.z * directionZ;
    if (approachSpeed < BODY_BUMP_MIN_SPEED * 0.62) return;

    const strength = BODY_BUMP_STRENGTH + Math.min(1.1, approachSpeed * 0.12);
    this.ballBody.applyImpulse(
      {
        x: directionX * strength + player.velocity.x * 0.08,
        y: 0.1,
        z: directionZ * strength + player.velocity.z * 0.08
      },
      true
    );
    player.lastBodyAt = now;
    player.lastAction = "body";
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

  private processKick(player: PlayerRuntime, now: number, dt: number): void {
    const leftHeld = Boolean(player.input.kickLeftHeld);
    if (leftHeld && !player.lastKickLeftHeld) {
      player.leftKickChargeStartedAt = now;
      player.leftKickChargeHeldMs = 0;
      player.kickLeftHoldConsumed = false;
    }
    if (leftHeld) {
      player.leftKickChargeHeldMs = Math.min(
        LEFT_KICK_CHARGE_SECONDS * 1000,
        player.leftKickChargeHeldMs + dt * 1000
      );
    }
    const leftKickCharge = player.leftKickChargeStartedAt >= 0 || player.leftKickChargeHeldMs > 0
      ? leftKickChargeFractionFromHeldMs(player.leftKickChargeHeldMs)
      : 0;
    if (leftHeld && !player.kickLeftHoldConsumed) {
      if (this.tryKick(player, "left", now, {
        charge: leftKickCharge,
        requireBallContact: true
      })) {
        player.kickLeftHoldConsumed = true;
      }
    }

    if (player.input.kickLeft > player.lastKickLeft) {
      player.lastKickLeft = player.input.kickLeft;
      if (this.tryCelebration(player, "celebrate1", now)) {
        if (!leftHeld && player.lastKickLeftHeld) {
          player.leftKickChargeStartedAt = -1;
          player.leftKickChargeHeldMs = 0;
          player.kickLeftHoldConsumed = false;
        }
        player.lastKickLeftHeld = leftHeld;
        return;
      }
      if (!player.kickLeftHoldConsumed) {
        this.tryKick(player, "left", now, { charge: leftKickCharge });
      }
      player.kickLeftHoldConsumed = false;
    }
    if (!leftHeld && player.lastKickLeftHeld) {
      player.leftKickChargeStartedAt = -1;
      player.leftKickChargeHeldMs = 0;
      player.kickLeftHoldConsumed = false;
    }
    player.lastKickLeftHeld = leftHeld;
    if (player.input.kickRight > player.lastKickRight) {
      player.lastKickRight = player.input.kickRight;
      if (this.tryCelebration(player, "celebrate2", now)) return;
      this.tryKick(player, "hand", now);
    }
    if (player.input.head > player.lastHead) {
      player.lastHead = player.input.head;
      if (this.tryCelebration(player, "celebrate3", now)) return;
      this.tryKick(player, "head", now);
    }
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
    options: { charge?: number; requireBallContact?: boolean } = {}
  ): boolean {
    if (!player.body) return false;
    if (player.ragdoll) return false;
    if (kind === "jump" || kind === "body") return false;
    if (this.goalReset) return false;

    const playerPosition = player.body.translation();
    const ballPosition = this.ballBody.translation();
    const forwardX = Math.sin(player.yaw);
    const forwardZ = Math.cos(player.yaw);
    const sideX = Math.cos(player.yaw);
    const sideZ = -Math.sin(player.yaw);
    const side = kind === "left" ? -1 : kind === "hand" ? player.nextHandSide : 0;
    const contact = kind === "head"
      ? {
          x: playerPosition.x + forwardX * 0.18,
          y: playerPosition.y + HEAD_CONTACT_HEIGHT_FROM_CENTER,
          z: playerPosition.z + forwardZ * 0.18
        }
      : kind === "hand"
        ? {
            x: playerPosition.x + sideX * 0.36 + forwardX * 0.42,
            y: playerPosition.y + HAND_CONTACT_HEIGHT_FROM_CENTER,
            z: playerPosition.z + sideZ * 0.36 + forwardZ * 0.42
          }
      : {
          x: playerPosition.x + sideX * side * 0.34 + forwardX * 0.28,
          y: playerPosition.y - PLAYER_HEIGHT / 2 + FOOT_CONTACT_HEIGHT_FROM_GROUND,
          z: playerPosition.z + sideZ * side * 0.34 + forwardZ * 0.28
        };
    const dx = ballPosition.x - contact.x;
    const dy = ballPosition.y - contact.y;
    const dz = ballPosition.z - contact.z;
    const distance = Math.hypot(dx, dz);
    const ballInRange = distance <= (kind === "hand" ? KICK_RANGE * 0.82 : KICK_RANGE)
      && Math.abs(dy) <= kickContactVerticalRange(kind);
    if (options.requireBallContact && !ballInRange) return false;
    if (kind === "head") {
      if (now - player.lastHeadAt < HEAD_COOLDOWN_MS) return false;
      player.lastHeadAt = now;
    } else if (kind === "hand") {
      if (now - player.lastKickAt < HAND_COOLDOWN_MS) return false;
      if (player.stamina < PLAYER_STAMINA_HIT_COST) return false;
      player.lastKickAt = now;
      player.stamina = Math.max(0, player.stamina - PLAYER_STAMINA_HIT_COST);
      player.staminaRecoveryBlockedUntil = now + PLAYER_STAMINA_RECOVERY_DELAY_MS;
    } else {
      if (now - player.lastKickAt < KICK_COOLDOWN_MS) return false;
      if (player.stamina < PLAYER_STAMINA_HIT_COST) return false;
      player.lastKickAt = now;
      player.stamina = Math.max(0, player.stamina - PLAYER_STAMINA_HIT_COST);
      player.staminaRecoveryBlockedUntil = now + PLAYER_STAMINA_RECOVERY_DELAY_MS;
    }
    let acted = false;

    if (ballInRange) {
      const aimX = forwardX;
      const aimZ = forwardZ;
      const aimMagnitude = Math.hypot(aimX, aimZ) || 1;
      const airborneHead = kind === "head" && !player.grounded;
      const strength = kind === "head"
        ? HEAD_KICK_STRENGTH * (airborneHead ? 1.14 : 1)
        : kind === "hand"
          ? HAND_HIT_STRENGTH
          : FOOT_KICK_STRENGTH;
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
      acted = true;
    }

    acted = this.applyPlayerHit(player, kind, now, { x: forwardX, z: forwardZ }) || acted;
    if (!acted) return false;
    if (kind === "hand") player.nextHandSide = player.nextHandSide === 1 ? -1 : 1;

    player.lastAction = kind;
    player.lastActionAt = now;
    this.pushAudioEvent(now, {
      kind: "kick",
      kick: kind,
      playerId: player.id,
      position: this.runtimePosition(player),
      speed: Math.max(kind === "head" ? HEAD_KICK_STRENGTH : kind === "hand" ? HAND_HIT_STRENGTH : FOOT_KICK_STRENGTH, this.ballSpeed())
    });
    this.message = `${player.name} ${this.actionLabel(kind)}`;
    if (player.stamina <= 0.01) {
      this.beginRagdoll(player, now, {
        x: forwardX * 1.1,
        y: 0.45,
        z: forwardZ * 1.1
      });
    }
    return true;
  }

  private applyPlayerHit(
    attacker: PlayerRuntime,
    kind: KickKind,
    now: number,
    forward: { x: number; z: number }
  ): boolean {
    if (!attacker.body || kind === "body" || kind === "jump") return false;
    const origin = attacker.body.translation();
    const range = kind === "left" ? 1.62 : kind === "hand" ? 1.38 : 1.42;
    const cone = kind === "hand" ? 0.44 : 0.32;
    let hit = false;
    for (const target of this.players.values()) {
      if (target.id === attacker.id || target.role !== "player" || !target.body) continue;
      const targetPosition = target.body.translation();
      const dx = targetPosition.x - origin.x;
      const dz = targetPosition.z - origin.z;
      const distance = Math.hypot(dx, dz);
      if (distance > range || distance < 0.001) continue;
      const alignment = (dx / distance) * forward.x + (dz / distance) * forward.z;
      if (alignment < cone) continue;
      const airborneHead = kind === "head" && !attacker.grounded;
      const damage = kind === "left"
        ? FOOT_PLAYER_STAMINA_DAMAGE
        : kind === "hand"
          ? HAND_PLAYER_STAMINA_DAMAGE
          : HEAD_PLAYER_STAMINA_DAMAGE + (airborneHead ? AIRBORNE_HEAD_STAMINA_DAMAGE_BONUS : 0);
      const staminaBeforeHit = target.stamina;
      target.stamina = Math.max(0, target.stamina - damage);
      target.staminaRecoveryBlockedUntil = now + PLAYER_HIT_RECOVERY_DELAY_MS;
      if (target.stamina <= 0.01) target.exhausted = true;
      target.lastAction = "body";
      target.lastActionAt = now;
      if (staminaBeforeHit > 0.01 && target.stamina <= 0.01) {
        const knockoutPower = PLAYER_RAGDOLL_HIT_KNOCKBACK * (kind === "hand" ? 1.12 : kind === "head" ? 1.05 : 0.96);
        this.beginRagdoll(target, now, {
          x: forward.x * knockoutPower + attacker.velocity.x * 0.22,
          y: PLAYER_RAGDOLL_VERTICAL_KNOCKBACK,
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

  private actionLabel(kind: KickKind): string {
    if (kind === "left") return "\u0443\u0434\u0430\u0440\u0438\u043b \u043b\u0435\u0432\u043e\u0439 \u043d\u043e\u0433\u043e\u0439";
    if (kind === "hand") return "\u0443\u0434\u0430\u0440\u0438\u043b \u0440\u0443\u043a\u043e\u0439";
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
      player.celebrationAvailableUntil = now + CELEBRATION_WINDOW_MS;
    }
  }

  private kickoffBallPosition(): Vec3 {
    return { x: 0, y: BALL_RADIUS + 0.04, z: 0 };
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
      returnStartAt: now + POST_GOAL_CELEBRATION_MS,
      returnEndAt: now + POST_GOAL_CELEBRATION_MS + POST_GOAL_BALL_RETURN_MS,
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
    const rawProgress = (now - sequence.returnStartAt) / POST_GOAL_BALL_RETURN_MS;
    const progress = easeOutCubic(rawProgress);
    const nextPosition = {
      x: lerp(sequence.returnFrom.x, target.x, progress),
      y: lerp(sequence.returnFrom.y, target.y, progress),
      z: lerp(sequence.returnFrom.z, target.z, progress)
    };
    this.ballBody.setTranslation(nextPosition, true);
    this.ballBody.setLinvel({
      x: (target.x - sequence.returnFrom.x) / (POST_GOAL_BALL_RETURN_MS / 1000),
      y: (target.y - sequence.returnFrom.y) / (POST_GOAL_BALL_RETURN_MS / 1000),
      z: (target.z - sequence.returnFrom.z) / (POST_GOAL_BALL_RETURN_MS / 1000)
    }, true);
    this.ballBody.setAngvel(zeroVec(), true);

    if (rawProgress < 1) return true;

    this.ballBody.setTranslation(target, true);
    this.ballBody.setLinvel(zeroVec(), true);
    this.ballBody.setAngvel(zeroVec(), true);
    this.activeBallVariant = (this.activeBallVariant + 1) % BALL_VARIANT_COUNT;
    this.countdownUntil = now + KICKOFF_COUNTDOWN_MS;
    this.goalReset = null;
    this.message = "\u0420\u043e\u0437\u044b\u0433\u0440\u044b\u0448 \u0441 \u0446\u0435\u043d\u0442\u0440\u0430";
    return true;
  }

  private containBall(): void {
    const position = this.ballBody.translation();
    const velocity = this.ballBody.linvel();
    let nextPosition = { x: position.x, y: Math.max(position.y, BALL_RADIUS), z: position.z };
    let nextVelocity = { x: velocity.x * 0.997, y: velocity.y, z: velocity.z * 0.997 };
    const halfWidth = FIELD_WIDTH / 2 - BALL_RADIUS;
    const halfLength = FIELD_LENGTH / 2 + GOAL_DEPTH;
    const environment = this.environmentAt(nextPosition);
    const weather = this.currentWeather();
    nextVelocity.x = nextVelocity.x * environment.ballDrag + weather.wind.x * weather.intensity * 0.004;
    nextVelocity.z = nextVelocity.z * environment.ballDrag + weather.wind.z * weather.intensity * 0.004;

    if (Math.abs(nextPosition.x) > halfWidth) {
      nextPosition.x = clamp(nextPosition.x, -halfWidth, halfWidth);
      nextVelocity.x *= -BALL_RESTITUTION;
    }
    if (Math.abs(nextPosition.z) > halfLength) {
      nextPosition.z = clamp(nextPosition.z, -halfLength, halfLength);
      nextVelocity.z *= -BALL_RESTITUTION;
    }
    if (nextPosition.y <= BALL_RADIUS && nextVelocity.y < 0) {
      nextVelocity.y *= -0.72;
    }

    this.resolveGoalPostBounce(nextPosition, nextVelocity);

    for (const hazard of weather.hazards) {
      if (hazard.type !== "snowbank") continue;
      const dx = nextPosition.x - hazard.position.x;
      const dz = nextPosition.z - hazard.position.z;
      const distance = Math.hypot(dx, dz);
      const safeRadius = hazard.radius + BALL_RADIUS;
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

  private resolveGoalPostBounce(nextPosition: Vec3, nextVelocity: Vec3): void {
    const goalZs = [-FIELD_LENGTH / 2, FIELD_LENGTH / 2];
    for (const goalZ of goalZs) {
      for (const postX of [-GOAL_WIDTH / 2, GOAL_WIDTH / 2]) {
        const dx = nextPosition.x - postX;
        const dz = nextPosition.z - goalZ;
        const distance = Math.hypot(dx, dz);
        const safeRadius = GOAL_POST_RADIUS + BALL_RADIUS;
        if (distance >= safeRadius || distance < 0.001 || nextPosition.y > GOAL_CROSSBAR_HEIGHT + BALL_RADIUS) continue;
        const nx = dx / distance;
        const nz = dz / distance;
        const approach = nextVelocity.x * nx + nextVelocity.z * nz;
        nextPosition.x = postX + nx * safeRadius;
        nextPosition.z = goalZ + nz * safeRadius;
        if (approach < 0) {
          nextVelocity.x -= approach * nx * (1 + BALL_RESTITUTION);
          nextVelocity.z -= approach * nz * (1 + BALL_RESTITUTION);
          nextVelocity.y = Math.max(nextVelocity.y, 0.55);
        }
      }
      const inCrossbarX = Math.abs(nextPosition.x) <= GOAL_WIDTH / 2 + GOAL_POST_RADIUS;
      const nearGoalPlane = Math.abs(nextPosition.z - goalZ) <= GOAL_POST_RADIUS + BALL_RADIUS;
      const nearCrossbarY = Math.abs(nextPosition.y - GOAL_CROSSBAR_HEIGHT) <= GOAL_CROSSBAR_RADIUS + BALL_RADIUS;
      if (inCrossbarX && nearGoalPlane && nearCrossbarY && nextVelocity.y > 0) {
        nextPosition.y = GOAL_CROSSBAR_HEIGHT - GOAL_CROSSBAR_RADIUS - BALL_RADIUS;
        nextVelocity.y *= -BALL_RESTITUTION;
        nextVelocity.z *= 0.92;
      }
    }
  }

  private checkGoal(previousPosition: Vec3, now: number): void {
    const position = this.ballBody.translation();
    if (this.didCrossGoalFace(previousPosition, position, -FIELD_LENGTH / 2, -1)) {
      this.score.orange += 1;
      this.message = "\u041e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442";
      this.pushAudioEvent(now, { kind: "goal", team: 1 });
      this.startGoalReset(1, now);
    } else if (this.didCrossGoalFace(previousPosition, position, FIELD_LENGTH / 2, 1)) {
      this.score.blue += 1;
      this.message = "\u0421\u0438\u043d\u0438\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442";
      this.pushAudioEvent(now, { kind: "goal", team: 0 });
      this.startGoalReset(0, now);
    }
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
    return Math.abs(crossingX) <= GOAL_WIDTH / 2 && crossingY <= GOAL_CROSSBAR_HEIGHT + BALL_RADIUS;
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
    this.ballBody.setTranslation(this.kickoffBallPosition(), true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.activeBallVariant = (this.activeBallVariant + 1) % BALL_VARIANT_COUNT;
    this.countdownUntil = now + KICKOFF_COUNTDOWN_MS;
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
          ? clamp((now - this.goalReset.returnStartAt) / POST_GOAL_BALL_RETURN_MS, 0, 1)
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
      variant: this.activeBallVariant
    };
    return {
      version: GAME_VERSION,
      serverTime: now,
      dayTimeSeconds: this.dayTimeSeconds(now),
      tick: this.tickCount,
      players: [...this.players.values()]
        .sort((a, b) => a.index - b.index)
        .map((player) => this.snapshotPlayer(player)),
      ball,
      score: { ...this.score },
      message: this.message,
      countdown: Math.max(0, this.countdownUntil - now),
      goalReset: this.snapshotGoalReset(now),
      weather: this.currentWeather(now),
      audioEvents: this.audioEvents.slice()
    };
  }

  private snapshotPlayer(player: PlayerRuntime): PlayerSnapshot {
    const position = player.body ? vec3FromRapier(player.body.translation()) : { x: 0, y: 3, z: FIELD_LENGTH / 2 + 4 + player.index };
    return {
      id: player.id,
      name: player.name,
      role: player.role,
      team: player.team,
      index: player.index,
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
      lastActionAt: player.lastActionAt,
      celebration: player.celebration,
      celebrationAt: player.celebrationAt,
      celebrationAvailableUntil: player.celebrationAvailableUntil
    };
  }

  private serverInfo(): ServerInfo {
    let activePlayers = 0;
    for (const player of this.players.values()) {
      if (player.role === "player") activePlayers += 1;
    }
    return {
      ok: true,
      version: GAME_VERSION,
      activePlayers,
      connectedClients: this.players.size,
      maxActivePlayers: MAX_ACTIVE_PLAYERS,
      maxRoomClients: MAX_ROOM_CLIENTS,
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
