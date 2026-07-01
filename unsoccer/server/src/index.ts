import crypto from "node:crypto";
import http from "node:http";
import type { Duplex } from "node:stream";
import express, { type Request, type Response } from "express";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  AIRBORNE_HEAD_STAMINA_DAMAGE_BONUS,
  BALL_RADIUS,
  BALL_RESTITUTION,
  BODY_BUMP_COOLDOWN_MS,
  BODY_BUMP_MIN_SPEED,
  BODY_BUMP_RANGE,
  BODY_BUMP_STRENGTH,
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
  KICK_COOLDOWN_MS,
  KICK_RANGE,
  MAX_ACTIVE_PLAYERS,
  MAX_ROOM_CLIENTS,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_AIR_CONTROL_MULTIPLIER,
  PLAYER_EXHAUSTED_RECOVERY_THRESHOLD,
  PLAYER_EXHAUSTED_SPEED_MULTIPLIER,
  PLAYER_GRAVITY,
  PLAYER_JUMP_COOLDOWN_MS,
  PLAYER_JUMP_STRENGTH,
  PLAYER_SPRINT_MULTIPLIER,
  PLAYER_STAMINA_HIT_COST,
  PLAYER_STAMINA_JUMP_COST,
  PLAYER_STAMINA_MAX,
  PLAYER_STAMINA_RECOVERY_DELAY_MS,
  PLAYER_STAMINA_RECOVERY_PER_SECOND,
  PLAYER_STAMINA_SPRINT_DRAIN_PER_SECOND,
  SERVER_TICK_RATE,
  SNAPSHOT_RATE,
  type BallSnapshot,
  type ClientInputMessage,
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
  lastKickAt: number;
  lastHeadAt: number;
  lastKickLeft: number;
  lastKickRight: number;
  lastHead: number;
  lastJump: number;
  lastBodyAt: number;
  lastJumpAt: number;
  lastAction: KickKind | null;
  lastActionAt: number;
  lastAudioRole: PlayerRole | null;
  yaw: number;
  velocity: Vec3;
  pushVelocity: Vec3;
  stamina: number;
  staminaRecoveryBlockedUntil: number;
  sprinting: boolean;
  exhausted: boolean;
  grounded: boolean;
  verticalVelocity: number;
  lastSeenAt: number;
}

const PORT = Number(process.env.UNSOCCER_PORT || 8787);
const TEST_MODE = process.env.UNSOCCER_TEST_MODE === "1";
const TEST_TOKEN = process.env.UNSOCCER_TEST_TOKEN || "";
const AUDIO_EVENT_LIMIT = 80;
const AUDIO_EVENT_TTL_MS = 5000;
const WEATHER_CHANGE_MIN_MS = 60000;
const WEATHER_CHANGE_MAX_MS = 120000;
const PLAYER_HIT_RECOVERY_DELAY_MS = 600;
const GOAL_POST_RADIUS = 0.28;
const GOAL_CROSSBAR_HEIGHT = 2.18;
const GOAL_CROSSBAR_RADIUS = 0.22;
const BALL_VARIANT_COUNT = 10;

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
    intensity: 0.06,
    wind: { x: 0.04, y: 0, z: -0.02 },
    hazards: []
  },
  {
    kind: "clear",
    label: "\u042f\u0441\u043d\u043e",
    intensity: 0.12,
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

function cloneInput(input: InputState): InputState {
  return {
    up: Boolean(input.up),
    down: Boolean(input.down),
    left: Boolean(input.left),
    right: Boolean(input.right),
    kickLeft: Number(input.kickLeft || 0),
    kickRight: Number(input.kickRight || 0),
    head: Number(input.head || 0),
    jump: Number(input.jump || 0),
    sprint: Boolean(input.sprint),
    yaw: Number.isFinite(input.yaw) ? input.yaw : 0
  };
}

function movementDirection(input: InputState, team: TeamId | null): { x: number; z: number; magnitude: number } {
  const xAxis = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const forwardAxis = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const attackDirection = team === 1 ? -1 : 1;
  const zAxis = forwardAxis * attackDirection;
  const magnitude = Math.hypot(xAxis, zAxis);
  if (magnitude <= 0) return { x: 0, z: 0, magnitude: 0 };
  return {
    x: xAxis / magnitude,
    z: zAxis / magnitude,
    magnitude
  };
}

class UnsoccerServer {
  private readonly app = express();
  private readonly httpServer = http.createServer(this.app);
  private websocketEnabled = false;

  private world!: RAPIER.World;
  private ballBody!: RAPIER.RigidBody;
  private readonly players = new Map<string, PlayerRuntime>();
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
  private activeBallVariant = 0;

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

  private updateWeather(now: number): void {
    if (now < this.nextWeatherChangeAt) return;
    const previousIndex = this.currentWeatherIndex;
    let nextIndex = previousIndex;
    if (WEATHER_PRESETS.length > 1) {
      while (nextIndex === previousIndex) nextIndex = Math.floor(Math.random() * WEATHER_PRESETS.length);
    }
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
      characterId: CHARACTER_ROSTER[0],
      channel: options.channel,
      transport: options.transport,
      input: { ...DEFAULT_INPUT },
      inputSequence: 0,
      body: null,
      lastKickAt: 0,
      lastHeadAt: 0,
      lastKickLeft: 0,
      lastKickRight: 0,
      lastHead: 0,
      lastJump: 0,
      lastBodyAt: 0,
      lastJumpAt: 0,
      lastAction: null,
      lastActionAt: 0,
      lastAudioRole: null,
      yaw: 0,
      velocity: zeroVec(),
      pushVelocity: zeroVec(),
      stamina: PLAYER_STAMINA_MAX,
      staminaRecoveryBlockedUntil: 0,
      sprinting: false,
      exhausted: false,
      grounded: true,
      verticalVelocity: 0,
      lastSeenAt: Date.now()
    };
  }

  private resetMatch(now: number): void {
    this.score.blue = 0;
    this.score.orange = 0;
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
      player.lastKickRight = 0;
      player.lastHead = 0;
      player.lastJump = 0;
      player.lastBodyAt = 0;
      player.lastJumpAt = 0;
      player.lastAction = null;
      player.lastActionAt = 0;
      player.lastAudioRole = null;
      player.velocity = zeroVec();
      player.pushVelocity = zeroVec();
      player.stamina = PLAYER_STAMINA_MAX;
      player.staminaRecoveryBlockedUntil = 0;
      player.sprinting = false;
      player.exhausted = false;
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
    }
    if (body.velocity !== undefined) {
      player.velocity = this.vecField(body.velocity, player.velocity);
    }
    if (body.pushVelocity !== undefined) {
      player.pushVelocity = this.vecField(body.pushVelocity, player.pushVelocity);
    }
    if (body.stamina !== undefined) {
      const stamina = Number(body.stamina);
      if (Number.isFinite(stamina)) player.stamina = clamp(stamina, 0, PLAYER_STAMINA_MAX);
      player.exhausted = player.stamina <= 0.01 || player.exhausted && player.stamina < PLAYER_EXHAUSTED_RECOVERY_THRESHOLD;
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
        .setDensity(0.45),
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
      player.characterId = CHARACTER_ROSTER[orderIndex % CHARACTER_ROSTER.length];
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

    this.world.timestep = dt;
    this.world.step();
    this.containBall();
    this.checkGoal(now);
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

  private updatePlayer(player: PlayerRuntime, dt: number, now: number): void {
    if (!player.body) return;
    const current = player.body.translation();
    const groundY = PLAYER_HEIGHT / 2;
    const currentPoint = { x: current.x, y: current.y, z: current.z };
    const environment = this.environmentAt(currentPoint);
    const movement = movementDirection(player.input, player.team);
    const moving = movement.magnitude > 0.05;
    const canSprint = moving && player.input.sprint && !player.exhausted && player.stamina > 0.5;
    player.sprinting = canSprint;

    if (canSprint) {
      player.stamina = Math.max(0, player.stamina - PLAYER_STAMINA_SPRINT_DRAIN_PER_SECOND * dt);
      player.staminaRecoveryBlockedUntil = now + PLAYER_STAMINA_RECOVERY_DELAY_MS;
      if (player.stamina <= 0.01) player.exhausted = true;
    } else if (now >= player.staminaRecoveryBlockedUntil) {
      player.stamina = Math.min(PLAYER_STAMINA_MAX, player.stamina + PLAYER_STAMINA_RECOVERY_PER_SECOND * dt);
      if (player.exhausted && player.stamina >= PLAYER_EXHAUSTED_RECOVERY_THRESHOLD) player.exhausted = false;
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
    player.pushVelocity.x *= Math.exp(-dt * 4.2);
    player.pushVelocity.z *= Math.exp(-dt * 4.2);
    const next = {
      x: current.x + (movement.x * weatherSpeed + player.pushVelocity.x) * dt,
      y,
      z: current.z + (movement.z * weatherSpeed + player.pushVelocity.z) * dt
    };
    const resolvedNext = this.resolvePlayerHazards(next);

    player.velocity = {
      x: (resolvedNext.x - current.x) / dt,
      y: (resolvedNext.y - current.y) / dt,
      z: (resolvedNext.z - current.z) / dt
    };
    if (movement.magnitude > 0.05) player.yaw = Math.atan2(movement.x, movement.z);
    else player.yaw = player.input.yaw;

    player.body.setNextKinematicTranslation(resolvedNext);
    this.processBodyContact(player, now);
    this.processKick(player, now);
  }

  private tryJump(player: PlayerRuntime, now: number): void {
    if (!player.body || !player.grounded) return;
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

  private processBodyContact(player: PlayerRuntime, now: number): void {
    if (!player.body) return;
    if (now - player.lastBodyAt < BODY_BUMP_COOLDOWN_MS) return;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    if (speed < BODY_BUMP_MIN_SPEED) return;

    const playerPosition = player.body.translation();
    const ballPosition = this.ballBody.translation();
    const dx = ballPosition.x - playerPosition.x;
    const dz = ballPosition.z - playerPosition.z;
    const distance = Math.hypot(dx, dz);
    if (distance > BODY_BUMP_RANGE + BALL_RADIUS || distance < 0.001) return;

    const directionX = distance > 0.01 ? dx / distance : Math.sin(player.yaw);
    const directionZ = distance > 0.01 ? dz / distance : Math.cos(player.yaw);
    const approachSpeed = player.velocity.x * directionX + player.velocity.z * directionZ;
    if (approachSpeed < BODY_BUMP_MIN_SPEED * 0.62) return;

    const strength = BODY_BUMP_STRENGTH + Math.min(1.1, approachSpeed * 0.12);
    this.ballBody.applyImpulse(
      {
        x: directionX * strength + player.velocity.x * 0.08,
        y: 0.28,
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

  private processKick(player: PlayerRuntime, now: number): void {
    if (player.input.kickLeft > player.lastKickLeft) {
      player.lastKickLeft = player.input.kickLeft;
      this.tryKick(player, "left", now);
    }
    if (player.input.kickRight > player.lastKickRight) {
      player.lastKickRight = player.input.kickRight;
      this.tryKick(player, "hand", now);
    }
    if (player.input.head > player.lastHead) {
      player.lastHead = player.input.head;
      this.tryKick(player, "head", now);
    }
  }

  private tryKick(player: PlayerRuntime, kind: KickKind, now: number): void {
    if (!player.body) return;
    if (kind === "jump" || kind === "body") return;
    if (kind === "head") {
      if (now - player.lastHeadAt < HEAD_COOLDOWN_MS) return;
      player.lastHeadAt = now;
    } else if (kind === "hand") {
      if (now - player.lastKickAt < HAND_COOLDOWN_MS) return;
      if (player.stamina < PLAYER_STAMINA_HIT_COST) return;
      player.lastKickAt = now;
      player.stamina = Math.max(0, player.stamina - PLAYER_STAMINA_HIT_COST);
      player.staminaRecoveryBlockedUntil = now + PLAYER_STAMINA_RECOVERY_DELAY_MS;
    } else {
      if (now - player.lastKickAt < KICK_COOLDOWN_MS) return;
      if (player.stamina < PLAYER_STAMINA_HIT_COST) return;
      player.lastKickAt = now;
      player.stamina = Math.max(0, player.stamina - PLAYER_STAMINA_HIT_COST);
      player.staminaRecoveryBlockedUntil = now + PLAYER_STAMINA_RECOVERY_DELAY_MS;
    }

    const playerPosition = player.body.translation();
    const ballPosition = this.ballBody.translation();
    const forwardX = Math.sin(player.yaw);
    const forwardZ = Math.cos(player.yaw);
    const sideX = Math.cos(player.yaw);
    const sideZ = -Math.sin(player.yaw);
    const side = kind === "left" ? -1 : kind === "hand" ? 1 : 0;
    const contact = kind === "head"
      ? {
          x: playerPosition.x + forwardX * 0.18,
          z: playerPosition.z + forwardZ * 0.18
        }
      : kind === "hand"
        ? {
            x: playerPosition.x + sideX * 0.36 + forwardX * 0.42,
            z: playerPosition.z + sideZ * 0.36 + forwardZ * 0.42
          }
      : {
          x: playerPosition.x + sideX * side * 0.34 + forwardX * 0.28,
          z: playerPosition.z + sideZ * side * 0.34 + forwardZ * 0.28
        };
    const dx = ballPosition.x - contact.x;
    const dz = ballPosition.z - contact.z;
    const distance = Math.hypot(dx, dz);
    const ballInRange = distance <= (kind === "hand" ? KICK_RANGE * 0.82 : KICK_RANGE);
    let acted = false;

    if (ballInRange) {
      const directionX = distance > 0.01 ? dx / distance : forwardX;
      const directionZ = distance > 0.01 ? dz / distance : forwardZ;
      const aimX = directionX * 0.72 + forwardX * 0.28;
      const aimZ = directionZ * 0.72 + forwardZ * 0.28;
      const aimMagnitude = Math.hypot(aimX, aimZ) || 1;
      const airborneHead = kind === "head" && !player.grounded;
      const strength = kind === "head"
        ? HEAD_KICK_STRENGTH * (airborneHead ? 1.14 : 1)
        : kind === "hand"
          ? HAND_HIT_STRENGTH
          : FOOT_KICK_STRENGTH;
      const lift = kind === "head" ? 3.9 : kind === "hand" ? 0.42 : 0.82;
      this.ballBody.applyImpulse(
        {
          x: aimX / aimMagnitude * strength + sideX * side * (kind === "hand" ? 0.72 : 1.65),
          y: lift,
          z: aimZ / aimMagnitude * strength + sideZ * side * (kind === "hand" ? 0.72 : 1.65)
        },
        true
      );
      acted = true;
    }

    acted = this.applyPlayerHit(player, kind, now, { x: forwardX, z: forwardZ }) || acted;
    if (!acted) return;

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
      target.stamina = Math.max(0, target.stamina - damage);
      target.staminaRecoveryBlockedUntil = now + PLAYER_HIT_RECOVERY_DELAY_MS;
      if (target.stamina <= 0.01) target.exhausted = true;
      target.pushVelocity.x += forward.x * (kind === "hand" ? 3.7 : 2.7);
      target.pushVelocity.z += forward.z * (kind === "hand" ? 3.7 : 2.7);
      target.lastAction = "body";
      target.lastActionAt = now;
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
      nextVelocity.y *= -0.48;
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

  private checkGoal(now: number): void {
    const position = this.ballBody.translation();
    const halfLength = FIELD_LENGTH / 2;
    const inGoalMouth = Math.abs(position.x) <= GOAL_WIDTH / 2;
    if (!inGoalMouth) return;

    if (position.z < -halfLength) {
      this.score.orange += 1;
      this.message = "\u041e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442";
      this.pushAudioEvent(now, { kind: "goal", team: 1 });
      this.lastCountdownAudioSecond = null;
      this.resetBall(now);
    } else if (position.z > halfLength) {
      this.score.blue += 1;
      this.message = "\u0421\u0438\u043d\u0438\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442";
      this.pushAudioEvent(now, { kind: "goal", team: 0 });
      this.lastCountdownAudioSecond = null;
      this.resetBall(now);
    }
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
    this.ballBody.setTranslation({ x: 0, y: BALL_RADIUS + 0.04, z: 0 }, true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.activeBallVariant = (this.activeBallVariant + 1) % BALL_VARIANT_COUNT;
    this.countdownUntil = now + 1200;
    for (const player of this.players.values()) {
      if (!player.body) continue;
      const spawn = this.spawnForIndex(player.index);
      player.body.setNextKinematicTranslation(spawn);
      player.grounded = true;
      player.verticalVelocity = 0;
      player.pushVelocity = zeroVec();
    }
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
      grounded: player.grounded,
      lastAction: player.lastAction,
      lastActionAt: player.lastActionAt
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
