import crypto from "node:crypto";
import http from "node:http";
import type { Duplex } from "node:stream";
import express, { type Request, type Response } from "express";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  BALL_RADIUS,
  BODY_BUMP_COOLDOWN_MS,
  BODY_BUMP_MIN_SPEED,
  BODY_BUMP_RANGE,
  BODY_BUMP_STRENGTH,
  CHARACTER_ROSTER,
  DEFAULT_INPUT,
  FIELD_LENGTH,
  FIELD_WIDTH,
  FOOT_KICK_STRENGTH,
  GAME_VERSION,
  GOAL_DEPTH,
  GOAL_WIDTH,
  HEAD_KICK_STRENGTH,
  HEAD_COOLDOWN_MS,
  KICK_COOLDOWN_MS,
  KICK_RANGE,
  MAX_ACTIVE_PLAYERS,
  MAX_ROOM_CLIENTS,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_SPEED,
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
  type ServerInfo,
  type ServerState,
  type TeamId,
  type Vec3,
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
  lastBodyAt: number;
  lastAction: KickKind | null;
  lastActionAt: number;
  yaw: number;
  velocity: Vec3;
  lastSeenAt: number;
}

const PORT = Number(process.env.UNSOCCER_PORT || 8787);
const TEST_MODE = process.env.UNSOCCER_TEST_MODE === "1";
const TEST_TOKEN = process.env.UNSOCCER_TEST_TOKEN || "";
const WEATHER_HAZARDS: HazardSnapshot[] = [
  {
    id: "puddle-west-box",
    type: "puddle",
    position: { x: -6.4, y: 0.03, z: -7.2 },
    radius: 2.45,
    strength: 0.58
  },
  {
    id: "puddle-east-mid",
    type: "puddle",
    position: { x: 6.2, y: 0.03, z: 3.1 },
    radius: 2.1,
    strength: 0.52
  },
  {
    id: "slush-center-left",
    type: "slush",
    position: { x: -2.7, y: 0.04, z: 6.4 },
    radius: 2.8,
    strength: 0.38
  },
  {
    id: "slush-center-right",
    type: "slush",
    position: { x: 3.8, y: 0.04, z: -4.8 },
    radius: 2.6,
    strength: 0.34
  },
  {
    id: "snowbank-north",
    type: "snowbank",
    position: { x: -7.4, y: 0.28, z: 10.5 },
    radius: 1.25,
    strength: 0.92
  },
  {
    id: "snowbank-south",
    type: "snowbank",
    position: { x: 7.5, y: 0.28, z: -10.2 },
    radius: 1.3,
    strength: 0.92
  }
];
const WEATHER: WeatherSnapshot = {
  kind: "snow",
  label: "\u0421\u043d\u0435\u0433, \u043b\u0443\u0436\u0438 \u0438 \u0441\u0443\u0433\u0440\u043e\u0431\u044b",
  intensity: 0.72,
  wind: { x: 0.16, y: 0, z: -0.1 },
  hazards: WEATHER_HAZARDS
};

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
    yaw: Number.isFinite(input.yaw) ? input.yaw : 0
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
      lastBodyAt: 0,
      lastAction: null,
      lastActionAt: 0,
      yaw: 0,
      velocity: zeroVec(),
      lastSeenAt: Date.now()
    };
  }

  private resetMatch(now: number): void {
    this.score.blue = 0;
    this.score.orange = 0;
    this.resetBall(now);
    this.countdownUntil = 0;
    this.message = "\u0416\u0434\u0451\u043c \u0438\u0433\u0440\u043e\u043a\u043e\u0432";
    for (const player of this.players.values()) {
      player.input = { ...DEFAULT_INPUT };
      player.inputSequence = 0;
      player.lastKickAt = 0;
      player.lastHeadAt = 0;
      player.lastKickLeft = 0;
      player.lastKickRight = 0;
      player.lastHead = 0;
      player.lastBodyAt = 0;
      player.lastAction = null;
      player.lastActionAt = 0;
      player.velocity = zeroVec();
    }
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
        .setRestitution(0.72)
        .setFriction(0.95)
        .setDensity(0.45),
      this.ballBody
    );
  }

  private onConnection(channel: TransportChannel): void {
    if (this.players.size >= MAX_ROOM_CLIENTS) {
      channel.emit("server-full", { maxRoomClients: MAX_ROOM_CLIENTS });
      channel.close();
      return;
    }

    const id = channel.id;
    const runtime = this.createRuntime({
      id,
      name: `\u0413\u043e\u0441\u0442\u044c ${this.players.size + 1}`,
      channel,
      transport: "websocket"
    });

    this.players.set(id, runtime);
    this.rebalanceRoles();

    channel.on("join", (data: unknown) => {
      const request = data as JoinRequest;
      runtime.name = sanitizePlayerName(request?.name);
      this.sendJoin(runtime);
      this.message = `${runtime.name} \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u043b\u0441\u044f ${runtime.role === "player" ? "\u043a \u043f\u043e\u043b\u044e" : "\u043a\u0430\u043a \u043d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u0435\u043b\u044c"}`;
    });

    channel.on("input", (data: unknown) => {
      const message = data as ClientInputMessage;
      if (!message || typeof message.sequence !== "number") return;
      if (message.sequence < runtime.inputSequence) return;
      runtime.input = cloneInput(message.input || DEFAULT_INPUT);
      runtime.inputSequence = message.sequence;
      runtime.lastSeenAt = Date.now();
    });

    channel.onDisconnect(() => {
      this.destroyBody(runtime);
      this.players.delete(id);
      this.rebalanceRoles();
      this.message = `${runtime.name} \u0432\u044b\u0448\u0435\u043b`;
    });
  }

  private rebalanceRoles(): void {
    const ordered = [...this.players.values()].sort((a, b) => a.joinOrder - b.joinOrder);
    ordered.forEach((player, orderIndex) => {
      const active = orderIndex < MAX_ACTIVE_PLAYERS;
      player.role = active ? "player" : "spectator";
      player.index = orderIndex;
      player.team = active ? ((orderIndex % 2) as TeamId) : null;
      player.characterId = CHARACTER_ROSTER[orderIndex % CHARACTER_ROSTER.length];
      if (active && !player.body) this.createBody(player);
      if (!active && player.body) this.destroyBody(player);
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
        .setRestitution(0.05),
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

    for (const player of this.players.values()) {
      this.updatePlayer(player, dt, now);
    }

    this.world.timestep = dt;
    this.world.step();
    this.containBall();
    this.checkGoal(now);

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
    const currentPoint = { x: current.x, y: PLAYER_HEIGHT / 2, z: current.z };
    const environment = this.environmentAt(currentPoint);
    const xAxis = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
    const zAxis = (player.input.down ? 1 : 0) - (player.input.up ? 1 : 0);
    const magnitude = Math.hypot(xAxis, zAxis);
    const nx = magnitude > 0 ? xAxis / magnitude : 0;
    const nz = magnitude > 0 ? zAxis / magnitude : 0;
    const weatherSpeed = PLAYER_SPEED * environment.playerSpeedMultiplier;
    const next = {
      x: clamp(current.x + nx * weatherSpeed * dt, -FIELD_WIDTH / 2 + PLAYER_RADIUS, FIELD_WIDTH / 2 - PLAYER_RADIUS),
      y: PLAYER_HEIGHT / 2,
      z: clamp(current.z + nz * weatherSpeed * dt, -FIELD_LENGTH / 2 + PLAYER_RADIUS, FIELD_LENGTH / 2 - PLAYER_RADIUS)
    };
    const resolvedNext = this.resolvePlayerHazards(next);

    player.velocity = {
      x: (resolvedNext.x - current.x) / dt,
      y: 0,
      z: (resolvedNext.z - current.z) / dt
    };
    if (magnitude > 0.05) player.yaw = Math.atan2(nx, nz);
    else player.yaw = player.input.yaw;

    player.body.setNextKinematicTranslation(resolvedNext);
    this.processBodyContact(player, now);
    this.processKick(player, now);
  }

  private environmentAt(point: Vec3): { playerSpeedMultiplier: number; ballDrag: number } {
    let playerSpeedMultiplier = 1;
    let ballDrag = 0.997;
    for (const hazard of WEATHER_HAZARDS) {
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
    for (const hazard of WEATHER_HAZARDS) {
      if (hazard.type !== "snowbank") continue;
      const dx = resolved.x - hazard.position.x;
      const dz = resolved.z - hazard.position.z;
      const distance = Math.hypot(dx, dz);
      const safeRadius = hazard.radius + PLAYER_RADIUS * 0.84;
      if (distance >= safeRadius) continue;
      const nx = distance > 0.001 ? dx / distance : 1;
      const nz = distance > 0.001 ? dz / distance : 0;
      resolved.x = clamp(hazard.position.x + nx * safeRadius, -FIELD_WIDTH / 2 + PLAYER_RADIUS, FIELD_WIDTH / 2 - PLAYER_RADIUS);
      resolved.z = clamp(hazard.position.z + nz * safeRadius, -FIELD_LENGTH / 2 + PLAYER_RADIUS, FIELD_LENGTH / 2 - PLAYER_RADIUS);
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

    const strength = BODY_BUMP_STRENGTH + Math.min(3.2, approachSpeed * 0.28);
    this.ballBody.applyImpulse(
      {
        x: directionX * strength + player.velocity.x * 0.08,
        y: 0.52,
        z: directionZ * strength + player.velocity.z * 0.08
      },
      true
    );
    player.lastBodyAt = now;
    player.lastAction = "body";
    player.lastActionAt = now;
    this.message = `${player.name} \u043f\u0440\u043e\u0434\u0430\u0432\u0438\u043b \u043c\u044f\u0447 \u043a\u043e\u0440\u043f\u0443\u0441\u043e\u043c`;
  }

  private processKick(player: PlayerRuntime, now: number): void {
    if (player.input.kickLeft > player.lastKickLeft) {
      player.lastKickLeft = player.input.kickLeft;
      this.tryKick(player, "left", now);
    }
    if (player.input.kickRight > player.lastKickRight) {
      player.lastKickRight = player.input.kickRight;
      this.tryKick(player, "right", now);
    }
    if (player.input.head > player.lastHead) {
      player.lastHead = player.input.head;
      this.tryKick(player, "head", now);
    }
  }

  private tryKick(player: PlayerRuntime, kind: KickKind, now: number): void {
    if (!player.body) return;
    if (kind === "head") {
      if (now - player.lastHeadAt < HEAD_COOLDOWN_MS) return;
      player.lastHeadAt = now;
    } else {
      if (now - player.lastKickAt < KICK_COOLDOWN_MS) return;
      player.lastKickAt = now;
    }

    const playerPosition = player.body.translation();
    const ballPosition = this.ballBody.translation();
    const forwardX = Math.sin(player.yaw);
    const forwardZ = Math.cos(player.yaw);
    const sideX = Math.cos(player.yaw);
    const sideZ = -Math.sin(player.yaw);
    const side = kind === "left" ? -1 : kind === "right" ? 1 : 0;
    const contact = kind === "head"
      ? {
          x: playerPosition.x + forwardX * 0.18,
          z: playerPosition.z + forwardZ * 0.18
        }
      : {
          x: playerPosition.x + sideX * side * 0.34 + forwardX * 0.28,
          z: playerPosition.z + sideZ * side * 0.34 + forwardZ * 0.28
        };
    const dx = ballPosition.x - contact.x;
    const dz = ballPosition.z - contact.z;
    const distance = Math.hypot(dx, dz);
    if (distance > KICK_RANGE) return;

    const directionX = distance > 0.01 ? dx / distance : forwardX;
    const directionZ = distance > 0.01 ? dz / distance : forwardZ;
    const aimX = directionX * 0.72 + forwardX * 0.28;
    const aimZ = directionZ * 0.72 + forwardZ * 0.28;
    const aimMagnitude = Math.hypot(aimX, aimZ) || 1;
    const strength = kind === "head" ? HEAD_KICK_STRENGTH : FOOT_KICK_STRENGTH;
    const lift = kind === "head" ? 3.5 : 0.75;
    this.ballBody.applyImpulse(
      {
        x: aimX / aimMagnitude * strength + sideX * side * 1.65,
        y: lift,
        z: aimZ / aimMagnitude * strength + sideZ * side * 1.65
      },
      true
    );
    player.lastAction = kind;
    player.lastActionAt = now;
    this.message = `${player.name} ${this.actionLabel(kind)} \u043c\u044f\u0447`;
  }

  private actionLabel(kind: KickKind): string {
    if (kind === "left") return "\u0443\u0434\u0430\u0440\u0438\u043b \u043b\u0435\u0432\u043e\u0439 \u043d\u043e\u0433\u043e\u0439";
    if (kind === "right") return "\u0443\u0434\u0430\u0440\u0438\u043b \u043f\u0440\u0430\u0432\u043e\u0439 \u043d\u043e\u0433\u043e\u0439";
    if (kind === "head") return "\u0441\u044b\u0433\u0440\u0430\u043b \u0433\u043e\u043b\u043e\u0432\u043e\u0439";
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
    nextVelocity.x = nextVelocity.x * environment.ballDrag + WEATHER.wind.x * WEATHER.intensity * 0.004;
    nextVelocity.z = nextVelocity.z * environment.ballDrag + WEATHER.wind.z * WEATHER.intensity * 0.004;

    if (Math.abs(nextPosition.x) > halfWidth) {
      nextPosition.x = clamp(nextPosition.x, -halfWidth, halfWidth);
      nextVelocity.x *= -0.72;
    }
    if (Math.abs(nextPosition.z) > halfLength) {
      nextPosition.z = clamp(nextPosition.z, -halfLength, halfLength);
      nextVelocity.z *= -0.72;
    }
    if (nextPosition.y <= BALL_RADIUS && nextVelocity.y < 0) {
      nextVelocity.y *= -0.25;
    }

    for (const hazard of WEATHER_HAZARDS) {
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

  private checkGoal(now: number): void {
    const position = this.ballBody.translation();
    const halfLength = FIELD_LENGTH / 2;
    const inGoalMouth = Math.abs(position.x) <= GOAL_WIDTH / 2;
    if (!inGoalMouth) return;

    if (position.z < -halfLength) {
      this.score.orange += 1;
      this.message = "\u041e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442";
      this.resetBall(now);
    } else if (position.z > halfLength) {
      this.score.blue += 1;
      this.message = "\u0421\u0438\u043d\u0438\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442";
      this.resetBall(now);
    }
  }

  private resetBall(now: number): void {
    this.ballBody.setTranslation({ x: 0, y: BALL_RADIUS + 0.04, z: 0 }, true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.countdownUntil = now + 1200;
    for (const player of this.players.values()) {
      if (!player.body) continue;
      const spawn = this.spawnForIndex(player.index);
      player.body.setNextKinematicTranslation(spawn);
    }
  }

  private snapshot(now = Date.now()): ServerState {
    const ball: BallSnapshot = {
      position: vec3FromRapier(this.ballBody.translation()),
      velocity: vec3FromRapier(this.ballBody.linvel())
    };
    return {
      version: GAME_VERSION,
      serverTime: now,
      tick: this.tickCount,
      players: [...this.players.values()]
        .sort((a, b) => a.index - b.index)
        .map((player) => this.snapshotPlayer(player)),
      ball,
      score: { ...this.score },
      message: this.message,
      countdown: Math.max(0, this.countdownUntil - now),
      weather: WEATHER
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
