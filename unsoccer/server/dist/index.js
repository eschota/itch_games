import http from "node:http";
import express from "express";
import RAPIER from "@dimforge/rapier3d-compat";
import geckos, { iceServers } from "@geckos.io/server";
import { BALL_RADIUS, BODY_BUMP_COOLDOWN_MS, BODY_BUMP_MIN_SPEED, BODY_BUMP_RANGE, BODY_BUMP_STRENGTH, CHARACTER_ROSTER, DEFAULT_INPUT, FIELD_LENGTH, FIELD_WIDTH, FOOT_KICK_STRENGTH, GAME_VERSION, GOAL_DEPTH, GOAL_WIDTH, HEAD_KICK_STRENGTH, HEAD_COOLDOWN_MS, KICK_COOLDOWN_MS, KICK_RANGE, MAX_ACTIVE_PLAYERS, MAX_ROOM_CLIENTS, PLAYER_HEIGHT, PLAYER_RADIUS, PLAYER_SPEED, ROOM_ID, SERVER_TICK_RATE, SNAPSHOT_RATE, clamp, sanitizePlayerName } from "@itch-games/unsoccer-shared";
const PORT = Number(process.env.UNSOCCER_PORT || 8787);
const LOCAL_ICE = process.env.UNSOCCER_LOCAL_ICE === "1";
const TEST_MODE = process.env.UNSOCCER_TEST_MODE === "1";
const TEST_TOKEN = process.env.UNSOCCER_TEST_TOKEN || "";
const WEATHER_HAZARDS = [
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
const WEATHER = {
    kind: "snow",
    label: "\u0421\u043d\u0435\u0433, \u043b\u0443\u0436\u0438 \u0438 \u0441\u0443\u0433\u0440\u043e\u0431\u044b",
    intensity: 0.72,
    wind: { x: 0.16, y: 0, z: -0.1 },
    hazards: WEATHER_HAZARDS
};
function vec3FromRapier(value) {
    return { x: value.x, y: value.y, z: value.z };
}
function zeroVec() {
    return { x: 0, y: 0, z: 0 };
}
function distance2d(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
}
function cloneInput(input) {
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
    app = express();
    httpServer = http.createServer(this.app);
    io = geckos({
        cors: { origin: "*" },
        iceServers: LOCAL_ICE ? [] : iceServers
    });
    world;
    ballBody;
    players = new Map();
    score = { blue: 0, orange: 0 };
    tickCount = 0;
    joinCounter = 0;
    message = "\u0416\u0434\u0451\u043c \u0438\u0433\u0440\u043e\u043a\u043e\u0432";
    countdownUntil = 0;
    lastSnapshotAt = 0;
    async start() {
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
    configureHttp() {
        this.app.use(express.json({ limit: "32kb" }));
        this.app.get("/api/health", (_request, response) => {
            response.json(this.serverInfo());
        });
        if (TEST_MODE)
            this.configureTestHttp();
    }
    configureTestHttp() {
        this.app.get("/api/test/state", (request, response) => {
            if (!this.allowTestRequest(request, response))
                return;
            response.json({ ok: true, state: this.snapshot() });
        });
        this.app.post("/api/test/reset", (request, response) => {
            if (!this.allowTestRequest(request, response))
                return;
            this.resetMatch(Date.now());
            response.json({ ok: true, state: this.snapshot() });
        });
        this.app.post("/api/test/players", (request, response) => {
            if (!this.allowTestRequest(request, response))
                return;
            const body = this.requestBody(request);
            const count = this.numberField(body.count, 0, 0, MAX_ROOM_CLIENTS);
            this.createTestPlayers(count);
            response.json({ ok: true, state: this.snapshot() });
        });
        this.app.post("/api/test/ball", (request, response) => {
            if (!this.allowTestRequest(request, response))
                return;
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
            if (!this.allowTestRequest(request, response))
                return;
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
            if (!this.allowTestRequest(request, response))
                return;
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
    allowTestRequest(request, response) {
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
    isLoopbackRequest(request) {
        const remote = request.ip || request.socket.remoteAddress || "";
        return remote === "::1" || remote === "127.0.0.1" || remote === "::ffff:127.0.0.1" || remote.startsWith("::ffff:127.");
    }
    requestBody(request) {
        return typeof request.body === "object" && request.body !== null ? request.body : {};
    }
    numberField(value, fallback, min, max) {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue))
            return fallback;
        return clamp(Math.floor(numberValue), min, max);
    }
    coordinateField(value, fallback) {
        const numberValue = Number(value);
        return Number.isFinite(numberValue) ? numberValue : fallback;
    }
    vecField(value, fallback) {
        const source = typeof value === "object" && value !== null ? value : {};
        return {
            x: this.coordinateField(source.x, fallback.x),
            y: this.coordinateField(source.y, fallback.y),
            z: this.coordinateField(source.z, fallback.z)
        };
    }
    createTestPlayers(count) {
        for (const player of this.players.values()) {
            this.destroyBody(player);
        }
        this.players.clear();
        this.joinCounter = 0;
        for (let index = 0; index < count; index += 1) {
            const id = `test-player-${index + 1}`;
            const runtime = {
                id,
                name: `\u0422\u0435\u0441\u0442 ${index + 1}`,
                role: "spectator",
                team: null,
                index,
                joinOrder: this.joinCounter++,
                characterId: CHARACTER_ROSTER[index % CHARACTER_ROSTER.length],
                channel: null,
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
        }
        this.rebalanceRoles();
        this.message = count > 0
            ? "\u0422\u0435\u0441\u0442\u043e\u0432\u044b\u0435 \u0438\u0433\u0440\u043e\u043a\u0438 \u0433\u043e\u0442\u043e\u0432\u044b"
            : "\u0416\u0434\u0451\u043c \u0438\u0433\u0440\u043e\u043a\u043e\u0432";
    }
    resetMatch(now) {
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
    applyTestPlayerPatch(player, body) {
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
            if (Number.isFinite(yaw))
                player.yaw = yaw;
        }
        if (body.input !== undefined) {
            const patch = typeof body.input === "object" && body.input !== null ? body.input : {};
            player.input = cloneInput({ ...player.input, ...patch });
        }
    }
    createPhysicsWorld() {
        this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
        const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(FIELD_WIDTH / 2 + 1, 0.2, FIELD_LENGTH / 2 + 1)
            .setTranslation(0, -0.2, 0)
            .setFriction(1.2), ground);
        this.ballBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(0, BALL_RADIUS + 0.04, 0)
            .setLinearDamping(0.8)
            .setAngularDamping(0.45)
            .setCanSleep(false));
        this.world.createCollider(RAPIER.ColliderDesc.ball(BALL_RADIUS)
            .setRestitution(0.72)
            .setFriction(0.95)
            .setDensity(0.45), this.ballBody);
    }
    onConnection(channel) {
        if (this.players.size >= MAX_ROOM_CLIENTS) {
            channel.emit("server-full", { maxRoomClients: MAX_ROOM_CLIENTS }, { reliable: true });
            channel.close();
            return;
        }
        const id = channel.id || `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        channel.join(ROOM_ID);
        const runtime = {
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
        channel.on("join", (data) => {
            const request = data;
            runtime.name = sanitizePlayerName(request?.name);
            this.sendJoin(runtime);
            this.message = `${runtime.name} \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u043b\u0441\u044f ${runtime.role === "player" ? "\u043a \u043f\u043e\u043b\u044e" : "\u043a\u0430\u043a \u043d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u0435\u043b\u044c"}`;
        });
        channel.on("input", (data) => {
            const message = data;
            if (!message || typeof message.sequence !== "number")
                return;
            if (message.sequence < runtime.inputSequence)
                return;
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
    rebalanceRoles() {
        const ordered = [...this.players.values()].sort((a, b) => a.joinOrder - b.joinOrder);
        ordered.forEach((player, orderIndex) => {
            const active = orderIndex < MAX_ACTIVE_PLAYERS;
            player.role = active ? "player" : "spectator";
            player.index = orderIndex;
            player.team = active ? (orderIndex % 2) : null;
            player.characterId = CHARACTER_ROSTER[orderIndex % CHARACTER_ROSTER.length];
            if (active && !player.body)
                this.createBody(player);
            if (!active && player.body)
                this.destroyBody(player);
            this.sendJoin(player);
        });
    }
    createBody(player) {
        const spawn = this.spawnForIndex(player.index);
        player.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(spawn.x, spawn.y, spawn.z)
            .setCanSleep(false));
        this.world.createCollider(RAPIER.ColliderDesc.capsule((PLAYER_HEIGHT - PLAYER_RADIUS * 2) / 2, PLAYER_RADIUS)
            .setFriction(1.1)
            .setRestitution(0.05), player.body);
    }
    destroyBody(player) {
        if (!player.body)
            return;
        this.world.removeRigidBody(player.body);
        player.body = null;
    }
    sendJoin(player) {
        const channel = player.channel;
        if (!channel)
            return;
        const payload = {
            id: player.id,
            role: player.role,
            team: player.team,
            index: player.index,
            characterId: player.characterId,
            version: GAME_VERSION,
            maxActivePlayers: MAX_ACTIVE_PLAYERS,
            maxRoomClients: MAX_ROOM_CLIENTS
        };
        channel.emit("joined", payload, { reliable: true });
    }
    spawnForIndex(index) {
        const team = index % 2;
        const row = Math.floor(index / 2);
        return {
            x: row === 0 ? -3.2 : 3.2,
            y: PLAYER_HEIGHT / 2,
            z: team === 0 ? -FIELD_LENGTH * 0.24 : FIELD_LENGTH * 0.24
        };
    }
    tick(now = Date.now(), emitSnapshot = true) {
        const dt = 1 / SERVER_TICK_RATE;
        this.tickCount += 1;
        for (const player of this.players.values()) {
            this.updatePlayer(player, dt, now);
        }
        this.world.timestep = dt;
        this.world.step();
        this.containBall();
        this.checkGoal(now);
        if (emitSnapshot && now - this.lastSnapshotAt >= 1000 / SNAPSHOT_RATE) {
            this.lastSnapshotAt = now;
            this.io.room(ROOM_ID).emit("state", this.snapshot(now));
        }
    }
    updatePlayer(player, dt, now) {
        if (!player.body)
            return;
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
        if (magnitude > 0.05)
            player.yaw = Math.atan2(nx, nz);
        else
            player.yaw = player.input.yaw;
        player.body.setNextKinematicTranslation(resolvedNext);
        this.processBodyContact(player, now);
        this.processKick(player, now);
    }
    environmentAt(point) {
        let playerSpeedMultiplier = 1;
        let ballDrag = 0.997;
        for (const hazard of WEATHER_HAZARDS) {
            if (hazard.type === "snowbank")
                continue;
            const distance = distance2d(point, hazard.position);
            if (distance > hazard.radius)
                continue;
            const falloff = 1 - distance / hazard.radius;
            if (hazard.type === "puddle") {
                playerSpeedMultiplier *= 1 - hazard.strength * 0.34 * falloff;
                ballDrag *= 1 - hazard.strength * 0.11 * falloff;
            }
            else if (hazard.type === "slush") {
                playerSpeedMultiplier *= 1 - hazard.strength * 0.48 * falloff;
                ballDrag *= 1 - hazard.strength * 0.18 * falloff;
            }
        }
        return {
            playerSpeedMultiplier: clamp(playerSpeedMultiplier, 0.42, 1),
            ballDrag: clamp(ballDrag, 0.82, 0.997)
        };
    }
    resolvePlayerHazards(next) {
        const resolved = { ...next };
        for (const hazard of WEATHER_HAZARDS) {
            if (hazard.type !== "snowbank")
                continue;
            const dx = resolved.x - hazard.position.x;
            const dz = resolved.z - hazard.position.z;
            const distance = Math.hypot(dx, dz);
            const safeRadius = hazard.radius + PLAYER_RADIUS * 0.84;
            if (distance >= safeRadius)
                continue;
            const nx = distance > 0.001 ? dx / distance : 1;
            const nz = distance > 0.001 ? dz / distance : 0;
            resolved.x = clamp(hazard.position.x + nx * safeRadius, -FIELD_WIDTH / 2 + PLAYER_RADIUS, FIELD_WIDTH / 2 - PLAYER_RADIUS);
            resolved.z = clamp(hazard.position.z + nz * safeRadius, -FIELD_LENGTH / 2 + PLAYER_RADIUS, FIELD_LENGTH / 2 - PLAYER_RADIUS);
        }
        return resolved;
    }
    processBodyContact(player, now) {
        if (!player.body)
            return;
        if (now - player.lastBodyAt < BODY_BUMP_COOLDOWN_MS)
            return;
        const speed = Math.hypot(player.velocity.x, player.velocity.z);
        if (speed < BODY_BUMP_MIN_SPEED)
            return;
        const playerPosition = player.body.translation();
        const ballPosition = this.ballBody.translation();
        const dx = ballPosition.x - playerPosition.x;
        const dz = ballPosition.z - playerPosition.z;
        const distance = Math.hypot(dx, dz);
        if (distance > BODY_BUMP_RANGE + BALL_RADIUS || distance < 0.001)
            return;
        const directionX = distance > 0.01 ? dx / distance : Math.sin(player.yaw);
        const directionZ = distance > 0.01 ? dz / distance : Math.cos(player.yaw);
        const approachSpeed = player.velocity.x * directionX + player.velocity.z * directionZ;
        if (approachSpeed < BODY_BUMP_MIN_SPEED * 0.62)
            return;
        const strength = BODY_BUMP_STRENGTH + Math.min(3.2, approachSpeed * 0.28);
        this.ballBody.applyImpulse({
            x: directionX * strength + player.velocity.x * 0.08,
            y: 0.52,
            z: directionZ * strength + player.velocity.z * 0.08
        }, true);
        player.lastBodyAt = now;
        player.lastAction = "body";
        player.lastActionAt = now;
        this.message = `${player.name} \u043f\u0440\u043e\u0434\u0430\u0432\u0438\u043b \u043c\u044f\u0447 \u043a\u043e\u0440\u043f\u0443\u0441\u043e\u043c`;
    }
    processKick(player, now) {
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
    tryKick(player, kind, now) {
        if (!player.body)
            return;
        if (kind === "head") {
            if (now - player.lastHeadAt < HEAD_COOLDOWN_MS)
                return;
            player.lastHeadAt = now;
        }
        else {
            if (now - player.lastKickAt < KICK_COOLDOWN_MS)
                return;
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
        if (distance > KICK_RANGE)
            return;
        const directionX = distance > 0.01 ? dx / distance : forwardX;
        const directionZ = distance > 0.01 ? dz / distance : forwardZ;
        const aimX = directionX * 0.72 + forwardX * 0.28;
        const aimZ = directionZ * 0.72 + forwardZ * 0.28;
        const aimMagnitude = Math.hypot(aimX, aimZ) || 1;
        const strength = kind === "head" ? HEAD_KICK_STRENGTH : FOOT_KICK_STRENGTH;
        const lift = kind === "head" ? 3.5 : 0.75;
        this.ballBody.applyImpulse({
            x: aimX / aimMagnitude * strength + sideX * side * 1.65,
            y: lift,
            z: aimZ / aimMagnitude * strength + sideZ * side * 1.65
        }, true);
        player.lastAction = kind;
        player.lastActionAt = now;
        this.message = `${player.name} ${this.actionLabel(kind)} \u043c\u044f\u0447`;
    }
    actionLabel(kind) {
        if (kind === "left")
            return "\u0443\u0434\u0430\u0440\u0438\u043b \u043b\u0435\u0432\u043e\u0439 \u043d\u043e\u0433\u043e\u0439";
        if (kind === "right")
            return "\u0443\u0434\u0430\u0440\u0438\u043b \u043f\u0440\u0430\u0432\u043e\u0439 \u043d\u043e\u0433\u043e\u0439";
        if (kind === "head")
            return "\u0441\u044b\u0433\u0440\u0430\u043b \u0433\u043e\u043b\u043e\u0432\u043e\u0439";
        return "\u0441\u044b\u0433\u0440\u0430\u043b \u043a\u043e\u0440\u043f\u0443\u0441\u043e\u043c";
    }
    containBall() {
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
            if (hazard.type !== "snowbank")
                continue;
            const dx = nextPosition.x - hazard.position.x;
            const dz = nextPosition.z - hazard.position.z;
            const distance = Math.hypot(dx, dz);
            const safeRadius = hazard.radius + BALL_RADIUS;
            if (distance >= safeRadius)
                continue;
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
    checkGoal(now) {
        const position = this.ballBody.translation();
        const halfLength = FIELD_LENGTH / 2;
        const inGoalMouth = Math.abs(position.x) <= GOAL_WIDTH / 2;
        if (!inGoalMouth)
            return;
        if (position.z < -halfLength) {
            this.score.orange += 1;
            this.message = "\u041e\u0440\u0430\u043d\u0436\u0435\u0432\u044b\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442";
            this.resetBall(now);
        }
        else if (position.z > halfLength) {
            this.score.blue += 1;
            this.message = "\u0421\u0438\u043d\u0438\u0435 \u0437\u0430\u0431\u0438\u0432\u0430\u044e\u0442";
            this.resetBall(now);
        }
    }
    resetBall(now) {
        this.ballBody.setTranslation({ x: 0, y: BALL_RADIUS + 0.04, z: 0 }, true);
        this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.countdownUntil = now + 1200;
        for (const player of this.players.values()) {
            if (!player.body)
                continue;
            const spawn = this.spawnForIndex(player.index);
            player.body.setNextKinematicTranslation(spawn);
        }
    }
    snapshot(now = Date.now()) {
        const ball = {
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
    snapshotPlayer(player) {
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
    serverInfo() {
        let activePlayers = 0;
        for (const player of this.players.values()) {
            if (player.role === "player")
                activePlayers += 1;
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
new UnsoccerServer().start().catch((error) => {
    console.error(error);
    process.exit(1);
});
