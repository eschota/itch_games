import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const EXPECTED_GAME_VERSION = String(PACKAGE.games?.unsoccer?.version || PACKAGE.gameVersion || PACKAGE.version);
const DEFAULT_GAME_SETTINGS = JSON.parse(fs.readFileSync(path.join(ROOT, "unsoccer", "game-settings.json"), "utf8"));
const FIELD_WIDTH = DEFAULT_GAME_SETTINGS.fieldWidth;
const FIELD_LENGTH = DEFAULT_GAME_SETTINGS.fieldLength;
const GOAL_WIDTH = DEFAULT_GAME_SETTINGS.goalWidth;
const GOAL_DEPTH = DEFAULT_GAME_SETTINGS.goalDepth;
const GOAL_POST_RADIUS = DEFAULT_GAME_SETTINGS.goalPostRadius;
const BALL_RADIUS = DEFAULT_GAME_SETTINGS.ballRadius;
const BALL_DENSITY = DEFAULT_GAME_SETTINGS.ballDensity;
const BALL_RESTITUTION = DEFAULT_GAME_SETTINGS.ballRestitution;
const PLAYER_HEIGHT = DEFAULT_GAME_SETTINGS.playerHeight;
const DAY_CYCLE_SECONDS = DEFAULT_GAME_SETTINGS.dayCycleSeconds;
const DAY_START_SECONDS = DEFAULT_GAME_SETTINGS.dayStartSeconds;
const POST_GOAL_CELEBRATION_MS = DEFAULT_GAME_SETTINGS.postGoalCelebrationMs;
const POST_GOAL_BALL_RETURN_MS = DEFAULT_GAME_SETTINGS.postGoalBallReturnMs;
const WEATHER_CHANGE_MIN_MS = DEFAULT_GAME_SETTINGS.weatherChangeMinMs;
const WEATHER_CHANGE_MAX_MS = DEFAULT_GAME_SETTINGS.weatherChangeMaxMs;
const KICK_SPEED_MAX = 55;
const BODY_BUMP_SPEED_MAX = 6;
const MAX_ACTIVE_PLAYERS = DEFAULT_GAME_SETTINGS.maxActivePlayers;
const CHARACTER_ROSTER = [
  "6299851",
  "6243756",
  "6270571",
  "6324128",
  "6244727",
  "6288738",
  "6304269",
  "6298522",
  "6255142",
  "6294728",
  "666dc6f4-0cc4-4714-a7cf-39cfb6655fe8"
];
const CHARACTER_ROSTER_SET = new Set(CHARACTER_ROSTER);

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

function speed2(velocity) {
  return Math.hypot(velocity.x, velocity.z);
}

function inputState(patch = {}) {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    kickLeft: 0,
    kickLeftHeld: false,
    kickLeftCharge: 0,
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

function activePlayers(state) {
  return state.players.filter((player) => player.role === "player");
}

function playersByController(state, controller) {
  return state.players.filter((player) => player.controller === controller);
}

function activePlayersByController(state, controller) {
  return activePlayers(state).filter((player) => player.controller === controller);
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

async function joinWebSocketAndReadState(baseUrl, name, extraJoinData = {}) {
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
      ws.send(JSON.stringify({ event: "join", data: { name, ...extraJoinData } }));
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

async function assertWebSocketChatEmotion(baseUrl) {
  assert.equal(typeof WebSocket, "function", "Node runtime should expose WebSocket");
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketUrl(baseUrl));
    let joined = null;
    let sawChat = false;
    let sawEmotion = false;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("websocket chat/emotion timed out"));
    }, 3500);
    const finish = () => {
      if (!joined || !sawChat || !sawEmotion) return;
      clearTimeout(timer);
      ws.close();
      resolve();
    };
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        event: "join",
        data: {
          name: "WsProfile",
          profile: {
            nickname: "WsProfile",
            skinId: CHARACTER_ROSTER[1],
            userPic: "WS"
          }
        }
      }));
    });
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.event === "joined") {
        joined = message.data;
        assert.equal(joined.profile.nickname, "WsProfile", "websocket join should accept profile nickname");
        assert.equal(joined.profile.skinId, CHARACTER_ROSTER[1], "websocket join should accept profile skin");
        ws.send(JSON.stringify({ event: "chat", data: { text: "ws hello" } }));
        ws.send(JSON.stringify({ event: "emotion", data: { emotionId: "heart" } }));
      }
      if (message.event === "state" && joined) {
        const state = message.data;
        sawChat = sawChat || state.chatMessages?.some((item) => item.playerId === joined.id && item.text === "ws hello");
        const player = state.players?.find((item) => item.id === joined.id);
        sawEmotion = sawEmotion || player?.emotion?.id === "heart";
        finish();
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("websocket chat/emotion failed"));
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

  state = (await api("POST", "/api/test/tick", { frames: 12 })).state;
  assert.ok(playerAt(state, join.joined.index).position.z > 0.5, "http fallback input should move blue player toward +Z");

  state = (await api("GET", `/api/state?clientId=${encodeURIComponent(join.joined.id)}`)).state;
  assert.ok(playerAt(state, join.joined.index).position.z > 0.5, "http fallback state should expose latest movement");

  await api("POST", "/api/leave", { clientId: join.joined.id });
  state = (await api("GET", "/api/test/state")).state;
  assert.ok(!state.players.some((player) => player.id === join.joined.id), "http fallback leave should remove player");
}

async function assertCommunicationProfileAndCombatSides(api, baseUrl) {
  await api("POST", "/api/test/players", { count: 0 });
  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/bots", { enabled: false });

  const join = await api("POST", "/api/join", {
    name: "HttpProfile",
    profile: {
      nickname: "HttpHero",
      skinId: CHARACTER_ROSTER[2],
      userPic: "HP"
    }
  });
  assert.equal(join.joined.profile.nickname, "HttpHero", "http join should accept profile nickname");
  assert.equal(join.joined.profile.skinId, CHARACTER_ROSTER[2], "http join should accept profile skin");
  let player = join.state.players.find((item) => item.id === join.joined.id);
  assert.equal(player.userPic, "HP", "player snapshot should expose user_pic");
  assert.equal(player.profile.userPic, "HP", "profile snapshot should expose user_pic");

  let payload = await api("POST", "/api/chat", { clientId: join.joined.id, text: "  hello team  " });
  assert.equal(payload.ok, true, "http chat should return ok");
  assert.ok(payload.state.chatMessages.some((item) => item.playerId === join.joined.id && item.text === "hello team"), "state should expose chat ring message");

  payload = await api("POST", "/api/emotion", { clientId: join.joined.id, emotionId: "fire" });
  player = payload.state.players.find((item) => item.id === join.joined.id);
  assert.equal(player.emotion.id, "fire", "http emotion should replicate through player snapshot");

  payload = await api("POST", "/api/profile", {
    clientId: join.joined.id,
    profile: {
      nickname: "HttpRenamed",
      skinId: CHARACTER_ROSTER[3],
      userPic: "HR"
    }
  });
  assert.equal(payload.joined.profile.nickname, "HttpRenamed", "http profile endpoint should update nickname");
  assert.equal(payload.joined.profile.skinId, CHARACTER_ROSTER[3], "http profile endpoint should update skin");
  player = payload.state.players.find((item) => item.id === join.joined.id);
  assert.equal(player.name, "HttpRenamed", "player snapshot name should follow profile nickname");
  assert.equal(player.characterId, CHARACTER_ROSTER[3], "player snapshot characterId should follow profile skin");

  await api("POST", "/api/leave", { clientId: join.joined.id });
  await assertWebSocketChatEmotion(baseUrl);

  await api("POST", "/api/test/players", { count: 1 });
  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/weather", { kind: "clear" });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 100,
    yaw: 0,
    trailingFoot: "right",
    input: inputState()
  });
  let state = (await api("POST", "/api/test/ball", {
    position: { x: 0.34, y: BALL_RADIUS + 0.04, z: 1.0 },
    velocity: { x: 0, y: 0, z: 0 }
  })).state;
  await api("POST", "/api/test/player/0", { input: inputState({ kickLeft: 1 }) });
  state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
  player = playerAt(state, 0);
  assert.equal(player.lastAction, "left", "LMB foot kick should still report legacy action kind");
  assert.equal(player.lastActionSide, "right", "foot kick should resolve to the current trailing foot");
  assert.equal(player.trailingFoot, "right", "snapshot should expose current trailing foot");

  await api("POST", "/api/test/players", { count: 1 });
  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/weather", { kind: "clear" });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 100,
    yaw: 0,
    input: inputState({ kickRight: 1 })
  });
  state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
  player = playerAt(state, 0);
  assert.equal(player.lastAction, "hand", "RMB should trigger hand punch");
  assert.equal(player.lastActionSide, "right", "first hand punch should use right hand");

  await api("POST", "/api/test/player/0", { input: inputState() });
  await api("POST", "/api/test/tick", { frames: 30 });
  await api("POST", "/api/test/player/0", { stamina: 100, input: inputState({ kickRight: 2 }) });
  state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
  player = playerAt(state, 0);
  assert.equal(player.lastAction, "hand", "second RMB should still trigger hand punch");
  assert.equal(player.lastActionSide, "left", "hand punch should alternate left after right");
}

async function assertBotSettingsCors(baseUrl) {
  const response = await fetch(`${baseUrl}/api/bot-settings`, {
    method: "OPTIONS",
    headers: {
      origin: "http://127.0.0.1:5174",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type"
    }
  });
  assert.equal(response.status, 204, "bot settings endpoint should answer CORS preflight");
  assert.equal(response.headers.get("access-control-allow-origin"), "*", "bot settings CORS should allow dev static pages");
  assert.ok(
    String(response.headers.get("access-control-allow-methods") || "").includes("POST"),
    "bot settings CORS should allow POST"
  );
}

async function assertGameSettingsApi(api, baseUrl, settingsFile) {
  const cors = await fetch(`${baseUrl}/api/game-settings`, {
    method: "OPTIONS",
    headers: {
      origin: "http://127.0.0.1:5174",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type"
    }
  });
  assert.equal(cors.status, 204, "game settings endpoint should answer CORS preflight");
  assert.equal(cors.headers.get("access-control-allow-origin"), "*", "game settings CORS should allow static admin page");

  const initial = await api("GET", "/api/game-settings");
  assert.equal(initial.ok, true, "game settings GET should return ok");
  assert.equal(initial.version, EXPECTED_GAME_VERSION);
  assert.ok(Array.isArray(initial.schema) && initial.schema.length > 20, "game settings should expose a schema for the admin UI");
  assert.deepEqual(
    initial.schema.map((item) => item.key).sort(),
    Object.keys(DEFAULT_GAME_SETTINGS).sort(),
    "game settings schema should expose every JSON/defaults key"
  );
  assert.equal(initial.settings.playerSpeed, DEFAULT_GAME_SETTINGS.playerSpeed, "settings should load playerSpeed from JSON");
  assert.equal(initial.settings.maxActivePlayers, DEFAULT_GAME_SETTINGS.maxActivePlayers, "settings should load active player limit from JSON");
  assert.equal(initial.state.settingsRevision, initial.revision, "state should expose the active settings revision");
  assert.equal(initial.state.settings.playerSpeed, initial.settings.playerSpeed, "state should carry active runtime settings to clients");

  await api("POST", "/api/test/players", { count: 0 });
  for (const item of initial.schema) {
    const key = item.key;
    const testValue = roundtripSettingValue(item, DEFAULT_GAME_SETTINGS[key]);
    const changed = await api("POST", "/api/game-settings", { settings: { [key]: testValue } });
    assertSettingValue(changed.settings[key], testValue, `game settings POST should accept ${key}`);
    const readBack = await api("GET", "/api/game-settings");
    assertSettingValue(readBack.settings[key], testValue, `game settings GET should read back ${key}`);
  }

  await api("POST", "/api/game-settings", { settings: DEFAULT_GAME_SETTINGS });

  let payload = await api("POST", "/api/game-settings", {
    settings: {
      playerSpeed: 4.1,
      botAggression: 9
    }
  });
  assert.equal(payload.settings.playerSpeed, 4.1, "game settings POST should apply partial numeric updates");
  assert.equal(payload.settings.botAggression, 1, "game settings POST should clamp schema-bounded values");
  assert.ok(payload.revision > initial.revision, "game settings POST should advance revision");

  await api("POST", "/api/test/bots", { enabled: false });
  await api("POST", "/api/test/players", { count: 1 });
  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    input: inputState({ up: true })
  });
  let state = (await api("POST", "/api/test/tick", { frames: 24 })).state;
  const slowDistance = playerAt(state, 0).position.z;

  await api("POST", "/api/game-settings", { settings: { playerSpeed: 12.4 } });
  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    input: inputState({ up: true })
  });
  state = (await api("POST", "/api/test/tick", { frames: 24 })).state;
  assert.ok(playerAt(state, 0).position.z > slowDistance * 1.6, "runtime playerSpeed should affect movement without rebuilding");

  const fileSettings = {
    ...payload.settings,
    playerSpeed: 6.2,
    weatherClearWeight: 24
  };
  fs.writeFileSync(settingsFile, `${JSON.stringify(fileSettings, null, 2)}\n`, "utf8");
  payload = await api("POST", "/api/game-settings/reload", {});
  assert.equal(payload.settings.playerSpeed, 6.2, "game settings reload should read the JSON file");
  assert.equal(payload.settings.weatherClearWeight, 24, "game settings reload should preserve file-edited weather weights");

  payload = await api("POST", "/api/game-settings", { settings: DEFAULT_GAME_SETTINGS });
  assert.equal(payload.settings.playerSpeed, DEFAULT_GAME_SETTINGS.playerSpeed, "game settings should restore defaults for later checks");
  assert.equal(payload.settings.maxActivePlayers, DEFAULT_GAME_SETTINGS.maxActivePlayers, "restored settings should keep default active player limit");
}

function roundtripSettingValue(item, current) {
  if (item.input === "checkbox" || typeof current === "boolean") return !Boolean(current);
  const step = Number(item.step ?? 1);
  const min = item.min === undefined ? Number.NEGATIVE_INFINITY : Number(item.min);
  const max = item.max === undefined ? Number.POSITIVE_INFINITY : Number(item.max);
  const base = Number(current);
  const forward = base + (Number.isFinite(step) && step > 0 ? step : 1);
  if (Number.isFinite(forward) && forward <= max && forward >= min) return roundedForStep(forward, step);
  const backward = base - (Number.isFinite(step) && step > 0 ? step : 1);
  if (Number.isFinite(backward) && backward <= max && backward >= min) return roundedForStep(backward, step);
  if (Number.isFinite(min) && min !== base) return roundedForStep(min, step);
  if (Number.isFinite(max) && max !== base) return roundedForStep(max, step);
  return roundedForStep(base, step);
}

function roundedForStep(value, step) {
  const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
  return Number(value.toFixed(Math.min(8, decimals + 2)));
}

function assertSettingValue(actual, expected, message) {
  if (typeof expected === "number") {
    assert.ok(Math.abs(Number(actual) - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
  } else {
    assert.equal(actual, expected, message);
  }
}

async function assertBotsFillAndDisplace(api) {
  await api("POST", "/api/test/players", { count: 0 });
  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/weather", { kind: "clear" });

  let payload = await api("POST", "/api/bot-settings", {
    settings: {
      enabled: true,
      targetActivePlayers: 3,
      aggression: 0.82,
      shootDistance: 2.9,
      fightDistance: 1.72,
      shotAlignmentMin: -0.14,
      supportReleaseDistance: 5.35
    }
  });
  assert.equal(payload.settings.enabled, true, "bot settings endpoint should persist enabled=true");
  assert.equal(payload.settings.targetActivePlayers, 3, "bot settings endpoint should apply targetActivePlayers");
  assert.equal(payload.settings.shotAlignmentMin, -0.14, "bot settings endpoint should apply shotAlignmentMin");
  assert.equal(payload.settings.supportReleaseDistance, 5.35, "bot settings endpoint should apply supportReleaseDistance");
  assert.equal(payload.state.settings.botShotAlignmentMin, -0.14, "bot settings should sync shot alignment into game settings");
  assert.equal(payload.state.settings.botSupportReleaseDistance, 5.35, "bot settings should sync support release into game settings");
  assert.equal(activePlayersByController(payload.state, "bot").length, 3, "bot settings endpoint should apply fill count immediately");

  payload = await api("POST", "/api/test/bots", {
    enabled: true,
    settings: deterministicBotSettings({ targetActivePlayers: MAX_ACTIVE_PLAYERS })
  });
  let state = payload.state;
  assert.equal(activePlayers(state).length, MAX_ACTIVE_PLAYERS, "bot fill should create ten active players");
  assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS, "all initial active players should be bots");
  assert.equal(activePlayersByController(state, "human").length, 0, "bot-only test should not create human players");
  assert.deepEqual(
    activePlayers(state).map((player) => player.team),
    [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    "bot fill should split active teams 5v5"
  );
  assert.ok(
    activePlayersByController(state, "bot").every((player) => !/^bot\b/i.test(player.name)),
    "bot display names should look like player names without a Bot prefix"
  );
  const firstBotIds = new Set(activePlayersByController(state, "bot").map((player) => player.id));

  const joinOne = await api("POST", "/api/join", { name: "Human One" });
  state = joinOne.state;
  assert.equal(activePlayers(state).length, MAX_ACTIVE_PLAYERS, "one human plus bots should still fill ten active slots");
  assert.equal(activePlayersByController(state, "human").length, 1, "one joined human should be active");
  assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS - 1, "one joined human should remove one bot");
  assert.equal(playerAt(state, joinOne.joined.index).controller, "human", "joined player snapshot should be human controlled");
  assert.ok(
    activePlayersByController(state, "bot").some((player) => firstBotIds.has(player.id)),
    "remaining active bots should keep stable runtime ids"
  );
  let health = await api("GET", "/api/health");
  assert.equal(health.connectedClients, 1, "bots should not consume connected client capacity");
  assert.equal(health.activePlayers, MAX_ACTIVE_PLAYERS, "health activePlayers should include bots filling the match");

  const joinTwo = await api("POST", "/api/join", { name: "Human Two" });
  state = joinTwo.state;
  assert.equal(activePlayers(state).length, MAX_ACTIVE_PLAYERS, "two humans plus bots should still fill ten active slots");
  assert.equal(activePlayersByController(state, "human").length, 2, "two joined humans should be active");
  assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS - 2, "two joined humans should leave eight active bots");
  health = await api("GET", "/api/health");
  assert.equal(health.connectedClients, 2, "health connectedClients should count humans only");

  await api("POST", "/api/leave", { clientId: joinOne.joined.id });
  state = (await api("GET", "/api/test/state")).state;
  assert.equal(activePlayersByController(state, "human").length, 1, "leaving one human should remove that human");
  assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS - 1, "leaving one human should backfill one bot");

  await api("POST", "/api/leave", { clientId: joinTwo.joined.id });
  state = (await api("GET", "/api/test/state")).state;
  assert.equal(activePlayersByController(state, "human").length, 0, "all humans should be gone after leave");
  assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS, "bot-only fill should restore ten active bots");
}

async function assertBotsFight(api) {
  let state = await enableBotMatch(api, {
    targetActivePlayers: 4,
    aggression: 1,
    fightDistance: 1.9,
    handIntervalMs: 260,
    kickIntervalMs: 220,
    headIntervalMs: 360
  });
  const attackerId = playerAt(state, 0).id;
  const targetId = playerAt(state, 1).id;
  await api("POST", "/api/test/ball", {
    position: { x: 10, y: BALL_RADIUS + 0.04, z: 18 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 100,
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/player/1", {
    position: { x: 0.15, y: PLAYER_HEIGHT / 2, z: 1.05 },
    stamina: 36,
    yaw: Math.PI,
    input: inputState()
  });
  for (const index of [2, 3]) {
    await api("POST", `/api/test/player/${index}`, {
      position: { x: index === 2 ? -9 : 9, y: PLAYER_HEIGHT / 2, z: -12 },
      input: inputState()
    });
  }
  const beforeAudioId = maxAudioEventId(state);
  state = (await api("POST", "/api/test/tick", { frames: 12 })).state;
  const attacker = state.players.find((player) => player.id === attackerId);
  const target = state.players.find((player) => player.id === targetId);
  assert.ok(attacker && target, "bot fight actors should remain in state");
  assert.ok(
    [attacker.lastAction, target.lastAction].some((action) => ["hand", "left", "head"].includes(action)),
    "close opposing bots should use active combat actions"
  );
  assert.ok(
    attacker.stamina < 100 || target.stamina < 36 || attacker.ragdoll || target.ragdoll,
    "bot combat should change stamina or ragdoll state"
  );
  assertAudioEvent(
    state,
    beforeAudioId,
    (event) => event.kind === "kick" && ["hand", "left", "head"].includes(event.kick) && String(event.playerId).startsWith("bot-"),
    "bot combat"
  );
}

async function assertSupportBotsPressureOpponents(api) {
  let state = await enableBotMatch(api, {
    targetActivePlayers: 6,
    aggression: 0.9,
    fightDistance: 1.9,
    supportReleaseDistance: 3,
    handIntervalMs: 240,
    kickIntervalMs: 220,
    headIntervalMs: 360
  });
  const supportId = playerAt(state, 2).id;
  const targetId = playerAt(state, 3).id;
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 0 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  const placements = [
    { index: 0, x: -0.2, z: -0.9, yaw: 0 },
    { index: 1, x: -8, z: 8, yaw: Math.PI },
    { index: 2, x: 1.5, z: -1.1, yaw: 0 },
    { index: 3, x: 1.65, z: 0.05, yaw: Math.PI },
    { index: 4, x: -9, z: -9, yaw: 0 },
    { index: 5, x: 9, z: 9, yaw: Math.PI }
  ];
  for (const placement of placements) {
    await api("POST", `/api/test/player/${placement.index}`, {
      position: { x: placement.x, y: PLAYER_HEIGHT / 2, z: placement.z },
      stamina: 100,
      yaw: placement.yaw,
      input: inputState()
    });
  }
  state = (await api("GET", "/api/test/state")).state;
  const beforeAudioId = maxAudioEventId(state);
  state = (await api("POST", "/api/test/tick", { frames: 14 })).state;
  const support = state.players.find((player) => player.id === supportId);
  const target = state.players.find((player) => player.id === targetId);
  assert.ok(support && target, "support pressure actors should remain in state");
  assert.ok(
    ["hand", "left", "head"].includes(support.lastAction),
    "non-primary support bot should actively fight an opponent threatening the ball"
  );
  assert.ok(
    support.stamina < 100 || target.stamina < 100 || support.ragdoll || target.ragdoll,
    "support pressure should spend stamina or damage the opponent through combat"
  );
  assertAudioEvent(
    state,
    beforeAudioId,
    (event) => event.kind === "kick" && ["hand", "left", "head"].includes(event.kick) && event.playerId === supportId,
    "support bot pressure combat"
  );
}

async function assertBotsScoreBothTeams(api) {
  await assertBotScoresForTeam(api, 0);
  await assertBotScoresForTeam(api, 1);
}

async function assertDefaultBotsProduceGoal(api) {
  await api("POST", "/api/test/players", { count: 0 });
  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/weather", { kind: "clear" });
  const defaults = (await api("GET", "/api/bot-settings")).defaults;
  let state = (await api("POST", "/api/test/bots", {
    enabled: true,
    settings: defaults
  })).state;
  const beforeAudioId = maxAudioEventId(state);
  for (let second = 0; second < 16; second += 1) {
    state = (await api("POST", "/api/test/tick", { frames: 60 })).state;
    if (state.score.blue + state.score.orange > 0) break;
  }
  assert.ok(state.score.blue + state.score.orange > 0, "default bot match should produce a first goal");
  assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS, "default bot match should keep ten bot players active");
  assert.ok(
    activePlayersByController(state, "bot").every((player) => !/^bot\b/i.test(player.name)),
    "default bot match should expose player-like names"
  );
  assert.equal(
    activePlayers(state).filter((player) => player.ragdoll || player.exhausted).length,
    0,
    "default bot match should score without stamina exhaustion or ragdoll collapse"
  );
  assertAudioEvent(
    state,
    beforeAudioId,
    (event) => event.kind === "goal",
    "default bot match goal"
  );
}

async function assertBotScoresForTeam(api, team) {
  let state = await enableBotMatch(api, {
    targetActivePlayers: 4,
    aggression: 0,
    shootDistance: 3.2,
    kickIntervalMs: 200,
    handIntervalMs: 1000,
    headIntervalMs: 1200
  });
  const scorerIndex = team === 0 ? 0 : 1;
  const scorer = playerAt(state, scorerIndex);
  const attackDirection = team === 0 ? 1 : -1;
  const ballZ = attackDirection > 0 ? FIELD_LENGTH / 2 - 2.1 : -FIELD_LENGTH / 2 + 2.1;
  const botZ = ballZ - attackDirection * 1.08;
  for (const index of [0, 1, 2, 3]) {
    await api("POST", `/api/test/player/${index}`, {
      position: {
        x: index === scorerIndex ? 0 : (index === 2 ? -9 : 9),
        y: PLAYER_HEIGHT / 2,
        z: index === scorerIndex ? botZ : -attackDirection * 10
      },
      stamina: 100,
      yaw: attackDirection > 0 ? 0 : Math.PI,
      input: inputState()
    });
  }
  state = (await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: ballZ },
    velocity: { x: 0, y: 0, z: 0 }
  })).state;
  const beforeAudioId = maxAudioEventId(state);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    state = (await api("POST", "/api/test/tick", { frames: 30 })).state;
    if ((team === 0 && state.score.blue > 0) || (team === 1 && state.score.orange > 0)) break;
  }
  if (team === 0) assert.equal(state.score.blue, 1, "team-0 bot should score for blue through bot AI");
  else assert.equal(state.score.orange, 1, "team-1 bot should score for orange through bot AI");
  assertAudioEvent(
    state,
    beforeAudioId,
    (event) => event.kind === "kick" && event.playerId === scorer.id,
    `team-${team} bot scoring kick`
  );
  assertAudioEvent(
    state,
    beforeAudioId,
    (event) => event.kind === "goal" && event.team === team,
    `team-${team} bot goal`
  );
}

async function enableBotMatch(api, patch = {}) {
  await api("POST", "/api/test/players", { count: 0 });
  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/weather", { kind: "clear" });
  return (await api("POST", "/api/test/bots", {
    enabled: true,
    settings: deterministicBotSettings(patch)
  })).state;
}

function deterministicBotSettings(patch = {}) {
  return {
    enabled: true,
    targetActivePlayers: MAX_ACTIVE_PLAYERS,
    aggression: 0.85,
    shootDistance: 2.95,
    fightDistance: 1.72,
    chaseDistance: 4.8,
    sprintDistance: 4.8,
    shotAlignmentMin: 0.18,
    supportReleaseDistance: 2.2,
    kickIntervalMs: 260,
    handIntervalMs: 360,
    headIntervalMs: 520,
    jumpChance: 0,
    ...patch
  };
}

async function main() {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), "unsoccer-settings-"));
  const settingsFile = path.join(settingsDir, "game-settings.json");
  fs.writeFileSync(settingsFile, `${JSON.stringify(DEFAULT_GAME_SETTINGS, null, 2)}\n`, "utf8");
  const stdoutLines = [];
  const stderrLines = [];
  let exitCode = null;
  const child = spawn(process.execPath, ["unsoccer/server/dist/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      UNSOCCER_PORT: String(port),
      UNSOCCER_TEST_MODE: "1",
      UNSOCCER_LOCAL_ICE: "1",
      UNSOCCER_GAME_SETTINGS_FILE: settingsFile
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
    await assertCommunicationProfileAndCombatSides(api, baseUrl);
    await assertBotSettingsCors(baseUrl);
    await assertGameSettingsApi(api, baseUrl, settingsFile);
    await assertBotsFillAndDisplace(api);
    await assertBotsFight(api);
    await assertSupportBotsPressureOpponents(api);
    await assertBotsScoreBothTeams(api);
    await assertDefaultBotsProduceGoal(api);
    await api("POST", "/api/test/bots", { enabled: false });
    await api("POST", "/api/test/weather", { kind: "dawn" });

    state = (await api("POST", "/api/test/players", { count: MAX_ACTIVE_PLAYERS + 1 })).state;
    assert.equal(state.players.filter((player) => player.role === "player").length, MAX_ACTIVE_PLAYERS);
    assert.equal(state.players.filter((player) => player.role === "spectator").length, 1);
    assert.equal(playerAt(state, MAX_ACTIVE_PLAYERS).team, null);
    const assignedCharacters = state.players.map((player) => player.characterId);
    assert.ok(
      assignedCharacters.every((characterId) => CHARACTER_ROSTER_SET.has(characterId)),
      "all players should receive a character from the ready runtime roster"
    );
    assert.ok(
      new Set(assignedCharacters).size >= Math.min(assignedCharacters.length, 6),
      "new players should draw varied random characters from the ready roster deck"
    );
    assert.ok(Array.isArray(state.audioEvents), "state should expose server audioEvents");
    assert.ok(
      state.audioEvents.some((event) => event.kind === "roster" && event.change === "spectator" && event.playerId === playerAt(state, MAX_ACTIVE_PLAYERS).id),
      "spectator assignment should emit roster audio event"
    );
    await assertMovementControls(api);
    await assertPlayerCanLeavePitch(api);
    await assertDayAndWeather(api);
    await assertSprintAndJump(api);
    await assertPlayerHitStamina(api);
    await assertEmptySpaceStrikeVisuals(api);
    await assertGoalPostAndBouncePhysics(api);

    await assertKick(api, "left", { x: -0.34, y: BALL_RADIUS + 0.04, z: 1.0 }, { kickLeft: 1 });
    await assertKick(api, "hand", { x: 0.34, y: BALL_RADIUS + 0.04, z: 1.0 }, { kickRight: 1 });
    await assertKick(api, "head", { x: 0, y: PLAYER_HEIGHT - BALL_RADIUS * 0.1, z: 0.95 }, { head: 1 });
    await assertFriendlyKickPriority(api);
    await assertFriendlyKickAssist(api);
    await assertLeftKickInputBuffer(api);
    await assertLeftKickCharge(api);
    await assertJumpClearsGroundBall(api);
    await assertHeadRequiresReachableHeight(api);

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
    state = (await api("POST", "/api/test/tick", { frames: 12 })).state;
    assert.equal(playerAt(state, 0).lastAction, "body");
    const bodyBallSpeed = speed3(state.ball.velocity);
    assert.ok(bodyBallSpeed > 0.15, "body contact should softly nudge the ball");
    assert.ok(bodyBallSpeed < BODY_BUMP_SPEED_MAX, "body contact should not compete with active kicks");
    assertAudioEvent(
      state,
      beforeBodyAudioId,
      (event) => event.kind === "kick" && event.kick === "body" && event.playerId === bodyPlayerId && event.speed > 0,
      "body contact"
    );

    await api("POST", "/api/test/players", { count: 4 });
    state = (await api("POST", "/api/test/reset", {})).state;
    const beforeGoalVariant = state.ball.variant;
    state = (await api("POST", "/api/test/ball", {
      position: { x: 0, y: BALL_RADIUS + 0.04, z: FIELD_LENGTH / 2 - 0.12 },
      velocity: { x: 0, y: 0, z: 5 }
    })).state;
    const beforeGoalAudioId = maxAudioEventId(state);
    state = (await api("POST", "/api/test/tick", { frames: 4 })).state;
    assert.equal(state.score.blue, 1);
    assert.equal(state.score.orange, 0);
    const scoredBallDistance = Math.hypot(state.ball.position.x, state.ball.position.z);
    assert.ok(scoredBallDistance > FIELD_LENGTH / 2 - 2, "ball should stay near the scored goal during celebration");
    assert.equal(state.goalReset.phase, "celebration", "goal reset should start with a celebration phase");
    assert.equal(state.goalReset.scoringTeam, 0, "goal reset should expose the scoring team");
    assert.ok(state.goalReset.remainingMs > POST_GOAL_CELEBRATION_MS - 500, "celebration phase should keep the ball in play briefly");
    assert.equal(state.ball.variant, beforeGoalVariant, "ball variant should not rotate before the kickoff return completes");
    assert.equal(state.countdown, 0, "kickoff countdown should wait until the ball returns to center");
    assertAudioEvent(state, beforeGoalAudioId, (event) => event.kind === "goal" && event.team === 0, "blue goal");
    assert.ok(
      playerAt(state, 0).celebrationAvailableUntil > state.serverTime,
      "scoring team player should receive a post-goal celebration input window"
    );
    assert.ok(
      playerAt(state, 2).celebrationAvailableUntil > state.serverTime,
      "all scoring team players should receive a post-goal celebration input window"
    );
    assert.ok(
      playerAt(state, 1).celebrationAvailableUntil <= state.serverTime,
      "opposing team player should not receive the scoring team's celebration window"
    );
    assert.ok(
      playerAt(state, 3).celebrationAvailableUntil <= state.serverTime,
      "second opposing team player should not receive the scoring team's celebration window"
    );
    const celebrationInputs = [
      [0, "celebrate1", { kickLeft: 1 }],
      [2, "celebrate2", { kickRight: 1 }],
      [0, "celebrate3", { head: 1 }]
    ];
    for (const [playerIndex, celebration, input] of celebrationInputs) {
      const celebratorId = playerAt(state, playerIndex).id;
      const beforeCelebrationAudioId = maxAudioEventId(state);
      await api("POST", `/api/test/player/${playerIndex}`, { input: inputState(input) });
      state = (await api("POST", "/api/test/tick", { frames: 2 })).state;
      assert.equal(playerAt(state, playerIndex).celebration, celebration, `${celebration} should be selected by scoring team input`);
      assert.ok(playerAt(state, playerIndex).celebrationAt > 0, `${celebration} should expose celebrationAt`);
      assertAudioEvent(
        state,
        beforeCelebrationAudioId,
        (event) => event.kind === "celebration" && event.celebration === celebration && event.playerId === celebratorId,
        `${celebration} celebration`
      );
    }

    state = (await api("POST", "/api/test/tick", {
      frames: Math.ceil((POST_GOAL_CELEBRATION_MS + POST_GOAL_BALL_RETURN_MS * 0.5) / (1000 / 60))
    })).state;
    assert.equal(state.goalReset.phase, "returning", "ball should enter a one-second return flight after celebration");
    assert.ok(state.goalReset.returnProgress > 0.1 && state.goalReset.returnProgress < 0.95, "return flight should expose smooth progress");
    assert.ok(
      Math.hypot(state.ball.position.x, state.ball.position.z) < scoredBallDistance,
      "returning ball should move toward kickoff instead of teleporting"
    );

    state = (await api("POST", "/api/test/tick", {
      frames: Math.ceil((POST_GOAL_BALL_RETURN_MS * 0.5 + 600) / (1000 / 60))
    })).state;
    assert.ok(Math.abs(state.ball.position.x) < 0.01);
    assert.ok(Math.abs(state.ball.position.z) < 0.01);
    assert.notEqual(state.ball.variant, beforeGoalVariant, "goal reset should rotate the active ball variant after return");
    assert.ok(state.countdown > 0, "goal reset should start countdown after ball return");
    assert.equal(state.goalReset.phase, "kickoff", "goal reset should enter kickoff countdown after ball return");
    assertAudioEvent(state, beforeGoalAudioId, (event) => event.kind === "countdown" && event.remainingSeconds > 0, "goal countdown");
    assert.ok(playerAt(state, 0).position.z < 0, "blue-side player should respawn on own half");
    assert.ok(playerAt(state, 1).position.z > 0, "orange-side player should respawn on own half");
    assert.ok(playerAt(state, 2).position.z < 0, "second blue-side player should respawn on own half");
    assert.ok(playerAt(state, 3).position.z > 0, "second orange-side player should respawn on own half");

    state = (await api("POST", "/api/test/reset", {})).state;
    state = (await api("POST", "/api/test/ball", {
      position: { x: 0, y: BALL_RADIUS + 0.04, z: FIELD_LENGTH / 2 + GOAL_DEPTH - 0.35 },
      velocity: { x: 0, y: 0, z: -1.5 }
    })).state;
    state = (await api("POST", "/api/test/tick", { frames: 4 })).state;
    assert.equal(state.score.blue, 0, "ball entering the goal volume from behind must not score");
    assert.equal(state.score.orange, 0, "back-net entry should not affect either score");

    console.log(JSON.stringify({
      ok: true,
      port,
      version: health.version,
      checks: [
        "health",
        "websocket no-join has no phantom roster audio",
        "websocket join audioEvents",
        "http fallback join/input/state",
        "communication profile chat emotion and side-aware combat",
        "runtime game settings API/schema/clamp/reload",
        "bot settings CORS and apply endpoint",
        "bots fill active slots to ten",
        "human joins displace bots and do not exceed ten active players",
        "bots do not consume connected client capacity",
        "bot AI fighting through server combat",
        "support bot pressure fighting through server combat",
        "bot-only scoring fixtures for blue and orange",
        "default bot match produces a first goal without collapse",
        "11-client role assignment",
        "random non-repeating ready character assignment",
        "team-relative WASD movement",
        "smoothed keyboard axes and acceleration",
        "player movement beyond pitch bounds",
        "authoritative day start and weather controls",
        "sprint stamina, jump, and ragdoll exhaustion",
        "player hit stamina damage and ragdoll knockout",
        "thin post rebound and bouncier ball",
        "balanced half-size ball impulses",
        "left kick",
        "hand hit",
        "head hit",
        "active strike priority over body contact",
        "friendly left kick assist reach",
        "left kick input buffer",
        "left kick charge scalar",
        "airborne body clearance",
        "head height gate",
        "body contact",
        "delayed goal celebration and smooth ball return",
        "post-goal scoring team celebrations",
        "server audioEvents roster",
        "server audioEvents kicks/body/goal/countdown/celebration"
      ]
    }, null, 2));
  } finally {
    await stopServer(child);
    fs.rmSync(settingsDir, { recursive: true, force: true });
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
  let state = (await api("POST", "/api/test/tick", { frames: 12 })).state;
  assert.ok(playerAt(state, 0).position.z > 0.5, "blue player W should move toward +Z/opponent goal");

  await api("POST", "/api/test/player/1", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    input: inputState({ up: true, yaw: Math.PI })
  });
  state = (await api("POST", "/api/test/tick", { frames: 12 })).state;
  assert.ok(playerAt(state, 1).position.z < -0.5, "orange player W should move toward -Z/opponent goal");

  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    input: inputState({ right: true })
  });
  state = (await api("POST", "/api/test/tick", { frames: 1 })).state;
  const firstRightSpeed = speed2(playerAt(state, 0).velocity);
  state = (await api("POST", "/api/test/tick", { frames: 24 })).state;
  const acceleratedRight = playerAt(state, 0);
  assert.ok(speed2(acceleratedRight.velocity) > firstRightSpeed + 2.5, "keyboard movement should ramp up instead of starting at full speed");

  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    input: inputState({ up: true, right: true })
  });
  state = (await api("POST", "/api/test/tick", { frames: 24 })).state;
  const diagonalBeforeRelease = playerAt(state, 0).velocity;
  assert.ok(diagonalBeforeRelease.x > 2 && diagonalBeforeRelease.z > 2, "diagonal movement should build both axes");
  await api("POST", "/api/test/player/0", { input: inputState({ up: true }) });
  state = (await api("POST", "/api/test/tick", { frames: 2 })).state;
  const releaseTail = playerAt(state, 0).velocity;
  assert.ok(releaseTail.x > 0.45, "released side axis should fade out instead of instantly dropping from movement");
  assert.ok(releaseTail.z > 2, "held forward axis should stay active while the side axis fades");
  state = (await api("POST", "/api/test/tick", { frames: 28 })).state;
  assert.ok(Math.abs(playerAt(state, 0).velocity.x) < releaseTail.x * 0.55, "released side axis should continue decaying after the short tail");

  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    input: inputState({ right: true })
  });
  state = (await api("POST", "/api/test/tick", { frames: 24 })).state;
  assert.ok(playerAt(state, 0).velocity.x > 2, "right movement should build before opposite-axis test");
  await api("POST", "/api/test/player/0", { input: inputState({ left: true }) });
  state = (await api("POST", "/api/test/tick", { frames: 12 })).state;
  assert.ok(playerAt(state, 0).velocity.x < -0.5, "opposite active axis should quickly overpower the old direction");
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
  state = (await api("POST", "/api/test/day", { dayTimeSeconds: 23 * 60 * 60 + 30 * 60 })).state;
  assert.equal(state.dayTimeSeconds, 23 * 60 * 60 + 30 * 60, "test day override should expose short-night QA time");
  state = (await api("POST", "/api/test/day", { clear: true })).state;
  assert.ok(
    state.dayTimeSeconds >= DAY_START_SECONDS && state.dayTimeSeconds < DAY_START_SECONDS + 10 * 60,
    "clearing test day override should restore 06:00-start 300-second cycle"
  );
  assert.equal(DAY_CYCLE_SECONDS, 300, "day cycle should be 5 minutes");
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

  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    velocity: { x: 0, y: 0, z: 4.2 },
    stamina: 3,
    grounded: true,
    verticalVelocity: 0,
    input: inputState({ up: true, sprint: true })
  });
  state = (await api("POST", "/api/test/tick", { frames: 14 })).state;
  const collapsedSprinter = playerAt(state, 0);
  assert.equal(collapsedSprinter.ragdoll, true, "sprint exhaustion should activate ragdoll");
  assert.ok(collapsedSprinter.ragdollAt > 0, "ragdoll snapshot should expose activation time");
  assert.ok(collapsedSprinter.position.z > 0.45, "ragdoll should preserve previous forward inertia");
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
  assert.equal(target.ragdoll, true, "target should ragdoll when a hit empties stamina");
  assert.ok(target.ragdollAt > 0, "hit ragdoll should expose activation time");
  assert.ok(target.velocity.z > 7.5, `hit ragdoll should get a heavy forward knockback, got z=${target.velocity.z}`);
  assert.ok(target.velocity.y > 2.2, `hit ragdoll should lift the target, got y=${target.velocity.y}`);
}

async function assertEmptySpaceStrikeVisuals(api) {
  for (const strike of [
    { kind: "hand", input: { kickRight: 1 } },
    { kind: "left", input: { kickLeft: 1 } }
  ]) {
    await api("POST", "/api/test/players", { count: 1 });
    let state = (await api("POST", "/api/test/reset", {})).state;
    await api("POST", "/api/test/weather", { kind: "clear" });
    await api("POST", "/api/test/ball", {
      position: { x: 14, y: BALL_RADIUS + 0.04, z: 18 },
      velocity: { x: 0, y: 0, z: 0 }
    });
    const beforeAudioId = maxAudioEventId(state);
    await api("POST", "/api/test/player/0", {
      position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
      stamina: 100,
      yaw: 0,
      input: inputState(strike.input)
    });
    state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
    const player = playerAt(state, 0);
    assert.equal(player.lastAction, strike.kind, `${strike.kind} whiff should still replicate a visible action`);
    assert.ok(player.lastActionAt > 0, `${strike.kind} whiff should expose action timing`);
    assert.ok(player.stamina < 100, `${strike.kind} whiff should spend stamina`);
    assertAudioEvent(
      state,
      beforeAudioId,
      (event) => event.kind === "kick" && event.kick === strike.kind && event.playerId === player.id,
      `${strike.kind} whiff`
    );
  }
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
  assert.ok(state.ball.velocity.x > 1.2, "ball should rebound sideways from the goal post collider");
  assert.ok(
    state.ball.velocity.y >= 0.35,
    `goal post rebound should add a small lift, got y=${state.ball.velocity.y}`
  );

  state = (await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.015, z: 0 },
    velocity: { x: 0, y: -4.2, z: 0 }
  })).state;
  state = (await api("POST", "/api/test/tick", { frames: 1 })).state;
  assert.ok(state.ball.velocity.y > 2.6, "ball should be bouncy enough for head play");
  assert.ok(BALL_RESTITUTION > 1, "acceptance constants should track the bouncier server tuning");
  assert.equal(BALL_DENSITY, 3.6, "half-size ball should keep the old effective mass through higher density");
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
  const ballSpeed = speed3(state.ball.velocity);
  assert.ok(ballSpeed > 0.5, `${kind} should move the ball`);
  assert.ok(ballSpeed < KICK_SPEED_MAX, `${kind} should not turn the half-size ball into a runaway projectile`);
  assertAudioEvent(
    state,
    beforeAudioId,
    (event) => event.kind === "kick" && event.kick === kind && event.playerId === playerId && event.speed > 0,
    `${kind} kick`
  );
  return ballSpeed;
}

async function assertFriendlyKickPriority(api) {
  let state = await prepareSinglePlayer(api);
  const playerId = playerAt(state, 0).id;
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    velocity: { x: 0, y: 0, z: 4.8 },
    yaw: 0,
    input: inputState({ up: true, kickLeft: 1 })
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 0.95 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  const beforeAudioId = maxAudioEventId(state);
  state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
  assert.equal(playerAt(state, 0).lastAction, "left", "active kick should take priority over passive body contact");
  const priorityKickSpeed = speed3(state.ball.velocity);
  assert.ok(
    priorityKickSpeed > 4.2,
    `priority kick should launch the ball with active kick force, got ${priorityKickSpeed}`
  );
  assertAudioEvent(
    state,
    beforeAudioId,
    (event) => event.kind === "kick" && event.kick === "left" && event.playerId === playerId,
    "priority left kick"
  );
  assert.ok(
    !newerAudioEvents(state, beforeAudioId).some((event) => event.kind === "kick" && event.kick === "body"),
    "body contact should not fire in the same frame as an active strike input"
  );
}

async function assertFriendlyKickAssist(api) {
  let state = await prepareSinglePlayer(api);
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 2.45 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", {
    input: inputState({ kickLeft: 1 })
  });
  state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
  assert.equal(playerAt(state, 0).lastAction, "left", "left kick assist should cover a reachable ball in front of the player");
  assert.ok(speed3(state.ball.velocity) > 5, "left kick assist should still use active kick force");
}

async function assertLeftKickInputBuffer(api) {
  let state = await prepareSinglePlayer(api);
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 3.2 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", {
    input: inputState({ kickLeft: 1 })
  });
  state = (await api("POST", "/api/test/tick", { frames: 2 })).state;
  assert.notEqual(playerAt(state, 0).lastAction, "left", "early left kick click should buffer instead of spending a miss");

  await api("POST", "/api/test/player/0", { input: inputState() });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 2.45 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
  assert.equal(playerAt(state, 0).lastAction, "left", "buffered left kick should fire when the ball enters assist reach");
  assert.ok(speed3(state.ball.velocity) > 5, "buffered left kick should use active kick force");
}

async function measureLeftKickSpeed(api, setupInput, releaseInput, holdFrames = 0) {
  let state = await prepareSinglePlayer(api);
  const kickBallPosition = { x: -0.34, y: BALL_RADIUS + 0.04, z: 1.0 };
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/ball", {
    position: holdFrames > 0 ? { x: 0, y: BALL_RADIUS + 0.04, z: 8 } : kickBallPosition,
    velocity: { x: 0, y: 0, z: 0 }
  });
  if (setupInput) {
    await api("POST", "/api/test/player/0", { input: inputState(setupInput) });
    if (holdFrames > 0) state = (await api("POST", "/api/test/tick", { frames: holdFrames })).state;
  }
  if (holdFrames > 0) {
    await api("POST", "/api/test/ball", {
      position: kickBallPosition,
      velocity: { x: 0, y: 0, z: 0 }
    });
  }
  await api("POST", "/api/test/player/0", { input: inputState(releaseInput) });
  state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
  assert.equal(playerAt(state, 0).lastAction, "left");
  return speed3(state.ball.velocity);
}

async function assertLeftKickCharge(api) {
  const tapSpeed = await measureLeftKickSpeed(api, null, { kickLeft: 1 });
  assert.ok(tapSpeed > 5.2, `tap left kick should use the stronger v0.0.028 impulse, got ${tapSpeed}`);
  const chargedSpeed = await measureLeftKickSpeed(
    api,
    { kickLeftHeld: true },
    { kickLeft: 1, kickLeftHeld: false },
    66
  );
  assert.ok(
    chargedSpeed > tapSpeed * 1.6,
    `1s charged left kick should be substantially stronger than tap; tap=${tapSpeed}, charged=${chargedSpeed}`
  );
  assert.ok(chargedSpeed < KICK_SPEED_MAX, `charged left kick should stay under runaway threshold, got ${chargedSpeed}`);

  const cappedSpeed = await measureLeftKickSpeed(
    api,
    { kickLeftHeld: true },
    { kickLeft: 1, kickLeftHeld: false },
    132
  );
  assert.ok(
    cappedSpeed <= chargedSpeed * 1.18,
    `left kick charge should cap after 1s; charged=${chargedSpeed}, capped=${cappedSpeed}`
  );

  const heldContactSpeed = await measureHeldContactLeftKickSpeed(api);
  assert.ok(
    heldContactSpeed > tapSpeed * 1.6,
    `held charged left kick should fire on ball contact before release; tap=${tapSpeed}, heldContact=${heldContactSpeed}`
  );
  assert.ok(heldContactSpeed < KICK_SPEED_MAX, `held charged left kick should stay under runaway threshold, got ${heldContactSpeed}`);
}

async function measureHeldContactLeftKickSpeed(api) {
  let state = await prepareSinglePlayer(api);
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 8 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", { input: inputState({ kickLeftHeld: true }) });
  state = (await api("POST", "/api/test/tick", { frames: 66 })).state;
  assert.notEqual(playerAt(state, 0).lastAction, "left", "held left kick should wait for ball contact while charging");
  await api("POST", "/api/test/ball", {
    position: { x: -0.34, y: BALL_RADIUS + 0.04, z: 1.0 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
  assert.equal(playerAt(state, 0).lastAction, "left");
  return speed3(state.ball.velocity);
}

async function assertJumpClearsGroundBall(api) {
  let state = await prepareSinglePlayer(api);
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2 + 1.05, z: 0 },
    velocity: { x: 0, y: 0, z: 7 },
    grounded: false,
    verticalVelocity: 0,
    yaw: 0,
    input: inputState({ up: true })
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 0.95 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  state = (await api("POST", "/api/test/tick", { frames: 12 })).state;
  assert.notEqual(
    playerAt(state, 0).lastAction,
    "body",
    "airborne player should clear a ground ball instead of body-bumping it by horizontal radius"
  );
  assert.ok(
    speed2(state.ball.velocity) < 0.2,
    `airborne body clearance should not push the ground ball horizontally, got ${speed2(state.ball.velocity)}`
  );
}

async function assertHeadRequiresReachableHeight(api) {
  await assertHeadMissesBallAtHeight(
    api,
    BALL_RADIUS + 0.04,
    "head input should not reach a ground ball below the player's head"
  );
  await assertHeadMissesBallAtHeight(
    api,
    PLAYER_HEIGHT + BALL_RADIUS + 0.85,
    "head input should not reach a ball that is clearly above the player's head"
  );
}

async function assertHeadMissesBallAtHeight(api, ballY, message) {
  let state = await prepareSinglePlayer(api);
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: ballY, z: 0.95 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", {
    input: inputState({ head: 1 })
  });
  state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
  assert.notEqual(
    playerAt(state, 0).lastAction,
    "head",
    message
  );
  assert.ok(
    speed2(state.ball.velocity) < 0.2,
    `unreachable head attempt should not push the ball horizontally, got ${speed2(state.ball.velocity)}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
