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
    assert.equal(health.version, "v0.0.007");

    let state = (await api("POST", "/api/test/players", { count: 5 })).state;
    assert.equal(state.players.filter((player) => player.role === "player").length, 4);
    assert.equal(state.players.filter((player) => player.role === "spectator").length, 1);
    assert.equal(playerAt(state, 4).team, null);

    await assertKick(api, "left", { x: -0.34, y: BALL_RADIUS + 0.04, z: 1.0 }, { kickLeft: 1 });
    await assertKick(api, "right", { x: 0.34, y: BALL_RADIUS + 0.04, z: 1.0 }, { kickRight: 1 });
    await assertKick(api, "head", { x: 0, y: BALL_RADIUS + 0.04, z: 0.95 }, { head: 1 });

    state = await prepareSinglePlayer(api);
    await api("POST", "/api/test/player/0", {
      position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
      yaw: Math.PI,
      input: { up: true, down: false, left: false, right: false, kickLeft: 0, kickRight: 0, head: 0, yaw: Math.PI }
    });
    await api("POST", "/api/test/ball", {
      position: { x: 0, y: BALL_RADIUS + 0.04, z: -0.95 },
      velocity: { x: 0, y: 0, z: 0 }
    });
    state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
    assert.equal(playerAt(state, 0).lastAction, "body");
    assert.ok(speed3(state.ball.velocity) > 0.5, "body contact should move the ball");

    await api("POST", "/api/test/players", { count: 2 });
    await api("POST", "/api/test/reset", {});
    await api("POST", "/api/test/ball", {
      position: { x: 0, y: BALL_RADIUS + 0.04, z: FIELD_LENGTH / 2 + 0.2 },
      velocity: { x: 0, y: 0, z: 1 }
    });
    state = (await api("POST", "/api/test/tick", { frames: 1 })).state;
    assert.equal(state.score.blue, 1);
    assert.equal(state.score.orange, 0);
    assert.ok(Math.abs(state.ball.position.x) < 0.01);
    assert.ok(Math.abs(state.ball.position.z) < 0.01);
    assert.ok(state.countdown > 0, "goal reset should start countdown");
    assert.ok(playerAt(state, 0).position.z < 0, "blue-side player should respawn on own half");
    assert.ok(playerAt(state, 1).position.z > 0, "orange-side player should respawn on own half");

    console.log(JSON.stringify({
      ok: true,
      port,
      version: health.version,
      checks: [
        "health",
        "5-client role assignment",
        "left kick",
        "right kick",
        "head hit",
        "body contact",
        "goal score/reset/countdown"
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
  state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
  assert.equal(playerAt(state, 0).lastAction, kind);
  assert.ok(speed3(state.ball.velocity) > 0.5, `${kind} should move the ball`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
