import http from "node:http";
import express from "express";
import RAPIER from "@dimforge/rapier3d-compat";
import geckos, { iceServers, type Data, type ServerChannel } from "@geckos.io/server";
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
  ROOM_ID,
  SERVER_TICK_RATE,
  SNAPSHOT_RATE,
  type BallSnapshot,
  type ClientInputMessage,
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
  clamp,
  sanitizePlayerName
} from "@itch-games/unsoccer-shared";

interface PlayerRuntime {
  id: string;
  name: string;
  role: PlayerRole;
  team: TeamId | null;
  index: number;
  joinOrder: number;
  characterId: string;
  channel: ServerChannel;
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
}

const PORT = Number(process.env.UNSOCCER_PORT || 8787);
const LOCAL_ICE = process.env.UNSOCCER_LOCAL_ICE === "1";

function vec3FromRapier(value: { x: number; y: number; z: number }): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function zeroVec(): Vec3 {
  return { x: 0, y: 0, z: 0 };
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
  private readonly io = geckos({
    cors: { origin: "*" },
    iceServers: LOCAL_ICE ? [] : iceServers
  });

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
    this.io.addServer(this.httpServer);
    this.io.onConnection((channel) => this.onConnection(channel));
    this.httpServer.listen(PORT, () => {
      console.log(`unsoccer ${GAME_VERSION} listening on http://127.0.0.1:${PORT}`);
    });

    setInterval(() => this.tick(), 1000 / SERVER_TICK_RATE);
  }

  private configureHttp(): void {
    this.app.get("/api/health", (_request, response) => {
      response.json(this.serverInfo());
    });
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

  private onConnection(channel: ServerChannel): void {
    if (this.players.size >= MAX_ROOM_CLIENTS) {
      channel.emit("server-full", { maxRoomClients: MAX_ROOM_CLIENTS }, { reliable: true });
      channel.close();
      return;
    }

    const id = channel.id || `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    channel.join(ROOM_ID);
    const runtime: PlayerRuntime = {
      id,
      name: `\u0413\u043e\u0441\u0442\u044c ${this.players.size + 1}`,
      role: "spectator",
      team: null,
      index: this.players.size,
      joinOrder: this.joinCounter++,
      characterId: CHARACTER_ROSTER[0],
      channel,
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
      velocity: zeroVec()
    };

    this.players.set(id, runtime);
    this.rebalanceRoles();

    channel.on("join", (data: Data) => {
      const request = data as JoinRequest;
      runtime.name = sanitizePlayerName(request?.name);
      this.sendJoin(runtime);
      this.message = `${runtime.name} \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u043b\u0441\u044f ${runtime.role === "player" ? "\u043a \u043f\u043e\u043b\u044e" : "\u043a\u0430\u043a \u043d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u0435\u043b\u044c"}`;
    });

    channel.on("input", (data: Data) => {
      const message = data as ClientInputMessage;
      if (!message || typeof message.sequence !== "number") return;
      if (message.sequence < runtime.inputSequence) return;
      runtime.input = cloneInput(message.input || DEFAULT_INPUT);
      runtime.inputSequence = message.sequence;
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
    const payload: JoinAccepted = {
      id: player.id,
      role: player.role,
      team: player.team,
      index: player.index,
      characterId: player.characterId,
      version: GAME_VERSION,
      maxActivePlayers: MAX_ACTIVE_PLAYERS,
      maxRoomClients: MAX_ROOM_CLIENTS
    };
    player.channel.emit("joined", payload, { reliable: true });
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

  private tick(): void {
    const dt = 1 / SERVER_TICK_RATE;
    const now = Date.now();
    this.tickCount += 1;

    for (const player of this.players.values()) {
      this.updatePlayer(player, dt, now);
    }

    this.world.timestep = dt;
    this.world.step();
    this.containBall();
    this.checkGoal(now);

    if (now - this.lastSnapshotAt >= 1000 / SNAPSHOT_RATE) {
      this.lastSnapshotAt = now;
      this.io.room(ROOM_ID).emit("state", this.snapshot());
    }
  }

  private updatePlayer(player: PlayerRuntime, dt: number, now: number): void {
    if (!player.body) return;
    const current = player.body.translation();
    const xAxis = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
    const zAxis = (player.input.down ? 1 : 0) - (player.input.up ? 1 : 0);
    const magnitude = Math.hypot(xAxis, zAxis);
    const nx = magnitude > 0 ? xAxis / magnitude : 0;
    const nz = magnitude > 0 ? zAxis / magnitude : 0;
    const next = {
      x: clamp(current.x + nx * PLAYER_SPEED * dt, -FIELD_WIDTH / 2 + PLAYER_RADIUS, FIELD_WIDTH / 2 - PLAYER_RADIUS),
      y: PLAYER_HEIGHT / 2,
      z: clamp(current.z + nz * PLAYER_SPEED * dt, -FIELD_LENGTH / 2 + PLAYER_RADIUS, FIELD_LENGTH / 2 - PLAYER_RADIUS)
    };

    player.velocity = {
      x: (next.x - current.x) / dt,
      y: 0,
      z: (next.z - current.z) / dt
    };
    if (magnitude > 0.05) player.yaw = Math.atan2(nx, nz);
    else player.yaw = player.input.yaw;

    player.body.setNextKinematicTranslation(next);
    this.processBodyContact(player, now);
    this.processKick(player, now);
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

  private snapshot(): ServerState {
    const now = Date.now();
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
      countdown: Math.max(0, this.countdownUntil - now)
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
      maxRoomClients: MAX_ROOM_CLIENTS
    };
  }
}

new UnsoccerServer().start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
