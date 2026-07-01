import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const EXPECTED_GAME_VERSION = String(PACKAGE.games?.unsoccer?.version || PACKAGE.gameVersion || PACKAGE.version);
const FIELD_WIDTH = 48;
const FIELD_LENGTH = 72;
const GOAL_WIDTH = 12;
const GOAL_POST_RADIUS = 0.38;
const BALL_RADIUS = 0.48;
const BALL_RESTITUTION = 1.05;
const PLAYER_HEIGHT = 1.75;
const DAY_START_SECONDS = 6 * 60 * 60;
const WEATHER_CHANGE_MIN_MS = 60_000;
const WEATHER_CHANGE_MAX_MS = 120_000;

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, getExitCode, stderrLines) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (getExitCode() !== null) {
      throw new Error(`server exited before health check: ${stderrLines.join("\n")}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response.json();
    } catch {
      // Server is still starting.
    }
    await wait(125);
  }
  throw new Error(`server health timed out: ${stderrLines.join("\n")}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    wait(2500).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    })
  ]);
}

function speed3(velocity) {
  return Math.hypot(velocity.x, velocity.y, velocity.z);
}

function inputState(patch = {}) {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    kickLeft: 0,
    kickRight: 0,
    head: 0,
    jump: 0,
    sprint: false,
    yaw: 0,
    ...patch
  };
}

function playerAt(state, index) {
  const player = state.players.find((candidate) => candidate.index === index);
  assert.ok(player, `player ${index} should exist`);
  return player;
}

function maxAudioEventId(state) {
  const ids = (state.audioEvents || []).map((event) => event.id || 0);
  return ids.length ? Math.max(...ids) : 0;
}

function newerAudioEvents(state, afterId) {
  return (state.audioEvents || []).filter((event) => event.id > afterId);
}

function assertAudioEvent(state, afterId, predicate, label) {
  const event = newerAudioEvents(state, afterId).find(predicate);
  assert.ok(event, `${label} audio event should exist`);
  return event;
}

function webSocketUrl(baseUrl) {
  return `${baseUrl.replace(/^http/, "ws")}/ws`;
}

async function probeWebSocketWithoutJoin(baseUrl) {
  assert.equal(typeof WebSocket, "function", "Node runtime should expose WebSocket");
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketUrl(baseUrl));
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("websocket no-join probe timed out"));
    }, 2500);
    ws.addEventListener("open", () => {
      setTimeout(() => {
        clearTimeout(timer);
        ws.close();
        resolve();
      }, 80);
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("websocket no-join probe failed"));
    });
  });
}

async function joinWebSocketAndReadState(baseUrl, name) {
  assert.equal(typeof WebSocket, "function", "Node runtime should expose WebSocket");
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketUrl(baseUrl));
    let joined = null;
    let state = null;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("websocket join/state timed out"));
    }, 3000);
    const finish = () => {
      if (!joined || !state) return;
      clearTimeout(timer);
      ws.close();
      resolve({ joined, state });
    };
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ event: "join", data: { name } }));
    });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.event === "joined") joined = message.data;
      if (message.event === "state") state = message.data;
      finish();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("websocket join failed"));
    });
  });
}

async function assertHttpFallback(api) {
  await api("POST", "/api/test/players", { count: 0 });
  await api("POST", "/api/test/reset", {});

  const join = await api("POST", "/api/join", { name: "HttpFallback" });
  assert.equal(join.ok, true, "http fallback join should return ok");
  assert.equal(join.joined.version, EXPECTED_GAME_VERSION);
  assert.ok(String(join.joined.id).startsWith("http-"), "http fallback join should return an http client id");

  let state = (await api("GET", `/api/state?clientId=${encodeURIComponent(join.joined.id)}`)).state;
  assert.ok(state.players.some((player) => player.id === join.joined.id), "http fallback state should include joined player");

  await api("POST", `/api/test/player/${join.joined.index}`, {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    input: inputState()
  });
  await api("POST", "/api/input", {
    clientId: join.joined.id,
    sequence: 1,
    input: inputState({ up: true })
  });

  state = (await api("POST", "/api/test/tick", { frames: 6 })).state;
  assert.ok(playerAt(state, join.joined.index).position.z > 0.5, "http fallback input should move blue player toward +Z");

  state = (await api("GET", `/api/state?clientId=${encodeURIComponent(join.joined.id)}`)).state;
  assert.ok(playerAt(state, join.joined.index).position.z > 0.5, "http fallback state should expose latest movement");

  await api("POST", "/api/leave", { clientId: join.joined.id });
  state = (await api("GET", "/api/test/state")).state;
  assert.ok(!state.players.some((player) => player.id === join.joined.id), "http fallback leave should remove player");
}

async function main() {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const stdoutLines = [];
  const stderrLines = [];
  let exitCode = null;
  const child = spawn(process.execPath, ["unsoccer/server/dist/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      UNSOCCER_PORT: String(port),
      UNSOCCER_TEST_MODE: "1",
      UNSOCCER_LOCAL_ICE: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => stdoutLines.push(String(chunk).trim()));
  child.stderr.on("data", (chunk) => stderrLines.push(String(chunk).trim()));
  child.once("exit", (code) => {
    exitCode = code;
  });

  const api = async (method, urlPath, body) => {
    const response = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(`${method} ${urlPath} failed ${response.status}: ${text}`);
    }
    return payload;
  };

  try {
    const health = await waitForHealth(baseUrl, () => exitCode, stderrLines);
    assert.equal(health.ok, true);
    assert.equal(health.version, EXPECTED_GAME_VERSION);

    let state = (await api("GET", "/api/test/state")).state;
    const beforeProbeAudioId = maxAudioEventId(state);
    await probeWebSocketWithoutJoin(baseUrl);
    state = (await api("GET", "/api/test/state")).state;
    assert.equal(state.players.length, 0, "websocket probe without join should not create a player");
    assert.equal(
      newerAudioEvents(state, beforeProbeAudioId).filter((event) => event.kind === "roster").length,
      0,
      "websocket probe without join should not emit roster audio"
    );

    const beforeWebSocketJoinAudioId = maxAudioEventId(state);
    const wsJoin = await joinWebSocketAndReadState(baseUrl, "WsAudio");
    assert.equal(wsJoin.joined.version, EXPECTED_GAME_VERSION);
    assertAudioEvent(
      wsJoin.state,
      beforeWebSocketJoinAudioId,
      (event) => event.kind === "roster" && event.change === "join" && event.playerId === wsJoin.joined.id,
      "websocket join"
    );

    await assertHttpFallback(api);

    state = (await api("POST", "/api/test/players", { count: 5 })).state;
    assert.equal(state.players.filter((player) => player.role === "player").length, 4);
    assert.equal(state.players.filter((player) => player.role === "spectator").length, 1);
    assert.equal(playerAt(state, 4).team, null);
    assert.ok(Array.isArray(state.audioEvents), "state should expose server audioEvents");
    assert.ok(
      state.audioEvents.some((event) => event.kind === "roster" && event.change === "spectator" && event.playerId === playerAt(state, 4).id),
      "spectator assignment should emit roster audio event"
    );
    await assertMovementControls(api);
    await assertPlayerCanLeavePitch(api);
    await assertDayAndWeather(api);
    await assertSprintAndJump(api);
    await assertPlayerHitStamina(api);
    await assertGoalPostAndBouncePhysics(api);

    await assertKick(api, "left", { x: -0.34, y: BALL_RADIUS + 0.04, z: 1.0 }, { kickLeft: 1 });
    await assertKick(api, "hand", { x: 0.34, y: BALL_RADIUS + 0.04, z: 1.0 }, { kickRight: 1 });
    await assertKick(api, "head", { x: 0, y: BALL_RADIUS + 0.04, z: 0.95 }, { head: 1 });

    state = await prepareSinglePlayer(api);
    const bodyPlayerId = playerAt(state, 0).id;
    await api("POST", "/api/test/player/0", {
      position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
      yaw: 0,
      input: inputState({ up: true })
    });
    await api("POST", "/api/test/ball", {
      position: { x: 0, y: BALL_RADIUS + 0.04, z: 0.95 },
      velocity: { x: 0, y: 0, z: 0 }
    });
    const beforeBodyAudioId = maxAudioEventId(state);
    state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
    assert.equal(playerAt(state, 0).lastAction, "body");
    assert.ok(speed3(state.ball.velocity) > 0.5, "body contact should move the ball");
    assertAudioEvent(
      state,
      beforeBodyAudioId,
      (event) => event.kind === "kick" && event.kick === "body" && event.playerId === bodyPlayerId && event.speed > 0,
      "body contact"
    );

    await api("POST", "/api/test/players", { count: 2 });
    state = (await api("POST", "/api/test/reset", {})).state;
    const beforeGoalVariant = state.ball.variant;
    state = (await api("POST", "/api/test/ball", {
      position: { x: 0, y: BALL_RADIUS + 0.04, z: FIELD_LENGTH / 2 + 0.2 },
      velocity: { x: 0, y: 0, z: 1 }
    })).state;
    const beforeGoalAudioId = maxAudioEventId(state);
    state = (await api("POST", "/api/test/tick", { frames: 1 })).state;
    assert.equal(state.score.blue, 1);
    assert.equal(state.score.orange, 0);
    assert.ok(Math.abs(state.ball.position.x) < 0.01);
    assert.ok(Math.abs(state.ball.position.z) < 0.01);
    assert.notEqual(state.ball.variant, beforeGoalVariant, "goal reset should rotate the active ball variant");
    assert.ok(state.countdown > 0, "goal reset should start countdown");
    assertAudioEvent(state, beforeGoalAudioId, (event) => event.kind === "goal" && event.team === 0, "blue goal");
    assertAudioEvent(state, beforeGoalAudioId, (event) => event.kind === "countdown" && event.remainingSeconds > 0, "goal countdown");
    assert.ok(playerAt(state, 0).position.z < 0, "blue-side player should respawn on own half");
    assert.ok(playerAt(state, 1).position.z > 0, "orange-side player should respawn on own half");

    console.log(JSON.stringify({
      ok: true,
      port,
      version: health.version,
      checks: [
        "health",
        "websocket no-join has no phantom roster audio",
        "websocket join audioEvents",
        "http fallback join/input/state",
        "5-client role assignment",
        "team-relative WASD movement",
        "player movement beyond pitch bounds",
        "authoritative day start and weather controls",
        "sprint stamina and jump",
        "player hit stamina damage",
        "thick post rebound and bouncier ball",
        "left kick",
        "hand hit",
        "head hit",
        "body contact",
        "goal score/reset/countdown/ball variant",
        "server audioEvents roster",
        "server audioEvents kicks/body/goal/countdown"
      ]
    }, null, 2));
  } finally {
    await stopServer(child);
  }
}

async function prepareSinglePlayer(api) {
  await api("POST", "/api/test/players", { count: 1 });
  return (await api("POST", "/api/test/reset", {})).state;
}

async function assertMovementControls(api) {
  await api("POST", "/api/test/players", { count: 2 });
  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 8 },
    velocity: { x: 0, y: 0, z: 0 }
  });

  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    input: inputState({ up: true })
  });
  let state = (await api("POST", "/api/test/tick", { frames: 6 })).state;
  assert.ok(playerAt(state, 0).position.z > 0.5, "blue player W should move toward +Z/opponent goal");

  await api("POST", "/api/test/player/1", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    input: inputState({ up: true, yaw: Math.PI })
  });
  state = (await api("POST", "/api/test/tick", { frames: 6 })).state;
  assert.ok(playerAt(state, 1).position.z < -0.5, "orange player W should move toward -Z/opponent goal");
}

async function assertPlayerCanLeavePitch(api) {
  await api("POST", "/api/test/players", { count: 1 });
  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 8 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", {
    position: { x: FIELD_WIDTH / 2 - 0.1, y: PLAYER_HEIGHT / 2, z: 0 },
    input: inputState({ right: true, yaw: Math.PI / 2 })
  });
  const state = (await api("POST", "/api/test/tick", { frames: 20 })).state;
  assert.ok(
    playerAt(state, 0).position.x > FIELD_WIDTH / 2 + 1,
    "player movement should not be clamped to the pitch rectangle"
  );
}

async function assertDayAndWeather(api) {
  await api("POST", "/api/test/players", { count: 1 });
  let state = (await api("POST", "/api/test/reset", {})).state;
  assert.equal(state.weather.kind, "dawn", "server should start at dawn weather");
  assert.ok(state.weather.intensity <= 0.03, "dawn should be a bright dry low-intensity weather state");
  assert.ok(
    state.dayTimeSeconds >= DAY_START_SECONDS && state.dayTimeSeconds < DAY_START_SECONDS + 10 * 60,
    "server day time should start near 06:00 sunrise"
  );
  assert.ok(
    state.weather.nextChangeInMs <= WEATHER_CHANGE_MAX_MS && state.weather.nextChangeInMs > WEATHER_CHANGE_MIN_MS - 1_000,
    "weather should expose randomized 60-120s next-change timer"
  );

  state = (await api("POST", "/api/test/weather", { kind: "rain" })).state;
  assert.equal(state.weather.kind, "rain");
  assert.ok(state.weather.hazards.some((hazard) => hazard.type === "puddle"), "rain should expose puddle hazards");
  assert.ok(!state.weather.hazards.some((hazard) => hazard.type === "snowbank"), "rain should not include snowbanks");

  state = (await api("POST", "/api/test/weather", { kind: "clear" })).state;
  assert.equal(state.weather.kind, "clear");
  assert.ok(state.weather.intensity <= 0.03, "clear weather should not carry rain-like intensity");
  assert.equal(state.weather.hazards.length, 0, "clear weather should remove field hazards");
}

async function assertSprintAndJump(api) {
  await api("POST", "/api/test/players", { count: 1 });
  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/weather", { kind: "clear" });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 18 },
    velocity: { x: 0, y: 0, z: 0 }
  });

  await api("POST", "/api/test/player/0", {
    position: { x: -2, y: PLAYER_HEIGHT / 2, z: 0 },
    input: inputState({ up: true })
  });
  let state = (await api("POST", "/api/test/tick", { frames: 30 })).state;
  const walkZ = playerAt(state, 0).position.z;

  await api("POST", "/api/test/player/0", {
    position: { x: 2, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 100,
    input: inputState({ up: true, sprint: true })
  });
  state = (await api("POST", "/api/test/tick", { frames: 30 })).state;
  const sprinter = playerAt(state, 0);
  assert.ok(sprinter.position.z > walkZ + 1.1, "sprint should move farther than walking over the same frames");
  assert.ok(sprinter.stamina < 100, "sprint should drain stamina");
  assert.equal(sprinter.sprinting, true, "snapshot should mark sprinting players");

  const beforeJumpAudioId = maxAudioEventId(state);
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 100,
    grounded: true,
    verticalVelocity: 0,
    input: inputState({ jump: 1 })
  });
  state = (await api("POST", "/api/test/tick", { frames: 6 })).state;
  const jumper = playerAt(state, 0);
  assert.ok(jumper.position.y > PLAYER_HEIGHT / 2 + 0.15, "jump should raise the player");
  assert.equal(jumper.airborne, true, "jumping player should be airborne in snapshot");
  assert.ok(jumper.stamina < 100, "jump should spend stamina");
  assertAudioEvent(state, beforeJumpAudioId, (event) => event.kind === "kick" && event.kick === "jump", "jump");
}

async function assertPlayerHitStamina(api) {
  await api("POST", "/api/test/players", { count: 2 });
  let state = (await api("POST", "/api/test/reset", {})).state;
  const targetId = playerAt(state, 1).id;
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 100,
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/player/1", {
    position: { x: 0.25, y: PLAYER_HEIGHT / 2, z: 1.05 },
    stamina: 16,
    yaw: Math.PI,
    input: inputState()
  });
  await api("POST", "/api/test/player/0", {
    input: inputState({ kickRight: 1 })
  });
  state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
  const target = state.players.find((player) => player.id === targetId);
  assert.ok(target, "hit target should remain in state");
  assert.equal(playerAt(state, 0).lastAction, "hand");
  assert.ok(target.stamina < 16, "hand hit should drain target stamina");
  assert.equal(target.exhausted, true, "target should become exhausted at zero stamina");
}

async function assertGoalPostAndBouncePhysics(api) {
  await api("POST", "/api/test/players", { count: 0 });
  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/weather", { kind: "clear" });

  const safeRadius = GOAL_POST_RADIUS + BALL_RADIUS;
  let state = (await api("POST", "/api/test/ball", {
    position: {
      x: GOAL_WIDTH / 2 + safeRadius - 0.04,
      y: BALL_RADIUS + 0.05,
      z: FIELD_LENGTH / 2
    },
    velocity: { x: -2.2, y: 0, z: 0 }
  })).state;
  state = (await api("POST", "/api/test/tick", { frames: 1 })).state;
  assert.ok(state.ball.velocity.x > 1.2, "ball should rebound sideways from the thicker goal post collider");
  assert.ok(state.ball.velocity.y >= 0.5, "goal post rebound should add a small lift");

  state = (await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.015, z: 0 },
    velocity: { x: 0, y: -4.2, z: 0 }
  })).state;
  state = (await api("POST", "/api/test/tick", { frames: 1 })).state;
  assert.ok(state.ball.velocity.y > 2.6, "ball should be bouncy enough for head play");
  assert.ok(BALL_RESTITUTION > 1, "acceptance constants should track the bouncier server tuning");
}

async function assertKick(api, kind, ballPosition, input) {
  let state = await prepareSinglePlayer(api);
  assert.equal(state.players.length, 1);
  const playerId = playerAt(state, 0).id;
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/ball", {
    position: ballPosition,
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", { input });
  const beforeAudioId = maxAudioEventId(state);
  state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
  assert.equal(playerAt(state, 0).lastAction, kind);
  assert.ok(speed3(state.ball.velocity) > 0.5, `${kind} should move the ball`);
  assertAudioEvent(
    state,
    beforeAudioId,
    (event) => event.kind === "kick" && event.kick === kind && event.playerId === playerId && event.speed > 0,
    `${kind} kick`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
