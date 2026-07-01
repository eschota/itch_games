import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIELD_LENGTH = 36;
const BALL_RADIUS = 0.48;
const PLAYER_HEIGHT = 1.75;

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
    assert.equal(health.version, "v0.0.008");

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
    assert.equal(wsJoin.joined.version, "v0.0.008");
    assertAudioEvent(
      wsJoin.state,
      beforeWebSocketJoinAudioId,
      (event) => event.kind === "roster" && event.change === "join" && event.playerId === wsJoin.joined.id,
      "websocket join"
    );

    state = (await api("POST", "/api/test/players", { count: 5 })).state;
    assert.equal(state.players.filter((player) => player.role === "player").length, 4);
    assert.equal(state.players.filter((player) => player.role === "spectator").length, 1);
    assert.equal(playerAt(state, 4).team, null);
    assert.ok(Array.isArray(state.audioEvents), "state should expose server audioEvents");
    assert.ok(
      state.audioEvents.some((event) => event.kind === "roster" && event.change === "spectator" && event.playerId === playerAt(state, 4).id),
      "spectator assignment should emit roster audio event"
    );

    await assertKick(api, "left", { x: -0.34, y: BALL_RADIUS + 0.04, z: 1.0 }, { kickLeft: 1 });
    await assertKick(api, "right", { x: 0.34, y: BALL_RADIUS + 0.04, z: 1.0 }, { kickRight: 1 });
    await assertKick(api, "head", { x: 0, y: BALL_RADIUS + 0.04, z: 0.95 }, { head: 1 });

    state = await prepareSinglePlayer(api);
    const bodyPlayerId = playerAt(state, 0).id;
    await api("POST", "/api/test/player/0", {
      position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
      yaw: Math.PI,
      input: { up: true, down: false, left: false, right: false, kickLeft: 0, kickRight: 0, head: 0, yaw: Math.PI }
    });
    await api("POST", "/api/test/ball", {
      position: { x: 0, y: BALL_RADIUS + 0.04, z: -0.95 },
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
        "5-client role assignment",
        "left kick",
        "right kick",
        "head hit",
        "body contact",
        "goal score/reset/countdown",
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

async function assertKick(api, kind, ballPosition, input) {
  let state = await prepareSinglePlayer(api);
  assert.equal(state.players.length, 1);
  const playerId = playerAt(state, 0).id;
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    yaw: 0,
    input: { up: false, down: false, left: false, right: false, kickLeft: 0, kickRight: 0, head: 0, yaw: 0 }
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
