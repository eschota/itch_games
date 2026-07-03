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
const PLAYER_RADIUS = DEFAULT_GAME_SETTINGS.playerRadius;
const PLAYER_BALL_SAFE_RADIUS = PLAYER_RADIUS + BALL_RADIUS + DEFAULT_GAME_SETTINGS.playerBallCollisionSkin;
const PLAYER_STAMINA_MAX = DEFAULT_GAME_SETTINGS.playerStaminaMax;
const BALL_POSSESSION_CARRY_DISTANCE = DEFAULT_GAME_SETTINGS.ballPossessionCarryDistance;
const BALL_POSSESSION_LOW_SHOT_SPEED = DEFAULT_GAME_SETTINGS.ballPossessionLowShotSpeed;
const BALL_POSSESSION_UPPER_SHOT_LIFT = DEFAULT_GAME_SETTINGS.ballPossessionUpperShotLift;
const BALL_POSSESSION_STRONG_MULTIPLIER = DEFAULT_GAME_SETTINGS.ballPossessionStrongMultiplier;
const KICK_COOLDOWN_MS = DEFAULT_GAME_SETTINGS.kickCooldownMs;
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
  "6294728"
];
const CHARACTER_ROSTER_SET = new Set(CHARACTER_ROSTER);
const TEXTURELESS_RUNTIME_ASSET_DIRS = [
  path.join(ROOT, "unsoccer", "client", "public", "assets", "characters"),
  path.join(ROOT, "unsoccer", "client", "public", "assets", "environment"),
  path.join(ROOT, "unsoccer", "client", "public", "assets", "balls")
];
const BLOCKED_TEXTURE_FILE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".ktx2", ".basis"]);

function listFilesRecursive(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(fullPath);
    return entry.isFile() ? [fullPath] : [];
  });
}

function readGlbJson(filePath) {
  const data = fs.readFileSync(filePath);
  assert.equal(data.toString("utf8", 0, 4), "glTF", `${filePath} should be GLB`);
  let offset = 12;
  while (offset < data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.toString("utf8", offset + 4, offset + 8);
    offset += 8;
    if (type === "JSON") return JSON.parse(data.toString("utf8", offset, offset + length));
    offset += length;
  }
  throw new Error(`${filePath} is missing GLB JSON chunk`);
}

function materialHasTextureReference(material) {
  return Boolean(
    material?.pbrMetallicRoughness?.baseColorTexture ||
    material?.pbrMetallicRoughness?.metallicRoughnessTexture ||
    material?.normalTexture ||
    material?.occlusionTexture ||
    material?.emissiveTexture
  );
}

function glbVertexPbrProblems(gltf, filePath) {
  const requiresPackedPbr = filePath.includes(`${path.sep}assets${path.sep}characters${path.sep}`);
  const problems = [];
  for (const mesh of gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if (primitive?.attributes?.POSITION === undefined) continue;
      if (primitive.attributes.COLOR_0 === undefined) {
        problems.push("missing-COLOR_0");
      }
      if (requiresPackedPbr && primitive.attributes.TEXCOORD_1 === undefined) {
        problems.push("missing-TEXCOORD_1");
      }
    }
  }
  return [...new Set(problems)];
}

function assertTexturelessRuntimeAssets() {
  const files = TEXTURELESS_RUNTIME_ASSET_DIRS.flatMap(listFilesRecursive);
  const blockedFiles = files.filter((filePath) => BLOCKED_TEXTURE_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
  assert.deepEqual(blockedFiles, [], "runtime 3D asset folders must not ship image texture files");

  const badGlbs = [];
  for (const filePath of files.filter((entry) => entry.toLowerCase().endsWith(".glb"))) {
    const gltf = readGlbJson(filePath);
    const hasImages = (gltf.images || []).length > 0;
    const hasTextures = (gltf.textures || []).length > 0;
    const hasMaterialMaps = (gltf.materials || []).some(materialHasTextureReference);
    const vertexPbrProblems = glbVertexPbrProblems(gltf, filePath);
    if (hasImages || hasTextures || hasMaterialMaps || vertexPbrProblems.length > 0) {
      badGlbs.push({
        file: path.relative(ROOT, filePath),
        images: (gltf.images || []).length,
        textures: (gltf.textures || []).length,
        materialMaps: hasMaterialMaps,
        vertexPbrProblems
      });
    }
  }
  assert.deepEqual(badGlbs, [], "runtime GLB assets must be textureless vertex/PBR assets with baked COLOR_0");
}

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

function botCollapseGuardLimit(settings = DEFAULT_GAME_SETTINGS, activeCount = MAX_ACTIVE_PLAYERS) {
  return Math.max(
    settings.botCombatCollapseGuardMinDisabled,
    Math.floor(activeCount * settings.botCombatCollapseGuardRatio)
  );
}

function assertActiveBotRoster(state, expectedIds, label, expectedCount = expectedIds.length) {
  const activeBots = activePlayersByController(state, "bot");
  assert.equal(activeBots.length, expectedCount, `${label}: active bot count should stay ${expectedCount}`);
  if (expectedIds.length) {
    assert.deepEqual(
      activeBots.map((player) => player.id).sort(),
      [...expectedIds].sort(),
      `${label}: active bot ids should stay stable`
    );
  }
  for (const bot of activeBots) {
    assert.equal(bot.role, "player", `${label}: ${bot.id} should stay in player role`);
    assert.ok(Number.isFinite(bot.position.x) && Number.isFinite(bot.position.y) && Number.isFinite(bot.position.z), `${label}: ${bot.id} position should stay finite`);
    assert.ok(
      Math.abs(bot.position.x) <= FIELD_WIDTH / 2 + 4,
      `${label}: ${bot.id} should stay near the playable width, x=${bot.position.x}`
    );
    assert.ok(
      Math.abs(bot.position.z) <= FIELD_LENGTH / 2 + GOAL_DEPTH + 4,
      `${label}: ${bot.id} should stay near the playable length, z=${bot.position.z}`
    );
    assert.ok(bot.position.y >= PLAYER_HEIGHT / 2 - 0.05 && bot.position.y <= PLAYER_HEIGHT / 2 + 2.4, `${label}: ${bot.id} should stay at a visible player height, y=${bot.position.y}`);
  }
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

function assertCoreCombatSettings(settings, label) {
  assert.equal(settings.friendlyFireEnabled, true, `${label}: friendly fire should be enabled by default`);
  assert.equal(settings.playerHitFullKnockoutEnabled, true, `${label}: one-hit player knockout should be enabled by default`);
  assert.equal(settings.playerStaminaJumpCost, 0, `${label}: jump should not spend stamina`);
  assert.equal(settings.playerStaminaHitCost, 0, `${label}: attacker hits should not spend stamina`);
  assert.ok(
    settings.botAggression >= settings.botCombatAggressionThreshold,
    `${label}: default bot aggression should allow visible bot fights`
  );
  assert.ok(settings.botCombatCollapseGuardMinDisabled >= 1, `${label}: bot collapse guard should allow at least one knockout`);
  assert.ok(settings.botCombatCollapseGuardRatio > 0, `${label}: bot collapse guard ratio should be positive`);
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

async function assertProductionDefaultBotHealth() {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), "unsoccer-prod-settings-"));
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
      UNSOCCER_LOCAL_ICE: "1",
      UNSOCCER_GAME_SETTINGS_FILE: settingsFile,
      UNSOCCER_TEST_MODE: ""
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

  try {
    const health = await waitForHealth(baseUrl, () => exitCode, stderrLines);
    assert.equal(health.version, EXPECTED_GAME_VERSION, "non-test server should expose the current game version");
    assert.equal(health.testMode, false, "local play smoke should run without UNSOCCER_TEST_MODE");
    assert.equal(health.botsRuntimeEnabled, true, "non-test default server should have runtime bots enabled");
    assert.equal(health.botFillSuppressionReason, "none", "non-test default server should not suppress bot fill");
    assert.equal(health.desiredBotPlayers, MAX_ACTIVE_PLAYERS, "non-test default server should desire a full bot match");
    assert.equal(health.activeBotPlayers, MAX_ACTIVE_PLAYERS, "non-test default server should spawn visible active bots");
    assert.equal(health.activePlayers, MAX_ACTIVE_PLAYERS, "non-test default server should fill all active slots");
    assert.equal(health.connectedClients, 0, "default bot fill should not consume connected client capacity");

    const joinResponse = await fetch(`${baseUrl}/api/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "NonTestHuman" })
    });
    const joinPayload = await joinResponse.json();
    assert.equal(joinResponse.ok, true, "non-test human join should succeed");
    assert.equal(joinPayload.joined.version, EXPECTED_GAME_VERSION, "non-test human join should expose the current game version");
    const stateResponse = await fetch(`${baseUrl}/api/state?clientId=${encodeURIComponent(joinPayload.joined.id)}`);
    const statePayload = await stateResponse.json();
    assert.equal(stateResponse.ok, true, "non-test state should be available for the joined human");
    assert.equal(activePlayersByController(statePayload.state, "human").length, 1, "non-test human should occupy one active slot");
    assertActiveBotRoster(
      statePayload.state,
      activePlayersByController(statePayload.state, "bot").map((player) => player.id),
      "non-test human join bot fill",
      MAX_ACTIVE_PLAYERS - 1
    );
    const joinedHealth = await (await fetch(`${baseUrl}/api/health`)).json();
    assert.equal(joinedHealth.activeBotPlayers, MAX_ACTIVE_PLAYERS - 1, "non-test health should show bot backfill after human join");
    assert.equal(joinedHealth.activePlayers, MAX_ACTIVE_PLAYERS, "non-test human plus bots should keep the active roster full");
    assert.equal(joinedHealth.botFillSuppressionReason, "none", "non-test human join should not suppress bot fill");
  } finally {
    await stopServer(child);
    fs.rmSync(settingsDir, { recursive: true, force: true });
  }
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

async function assertWebSocketLeaveApiBackfillsBots(api, baseUrl) {
  await api("POST", "/api/test/bots", {
    enabled: true,
    settings: deterministicBotSettings({ targetActivePlayers: MAX_ACTIVE_PLAYERS })
  });
  let state = (await api("GET", "/api/test/state")).state;
  assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS, "websocket leave fixture should start with full bot fill");

  const ws = new WebSocket(webSocketUrl(baseUrl));
  let joined = null;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("websocket leave join timed out"));
      }, 3500);
      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ event: "join", data: { name: "WsLeave" } }));
      });
      ws.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.event !== "joined") return;
        joined = message.data;
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("websocket leave join failed"));
      });
    });
    assert.ok(joined?.id, "websocket leave fixture should receive joined id");
    state = (await api("GET", "/api/test/state")).state;
    assert.ok(state.players.some((player) => player.id === joined.id && player.controller === "human"), "websocket join should occupy one human slot");
    assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS - 1, "websocket human should temporarily displace one bot");

    await api("POST", "/api/leave", { clientId: joined.id });
    state = (await api("GET", "/api/test/state")).state;
    assert.ok(!state.players.some((player) => player.id === joined.id), "websocket leave API should remove websocket player immediately");
    assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS, "websocket leave API should immediately backfill the bot slot");
    const health = await api("GET", "/api/health");
    assert.equal(health.activeBotPlayers, MAX_ACTIVE_PLAYERS, "health should show full bot fill after websocket leave");
    assert.equal(health.botFillSuppressionReason, "none", "websocket leave should not leave bot fill suppressed");
  } finally {
    ws.close();
  }
}

async function assertHttpFingerprintAndPlayerGoals(api) {
  await api("POST", "/api/test/players", { count: 0 });
  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/bots", { enabled: false });

  const clientFingerprint = "acceptance-player-goals-fingerprint";
  const join = await api("POST", "/api/join", {
    name: "GoalOwner",
    clientFingerprint,
    profile: {
      nickname: "GoalOwner",
      skinId: CHARACTER_ROSTER[0],
      userPic: "GO"
    }
  });
  const playerId = join.joined.id;
  assert.equal(playerAt(join.state, join.joined.index).goals, 0, "new player should start with zero personal goals");

  await api("POST", "/api/test/reset", {});
  await api("POST", `/api/test/player/${join.joined.index}`, {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    input: inputState({ kickLeft: 1 })
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 0.95 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/tick", { frames: 2 });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: FIELD_LENGTH / 2 - 0.05 },
    velocity: { x: 0, y: 0, z: 10 }
  });
  let state = (await api("POST", "/api/test/tick", { frames: 8 })).state;
  assert.equal(state.score.blue, 1, "blue score should increment after owned kick crosses orange goal");
  let player = state.players.find((candidate) => candidate.id === playerId);
  assert.ok(player, "scoring player should remain in state");
  assert.equal(player.goals, 1, "scoring player should receive a personal goal");

  await api("POST", "/api/leave", { clientId: playerId });
  const rejoin = await api("POST", "/api/join", {
    name: "GoalOwner",
    clientFingerprint,
    profile: {
      nickname: "GoalOwner",
      skinId: CHARACTER_ROSTER[0],
      userPic: "GO"
    }
  });
  assert.equal(rejoin.joined.id, playerId, "same browser fingerprint should restore player id");
  player = rejoin.state.players.find((candidate) => candidate.id === playerId);
  assert.ok(player, "fingerprint-restored player should be visible after rejoin");
  assert.equal(player.goals, 1, "same browser fingerprint should preserve personal goal count");
  await api("POST", "/api/leave", { clientId: playerId });
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
  assert.equal(
    initial.schema.find((item) => item.key === "playerStaminaJumpCost")?.max,
    0,
    "admin schema should keep jump stamina cost locked to zero"
  );
  assert.equal(
    initial.schema.find((item) => item.key === "playerStaminaHitCost")?.max,
    0,
    "admin schema should keep attacker hit stamina cost locked to zero"
  );
  assert.ok(
    initial.schema.some((item) => item.key === "botCombatAggressionThreshold"),
    "admin schema should expose bot combat aggression threshold"
  );
  assert.ok(
    initial.schema.some((item) => item.key === "botCombatCollapseGuardRatio"),
    "admin schema should expose bot combat collapse guard ratio"
  );
  assert.ok(
    initial.schema.some((item) => item.key === "botCombatCollapseGuardMinDisabled"),
    "admin schema should expose bot combat collapse guard minimum"
  );

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

  let staminaCostPayload = await api("POST", "/api/game-settings", {
    settings: {
      playerStaminaJumpCost: 50,
      playerStaminaHitCost: 50
    }
  });
  assert.equal(staminaCostPayload.settings.playerStaminaJumpCost, 0, "game settings should clamp jump stamina cost to zero");
  assert.equal(staminaCostPayload.settings.playerStaminaHitCost, 0, "game settings should clamp attacker hit stamina cost to zero");
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
  const afterJoinOneBotIds = new Set(activePlayersByController(state, "bot").map((player) => player.id));
  const displacedByJoinOne = [...firstBotIds].filter((id) => !afterJoinOneBotIds.has(id));
  assert.equal(displacedByJoinOne.length, 1, "one human join should displace exactly one bot into the dormant pool");
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
  assert.equal(health.humanClients, 1, "health should expose human client count separately from bots");
  assert.equal(health.botPlayers, MAX_ACTIVE_PLAYERS - 1, "health should expose total bot runtimes");
  assert.equal(health.activeBotPlayers, MAX_ACTIVE_PLAYERS - 1, "health should expose active bot count");
  assert.equal(health.dormantBotPlayers, 1, "health should expose one displaced dormant bot after one human joins");
  assert.equal(health.invalidActiveBotPlayers, 0, "health should report no active bot body mismatches");
  assert.equal(health.desiredBotPlayers, MAX_ACTIVE_PLAYERS - 1, "health should expose desired bot count after one human joins");
  assert.equal(health.nonBotActiveSlots, 1, "health should expose non-bot active slot pressure");
  assert.equal(health.botFillSuppressionReason, "none", "health should explain that bot fill is not suppressed");
  assert.equal(health.botsRuntimeEnabled, true, "health should expose bot runtime enablement");
  assert.equal(health.botTargetActivePlayers, MAX_ACTIVE_PLAYERS, "health should expose target bot fill");
  assert.equal(health.httpClientStaleMs, DEFAULT_GAME_SETTINGS.httpClientStaleMs, "health should expose the active HTTP stale timeout");
  assert.equal(health.websocketClientStaleMs, DEFAULT_GAME_SETTINGS.websocketClientStaleMs, "health should expose the active WebSocket stale timeout");
  assert.equal(health.testMode, true, "acceptance server should expose test-mode state");

  const joinTwo = await api("POST", "/api/join", { name: "Human Two" });
  state = joinTwo.state;
  const afterJoinTwoBotIds = new Set(activePlayersByController(state, "bot").map((player) => player.id));
  const displacedByJoinTwo = [...afterJoinOneBotIds].filter((id) => !afterJoinTwoBotIds.has(id));
  assert.equal(displacedByJoinTwo.length, 1, "second human join should displace one more bot");
  assert.equal(activePlayers(state).length, MAX_ACTIVE_PLAYERS, "two humans plus bots should still fill ten active slots");
  assert.equal(activePlayersByController(state, "human").length, 2, "two joined humans should be active");
  assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS - 2, "two joined humans should leave eight active bots");
  health = await api("GET", "/api/health");
  assert.equal(health.connectedClients, 2, "health connectedClients should count humans only");
  assert.equal(health.activeBotPlayers, MAX_ACTIVE_PLAYERS - 2, "health activeBotPlayers should follow human displacement");

  await api("POST", "/api/leave", { clientId: joinOne.joined.id });
  state = (await api("GET", "/api/test/state")).state;
  const afterLeaveOneBotIds = new Set(activePlayersByController(state, "bot").map((player) => player.id));
  assert.equal(activePlayersByController(state, "human").length, 1, "leaving one human should remove that human");
  assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS - 1, "leaving one human should backfill one bot");
  assert.ok(afterLeaveOneBotIds.has(displacedByJoinTwo[0]), "first leave should reuse the most recently displaced bot id");

  await api("POST", "/api/leave", { clientId: joinTwo.joined.id });
  state = (await api("GET", "/api/test/state")).state;
  const afterLeaveTwoBotIds = new Set(activePlayersByController(state, "bot").map((player) => player.id));
  assert.equal(activePlayersByController(state, "human").length, 0, "all humans should be gone after leave");
  assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS, "bot-only fill should restore ten active bots");
  assert.ok(afterLeaveTwoBotIds.has(displacedByJoinOne[0]), "second leave should reuse the remaining displaced bot id");
  health = await api("GET", "/api/health");
  assert.ok(health.botReuseCount >= 2, `bot reuse counter should record human leave backfill, got ${health.botReuseCount}`);
  assert.equal(health.dormantBotPlayers, 0, "fully restored bot match should drain the dormant bot pool");
  assert.equal(health.invalidActiveBotPlayers, 0, "fully restored bot match should keep active bot bodies valid");

  await api("POST", "/api/bot-settings", {
    settings: deterministicBotSettings({ targetActivePlayers: MAX_ACTIVE_PLAYERS })
  });
  await api("POST", "/api/game-settings", { settings: { httpClientStaleMs: 3000 } });
  const staleJoin = await api("POST", "/api/join", { name: "Stale Human" });
  state = staleJoin.state;
  assert.equal(activePlayersByController(state, "human").length, 1, "stale fixture should start with one human");
  assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS - 1, "human slot should still leave the rest of the match filled by bots");
  state = (await api("POST", "/api/test/tick", { frames: 600 })).state;
  assert.equal(activePlayersByController(state, "human").length, 0, "stale HTTP player should be removed without leaving a ghost slot");
  assert.equal(activePlayersByController(state, "bot").length, MAX_ACTIVE_PLAYERS, "bots should immediately backfill after stale HTTP cleanup");
  health = await api("GET", "/api/health");
  assert.equal(health.connectedClients, 0, "stale HTTP cleanup should remove disconnected humans from connected client health");
  assert.equal(health.desiredBotPlayers, MAX_ACTIVE_PLAYERS, "stale cleanup should make health desire a full bot match again");
  assert.equal(health.nonBotActiveSlots, 0, "stale cleanup should remove non-bot active slot pressure");
  assert.equal(health.botFillSuppressionReason, "none", "stale cleanup should leave bot fill unsuppressed");
  assert.equal(health.httpClientStaleMs, 3000, "health should expose the shortened HTTP stale timeout used by the bot backfill guard");
  assert.equal(health.websocketClientStaleMs, DEFAULT_GAME_SETTINGS.websocketClientStaleMs, "HTTP stale cleanup should preserve the WebSocket stale timeout setting");
  await api("POST", "/api/game-settings", { settings: DEFAULT_GAME_SETTINGS });
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
    stamina: PLAYER_STAMINA_MAX,
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
  assert.equal(target.stamina, 0, "bot combat should apply the same one-hit stamina knockout as human combat");
  assert.equal(target.ragdoll, true, "bot combat should put the target into ragdoll on one-hit knockout");
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
    target.stamina < 100 || target.ragdoll,
    "support pressure should damage or ragdoll the opponent through combat"
  );
  assertAudioEvent(
    state,
    beforeAudioId,
    (event) => event.kind === "kick" && ["hand", "left", "head"].includes(event.kick) && event.playerId === supportId,
    "support bot pressure combat"
  );
}

async function assertAggressiveBotsPressureOffBall(api) {
  let state = await enableBotMatch(api, {
    targetActivePlayers: MAX_ACTIVE_PLAYERS,
    aggression: 0.55,
    fightDistance: 1.72,
    supportReleaseDistance: 2.65,
    handIntervalMs: 260,
    kickIntervalMs: 240,
    headIntervalMs: 360,
    jumpChance: 0
  });
  const enforcerId = playerAt(state, 2).id;
  const targetId = playerAt(state, 3).id;
  await api("POST", "/api/test/ball", {
    position: { x: 12, y: BALL_RADIUS + 0.04, z: 22 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  const placements = [
    { index: 0, x: 11.2, z: 20.9, yaw: 0 },
    { index: 1, x: -12, z: -20, yaw: Math.PI },
    { index: 2, x: 0, z: 0, yaw: 0 },
    { index: 3, x: 0.12, z: 1.08, yaw: Math.PI },
    { index: 4, x: -9, z: -10, yaw: 0 },
    { index: 5, x: 9, z: 10, yaw: Math.PI },
    { index: 6, x: -11, z: -14, yaw: 0 },
    { index: 7, x: 11, z: 14, yaw: Math.PI },
    { index: 8, x: -13, z: -18, yaw: 0 },
    { index: 9, x: 13, z: 18, yaw: Math.PI }
  ];
  for (const placement of placements) {
    await api("POST", `/api/test/player/${placement.index}`, {
      position: { x: placement.x, y: PLAYER_HEIGHT / 2, z: placement.z },
      velocity: { x: 0, y: 0, z: 0 },
      stamina: 100,
      ragdoll: false,
      grounded: true,
      verticalVelocity: 0,
      yaw: placement.yaw,
      input: inputState()
    });
  }
  state = (await api("GET", "/api/test/state")).state;
  const beforeAudioId = maxAudioEventId(state);
  state = (await api("POST", "/api/test/tick", { frames: 40 })).state;
  const enforcer = state.players.find((player) => player.id === enforcerId);
  const target = state.players.find((player) => player.id === targetId);
  assert.ok(enforcer && target, "off-ball enforcer actors should remain in state");
  assert.ok(
    speed2({ x: state.ball.position.x - enforcer.position.x, z: state.ball.position.z - enforcer.position.z }) > 10,
    "enforcer pressure fixture should keep the fighter far from the ball"
  );
  assert.ok(
    ["hand", "left", "head"].includes(enforcer.lastAction),
    "aggressive enforcer bot should fight a nearby opponent instead of chasing the distant ball"
  );
  assert.ok(
    target.stamina < 100 || target.ragdoll,
    "off-ball enforcer pressure should damage or ragdoll the opponent"
  );
  const enforcerAudioEvent = newerAudioEvents(state, beforeAudioId).find(
    (event) => event.kind === "kick" && ["hand", "left", "head"].includes(event.kick) && event.playerId === enforcerId
  ) || (state.audioEvents || []).find(
    (event) => event.kind === "kick"
      && ["hand", "left", "head"].includes(event.kick)
      && event.playerId === enforcerId
      && event.serverTime === enforcer.lastActionAt
  );
  assert.ok(enforcerAudioEvent, "off-ball enforcer combat audio event should exist");
}

async function assertLowStaminaBotCombatAndFill(api) {
  let state = await enableBotMatch(api, {
    targetActivePlayers: MAX_ACTIVE_PLAYERS,
    aggression: 1,
    fightDistance: 1.95,
    handIntervalMs: 220,
    kickIntervalMs: 220,
    headIntervalMs: 360,
    jumpChance: 0
  });
  const attackerId = playerAt(state, 0).id;
  const targetId = playerAt(state, 1).id;
  const initialBotIds = activePlayersByController(state, "bot").map((player) => player.id).sort();
  await api("POST", "/api/test/ball", {
    position: { x: 13, y: BALL_RADIUS + 0.04, z: 18 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  const placements = [
    { index: 0, x: 0, z: 0, stamina: 5, yaw: 0 },
    { index: 1, x: 0.14, z: 1.06, stamina: PLAYER_STAMINA_MAX, yaw: Math.PI },
    { index: 2, x: -9, z: -10, stamina: PLAYER_STAMINA_MAX, yaw: 0 },
    { index: 3, x: 9, z: 10, stamina: PLAYER_STAMINA_MAX, yaw: Math.PI },
    { index: 4, x: -11, z: -14, stamina: PLAYER_STAMINA_MAX, yaw: 0 },
    { index: 5, x: 11, z: 14, stamina: PLAYER_STAMINA_MAX, yaw: Math.PI },
    { index: 6, x: -13, z: -18, stamina: PLAYER_STAMINA_MAX, yaw: 0 },
    { index: 7, x: 13, z: 18, stamina: PLAYER_STAMINA_MAX, yaw: Math.PI },
    { index: 8, x: -15, z: -21, stamina: PLAYER_STAMINA_MAX, yaw: 0 },
    { index: 9, x: 15, z: 21, stamina: PLAYER_STAMINA_MAX, yaw: Math.PI }
  ];
  for (const placement of placements) {
    await api("POST", `/api/test/player/${placement.index}`, {
      position: { x: placement.x, y: PLAYER_HEIGHT / 2, z: placement.z },
      stamina: placement.stamina,
      ragdoll: false,
      grounded: true,
      verticalVelocity: 0,
      yaw: placement.yaw,
      input: inputState()
    });
  }
  state = (await api("GET", "/api/test/state")).state;
  const beforeAudioId = maxAudioEventId(state);
  state = (await api("POST", "/api/test/tick", { frames: 12 })).state;
  const attacker = state.players.find((player) => player.id === attackerId);
  const target = state.players.find((player) => player.id === targetId);
  assert.ok(attacker && target, "low-stamina bot combat actors should remain in state");
  assert.ok(
    ["hand", "left", "head"].includes(attacker.lastAction),
    "low-stamina bot should still throw a free combat strike when not exhausted"
  );
  assert.ok(
    attacker.stamina >= 5,
    `low-stamina bot strike should not spend attacker stamina, got ${attacker.stamina}`
  );
  assert.equal(target.stamina, 0, "low-stamina bot strike should still fully knock out the target");
  assert.equal(target.ragdoll, true, "low-stamina bot strike should ragdoll the target");
  assertActiveBotRoster(state, initialBotIds, "bot combat immediate roster");
  const lowStaminaCombatEvent = newerAudioEvents(state, beforeAudioId).find(
    (event) => event.kind === "kick" && ["hand", "left", "head"].includes(event.kick) && event.playerId === attackerId
  ) || (state.audioEvents || []).find(
    (event) => event.kind === "kick"
      && ["hand", "left", "head"].includes(event.kick)
      && event.playerId === attackerId
      && event.serverTime === attacker.lastActionAt
  );
  assert.ok(lowStaminaCombatEvent, "low-stamina bot combat audio event should exist");

  state = (await api("POST", "/api/test/tick", { frames: 240 })).state;
  const health = await api("GET", "/api/health");
  assertActiveBotRoster(state, initialBotIds, "bot combat recovery roster");
  assert.equal(health.activeBotPlayers, MAX_ACTIVE_PLAYERS, "health should still expose a full active bot roster");
  assert.equal(health.botFillSuppressionReason, "none", "combat should not create bot-fill suppression");
}

async function assertBotsFinishExhaustedTargets(api) {
  let state = await enableBotMatch(api, {
    targetActivePlayers: 4,
    aggression: 1,
    fightDistance: 1.95,
    handIntervalMs: 220,
    kickIntervalMs: 220,
    headIntervalMs: 360,
    jumpChance: 0
  });
  const attackerId = playerAt(state, 0).id;
  const targetId = playerAt(state, 1).id;
  const initialBotIds = activePlayersByController(state, "bot").map((player) => player.id).sort();
  await api("POST", "/api/test/ball", {
    position: { x: 10, y: BALL_RADIUS + 0.04, z: 18 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: PLAYER_STAMINA_MAX,
    ragdoll: false,
    grounded: true,
    verticalVelocity: 0,
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/player/1", {
    position: { x: 0.12, y: PLAYER_HEIGHT / 2, z: 1.05 },
    velocity: { x: 0, y: 0, z: 0 },
    stamina: 0,
    ragdoll: false,
    grounded: true,
    verticalVelocity: 0,
    yaw: Math.PI,
    input: inputState()
  });
  for (const index of [2, 3]) {
    await api("POST", `/api/test/player/${index}`, {
      position: { x: index === 2 ? -9 : 9, y: PLAYER_HEIGHT / 2, z: -12 },
      stamina: PLAYER_STAMINA_MAX,
      ragdoll: false,
      input: inputState()
    });
  }
  state = (await api("GET", "/api/test/state")).state;
  const beforeAudioId = maxAudioEventId(state);
  const exhaustedTargetBefore = state.players.find((player) => player.id === targetId);
  assert.ok(exhaustedTargetBefore?.exhausted, "bot finish fixture should start with an exhausted target");
  assert.equal(exhaustedTargetBefore.ragdoll, false, "bot finish fixture should start before ragdoll");
  state = (await api("POST", "/api/test/tick", { frames: 16 })).state;
  const attacker = state.players.find((player) => player.id === attackerId);
  const target = state.players.find((player) => player.id === targetId);
  assert.ok(attacker && target, "bot exhausted-target actors should remain in state");
  assert.ok(
    ["hand", "left", "head"].includes(attacker.lastAction),
    "bot should still attack an exhausted opponent until it is knocked into ragdoll"
  );
  assert.equal(target.stamina, 0, "exhausted target should remain fully drained after bot finish hit");
  assert.equal(target.ragdoll, true, "bot should finish an exhausted standing target into ragdoll");
  assert.deepEqual(
    activePlayersByController(state, "bot").map((player) => player.id).sort(),
    initialBotIds,
    "bot finish hit should not remove or replace active bots"
  );
  const health = await api("GET", "/api/health");
  assert.equal(health.activeBotPlayers, 4, "bot finish fixture should keep its requested active bot count");
  assert.equal(health.botFillSuppressionReason, "none", "bot finish hit should not suppress bot fill");
  assertAudioEvent(
    state,
    beforeAudioId,
    (event) => event.kind === "kick" && ["hand", "left", "head"].includes(event.kick) && event.playerId === attackerId,
    "bot exhausted-target finish"
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
  const initialBotIds = activePlayersByController(state, "bot").map((player) => player.id).sort();
  assert.equal(initialBotIds.length, MAX_ACTIVE_PLAYERS, "default bot scenario should start with ten bot players");
  assertActiveBotRoster(state, initialBotIds, "default bot match initial roster");
  const beforeAudioId = maxAudioEventId(state);
  for (let second = 0; second < 16; second += 1) {
    state = (await api("POST", "/api/test/tick", { frames: 60 })).state;
    assertActiveBotRoster(state, initialBotIds, "default bot match simulated roster");
    if (state.score.blue + state.score.orange > 0) break;
  }
  assert.ok(state.score.blue + state.score.orange > 0, "default bot match should produce a first goal");
  assertActiveBotRoster(state, initialBotIds, "default bot match final roster");
  assert.ok(
    activePlayersByController(state, "bot").every((player) => !/^bot\b/i.test(player.name)),
    "default bot match should expose player-like names"
  );
  assert.ok(
    activePlayers(state).filter((player) => player.ragdoll || player.exhausted).length <= botCollapseGuardLimit(),
    "default bot match should stay under the configured combat collapse guard"
  );
  assertAudioEvent(
    state,
    beforeAudioId,
    (event) => event.kind === "goal",
    "default bot match goal"
  );
}

async function assertDefaultBotsCanBrawlWithoutRosterCollapse(api) {
  let state = await enableBotMatch(api, {
    targetActivePlayers: 4,
    aggression: DEFAULT_GAME_SETTINGS.botAggression,
    fightDistance: DEFAULT_GAME_SETTINGS.botFightDistance,
    shootDistance: DEFAULT_GAME_SETTINGS.botShootDistance,
    chaseDistance: DEFAULT_GAME_SETTINGS.botChaseDistance,
    sprintDistance: DEFAULT_GAME_SETTINGS.botSprintDistance,
    shotAlignmentMin: DEFAULT_GAME_SETTINGS.botShotAlignmentMin,
    supportReleaseDistance: DEFAULT_GAME_SETTINGS.botSupportReleaseDistance,
    handIntervalMs: 260,
    kickIntervalMs: 240,
    headIntervalMs: 360,
    jumpChance: 0
  });
  const attackerId = playerAt(state, 0).id;
  const targetId = playerAt(state, 1).id;
  const initialBotIds = activePlayersByController(state, "bot").map((player) => player.id).sort();
  await api("POST", "/api/test/ball", {
    position: { x: 10, y: BALL_RADIUS + 0.04, z: 18 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: PLAYER_STAMINA_MAX,
    ragdoll: false,
    grounded: true,
    verticalVelocity: 0,
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/player/1", {
    position: { x: 0.15, y: PLAYER_HEIGHT / 2, z: 1.05 },
    stamina: PLAYER_STAMINA_MAX,
    ragdoll: false,
    grounded: true,
    verticalVelocity: 0,
    yaw: Math.PI,
    input: inputState()
  });
  for (const index of [2, 3]) {
    await api("POST", `/api/test/player/${index}`, {
      position: { x: index === 2 ? -8 : 8, y: PLAYER_HEIGHT / 2, z: index === 2 ? -10 : 10 },
      stamina: PLAYER_STAMINA_MAX,
      ragdoll: false,
      input: inputState()
    });
  }
  state = (await api("GET", "/api/test/state")).state;
  const beforeAudioId = maxAudioEventId(state);
  state = (await api("POST", "/api/test/tick", { frames: 14 })).state;
  const attacker = state.players.find((player) => player.id === attackerId);
  const target = state.players.find((player) => player.id === targetId);
  assert.ok(attacker && target, "default bot brawl actors should remain in state");
  assert.ok(
    ["hand", "left", "head"].includes(attacker.lastAction),
    "default-aggression bot should use an active combat strike when an opponent blocks its route"
  );
  assert.ok(
    attacker.stamina >= PLAYER_STAMINA_MAX - 8,
    `default bot combat should not spend attacker stamina beyond incidental sprint drain, got ${attacker.stamina}`
  );
  assert.equal(target.stamina, 0, "default bot combat should fully drain target stamina");
  assert.equal(target.ragdoll, true, "default bot combat should ragdoll the target");
  assertActiveBotRoster(state, initialBotIds, "default bot combat roster");
  assert.ok(
    activePlayers(state).filter((player) => player.ragdoll || player.exhausted).length <= botCollapseGuardLimit(DEFAULT_GAME_SETTINGS, 4),
    "default bot combat should respect the configured collapse guard"
  );
  const health = await api("GET", "/api/health");
  assert.equal(health.activeBotPlayers, 4, "default brawl fixture should keep requested active bots");
  assert.equal(health.botFillSuppressionReason, "none", "default brawl should not suppress bot fill");
  assertAudioEvent(
    state,
    beforeAudioId,
    (event) => event.kind === "kick" && ["hand", "left", "head"].includes(event.kick) && event.playerId === attackerId,
    "default bot combat"
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
  const activeIndexes = activePlayers(state).map((player) => player.index);
  assert.ok(activeIndexes.includes(scorerIndex), `team-${team} scorer should be active before bot scoring fixture`);
  for (const index of activeIndexes) {
    await api("POST", `/api/test/player/${index}`, {
      position: {
        x: index === scorerIndex ? 0 : (index % 2 === 0 ? -9 : 9),
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
  assertTexturelessRuntimeAssets();
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
    const initialSettingsPayload = await api("GET", "/api/game-settings");
    assertCoreCombatSettings(initialSettingsPayload.settings, "initial game settings");

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
    await assertWebSocketLeaveApiBackfillsBots(api, baseUrl);
    await assertHttpFingerprintAndPlayerGoals(api);
    await assertCommunicationProfileAndCombatSides(api, baseUrl);
    await assertBotSettingsCors(baseUrl);
    await assertGameSettingsApi(api, baseUrl, settingsFile);
    await assertBotsFillAndDisplace(api);
    await assertBotsFight(api);
    await assertSupportBotsPressureOpponents(api);
    await assertAggressiveBotsPressureOffBall(api);
    await assertLowStaminaBotCombatAndFill(api);
    await assertBotsFinishExhaustedTargets(api);
    await assertBotsScoreBothTeams(api);
    await assertDefaultBotsCanBrawlWithoutRosterCollapse(api);
    await assertDefaultBotsProduceGoal(api);
    await assertProductionDefaultBotHealth();
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
    await assertPlayerBallSolidCollision(api);
    await assertBallPossessionAndContextShots(api);
    await assertExhaustedPlayersCannotPossessBall(api);
    await assertPossessedBallHitsOtherPlayers(api);
    await assertFullKnockoutFriendlyFireAndJumpDash(api);
    await assertPlayerHitVerticalReach(api);

    await assertKick(api, "left", { x: -0.34, y: BALL_RADIUS + 0.04, z: 1.0 }, { kickLeft: 1 });
    await assertKick(api, "hand", { x: 0.34, y: BALL_RADIUS + 0.04, z: 1.0 }, { kickRight: 1 });
    await assertKick(api, "head", { x: 0, y: PLAYER_HEIGHT - BALL_RADIUS * 0.1, z: 0.95 }, { head: 1 });
    await assertFriendlyKickPriority(api);
    await assertFriendlyKickAssist(api);
    await assertLeftKickInputBuffer(api);
    await assertLeftKickCharge(api);
    await assertJumpClearsGroundBall(api);
    await assertHeadRequiresReachableHeight(api);

    await api("POST", "/api/game-settings", { settings: { ballPossessionEnabled: false } });
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
    await api("POST", "/api/game-settings", { settings: { ballPossessionEnabled: true } });

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
        "textureless runtime 3D assets",
        "health",
        "websocket no-join has no phantom roster audio",
        "websocket join audioEvents",
        "http fallback join/input/state",
        "websocket leave API immediately backfills bots",
        "browser fingerprint rejoin and per-player goal counter",
        "communication profile chat emotion and side-aware combat",
        "runtime game settings API/schema/clamp/reload",
        "bot settings CORS and apply endpoint",
        "bots fill active slots to ten",
        "human joins displace bots and do not exceed ten active players",
        "bots do not consume connected client capacity",
        "bot AI fighting through server combat",
        "support bot pressure fighting through server combat",
        "aggressive off-ball bots pressure opponents",
        "low-stamina bots keep free combat and full roster",
        "bots finish exhausted standing targets into ragdoll",
        "bot-only scoring fixtures for blue and orange",
        "default-aggression bots can brawl without roster collapse",
        "default bot match produces a first goal without collapse",
        "default bot roster remains present and stable",
        "non-test default server keeps bot fill enabled and unsuppressed",
        "11-client role assignment",
        "random non-repeating ready character assignment",
        "team-relative WASD movement",
        "smoothed keyboard axes and acceleration",
        "player movement beyond pitch bounds",
        "authoritative day start and weather controls",
        "sprint stamina, jump, and exhaustion without ragdoll",
        "player hit stamina damage and ragdoll knockout",
        "thin post rebound and bouncier ball",
        "balanced half-size ball impulses",
        "ball possession carry and context low/upper shots",
        "possession LMB cooldown retry",
        "exhausted players cannot capture or keep ball possession",
        "possessed ball collides with other players and drops ownership",
        "full knockout friendly fire and airborne dash kick",
        "player hit vertical reach gate",
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
        "solid player-ball collision and fast-ball blocker rebound",
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
    stamina: 100,
    input: inputState({ up: true })
  });
  let state = (await api("POST", "/api/test/tick", { frames: 30 })).state;
  const walkZ = playerAt(state, 0).position.z;
  assert.equal(playerAt(state, 0).stamina, 100, "normal movement without Shift should not spend stamina");

  await api("POST", "/api/test/player/0", {
    position: { x: 2, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 100,
    input: inputState({ up: true, sprint: true })
  });
  state = (await api("POST", "/api/test/tick", { frames: 30 })).state;
  const sprinter = playerAt(state, 0);
  assert.ok(sprinter.position.z > walkZ + 1.1, "sprint should move farther than walking over the same frames");
  assert.ok(sprinter.stamina < 100, "sprint should drain stamina");
  assert.ok(sprinter.stamina > 80, `sprint should drain stamina gradually, got ${sprinter.stamina}`);
  assert.equal(sprinter.sprinting, true, "snapshot should mark sprinting players");

  await api("POST", "/api/test/reset", {});
  const beforeJumpAudioId = maxAudioEventId(state);
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 80,
    grounded: true,
    verticalVelocity: 0,
    input: inputState({ jump: 1 })
  });
  state = (await api("POST", "/api/test/tick", { frames: 6 })).state;
  const jumper = playerAt(state, 0);
  assert.ok(jumper.position.y > PLAYER_HEIGHT / 2 + 0.15, "jump should raise the player");
  assert.equal(jumper.airborne, true, "jumping player should be airborne in snapshot");
  assert.ok(jumper.stamina > 80, `jump should not spend stamina or block recovery, got ${jumper.stamina}`);
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
  assert.equal(collapsedSprinter.exhausted, true, "sprint exhaustion should mark player exhausted");
  assert.equal(collapsedSprinter.ragdoll, false, "sprint exhaustion should not activate ragdoll");
  assert.equal(collapsedSprinter.ragdollAt, 0, "sprint exhaustion should not expose a ragdoll activation time");
  assert.ok(collapsedSprinter.position.z > 0.45, "exhausted sprint should preserve previous forward inertia");

  await api("POST", "/api/test/players", { count: 2 });
  state = (await api("POST", "/api/test/reset", {})).state;
  const exhaustedTargetId = playerAt(state, 1).id;
  await api("POST", "/api/test/ball", {
    position: { x: 14, y: BALL_RADIUS + 0.04, z: 18 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 0,
    grounded: true,
    verticalVelocity: 0,
    yaw: 0,
    input: inputState({ jump: 2, kickLeft: 2, kickLeftHeld: true, kickRight: 2, head: 2 })
  });
  await api("POST", "/api/test/player/1", {
    position: { x: 0.15, y: PLAYER_HEIGHT / 2, z: 1.05 },
    stamina: PLAYER_STAMINA_MAX,
    yaw: Math.PI,
    input: inputState()
  });
  const beforeExhaustedAudioId = maxAudioEventId(state);
  state = (await api("POST", "/api/test/tick", { frames: 4 })).state;
  const exhaustedActor = playerAt(state, 0);
  const exhaustedTarget = state.players.find((player) => player.id === exhaustedTargetId);
  assert.ok(exhaustedTarget, "exhausted combat target should remain in state");
  assert.equal(exhaustedActor.exhausted, true, "zero-stamina player should remain exhausted during blocked inputs");
  assert.ok(exhaustedActor.position.y <= PLAYER_HEIGHT / 2 + 0.03, "exhausted player should not jump from buffered input");
  assert.equal(exhaustedActor.lastAction, null, "exhausted player should not publish combat actions");
  assert.equal(exhaustedTarget.stamina, PLAYER_STAMINA_MAX, "exhausted player should not damage nearby players");
  assert.equal(exhaustedTarget.ragdoll, false, "exhausted player should not ragdoll nearby players");
  assert.ok(
    !newerAudioEvents(state, beforeExhaustedAudioId).some((event) => event.kind === "kick" && event.playerId === exhaustedActor.id),
    "exhausted blocked inputs should not emit kick audio"
  );
}

async function assertPlayerHitStamina(api) {
  const combatSettings = await api("POST", "/api/game-settings", { settings: DEFAULT_GAME_SETTINGS });
  assertCoreCombatSettings(combatSettings.settings, "player-hit stamina fixture");
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
  const attacker = playerAt(state, 0);
  const target = state.players.find((player) => player.id === targetId);
  assert.ok(target, "hit target should remain in state");
  assert.equal(attacker.lastAction, "hand");
  assert.equal(attacker.stamina, 100, "attacker should not spend stamina when punching by default");
  assert.equal(target.stamina, 0, "hand hit should fully drain target stamina by default");
  assert.equal(target.exhausted, true, "target should become exhausted at zero stamina");
  assert.equal(target.ragdoll, true, "target should ragdoll when a hit empties stamina");
  assert.ok(target.ragdollAt > 0, "hit ragdoll should expose activation time");
  assert.ok(target.velocity.z > 7.5, `hit ragdoll should get a heavy forward knockback, got z=${target.velocity.z}`);
  assert.ok(target.velocity.y > 2.2, `hit ragdoll should lift the target, got y=${target.velocity.y}`);

  await api("POST", "/api/test/players", { count: 2 });
  state = (await api("POST", "/api/test/reset", {})).state;
  const exhaustedTargetId = playerAt(state, 1).id;
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 100,
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/player/1", {
    position: { x: 0.2, y: PLAYER_HEIGHT / 2, z: 1.05 },
    stamina: 0,
    ragdoll: false,
    yaw: Math.PI,
    input: inputState()
  });
  await api("POST", "/api/test/player/0", {
    input: inputState({ kickRight: 1 })
  });
  state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
  const exhaustedTarget = state.players.find((player) => player.id === exhaustedTargetId);
  assert.ok(exhaustedTarget, "zero-stamina hit target should remain in state");
  assert.equal(playerAt(state, 0).stamina, 100, "attacker should not spend stamina when hitting a zero-stamina target");
  assert.equal(exhaustedTarget.ragdoll, true, "hit should ragdoll a zero-stamina target that was not already ragdolled");
  assert.ok(exhaustedTarget.velocity.z > 7.5, `zero-stamina ragdoll hit should still knock target forward, got z=${exhaustedTarget.velocity.z}`);

  await api("POST", "/api/test/players", { count: 2 });
  state = (await api("POST", "/api/test/reset", {})).state;
  const overlapTargetId = playerAt(state, 1).id;
  await api("POST", "/api/test/ball", {
    position: { x: 14, y: BALL_RADIUS + 0.04, z: 18 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: PLAYER_STAMINA_MAX,
    yaw: 0,
    input: inputState({ kickRight: 1 })
  });
  await api("POST", "/api/test/player/1", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: PLAYER_STAMINA_MAX,
    yaw: Math.PI,
    input: inputState()
  });
  state = (await api("POST", "/api/test/tick", { frames: 4 })).state;
  const overlapTarget = state.players.find((player) => player.id === overlapTargetId);
  assert.ok(overlapTarget, "overlap hit target should remain in state");
  assert.equal(playerAt(state, 0).lastAction, "hand", "overlap RMB should still publish a hand strike");
  assert.equal(overlapTarget.stamina, 0, "overlap-range hand hit should fully drain target stamina");
  assert.equal(overlapTarget.ragdoll, true, "overlap-range hand hit should ragdoll the target");
}

async function assertEmptySpaceStrikeVisuals(api) {
  for (const strike of [
    { kind: "hand", input: { kickRight: 1 }, visible: true },
    { kind: "left", input: { kickLeft: 1 }, visible: true },
    { kind: "head", input: { head: 1 }, visible: false }
  ]) {
    await api("POST", "/api/test/players", { count: 1 });
    let state = (await api("POST", "/api/test/reset", {})).state;
    await api("POST", "/api/test/weather", { kind: "clear" });
    await api("POST", "/api/test/ball", {
      position: { x: 14, y: BALL_RADIUS + 0.04, z: 18 },
      velocity: { x: 0, y: 0, z: 0 }
    });
    const beforeAudioId = maxAudioEventId(state);
    const whiffStartStamina = 60;
    await api("POST", "/api/test/player/0", {
      position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
      stamina: whiffStartStamina,
      yaw: 0,
      input: inputState(strike.input)
    });
    state = (await api("POST", "/api/test/tick", { frames: 3 })).state;
    const player = playerAt(state, 0);
    if (strike.visible) {
      assert.equal(player.lastAction, strike.kind, `${strike.kind} whiff should still replicate a visible action`);
      assert.ok(player.lastActionAt > 0, `${strike.kind} whiff should expose action timing`);
    } else {
      assert.notEqual(player.lastAction, "body", `${strike.kind} whiff should not fall through into passive body contact`);
    }
    assert.ok(
      player.stamina > whiffStartStamina,
      `${strike.kind} whiff should not spend stamina or block recovery, got ${player.stamina}`
    );
    if (strike.visible) {
      assertAudioEvent(
        state,
        beforeAudioId,
        (event) => event.kind === "kick" && event.kick === strike.kind && event.playerId === player.id,
        `${strike.kind} whiff`
      );
    } else {
      assert.ok(
        !newerAudioEvents(state, beforeAudioId).some((event) => event.kind === "kick" && event.playerId === player.id),
        `${strike.kind} empty-space whiff should not emit a fake kick audio event`
      );
    }
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

async function assertPlayerBallSolidCollision(api) {
  await api("POST", "/api/test/players", { count: 1 });
  let state = (await api("POST", "/api/test/reset", {})).state;
  await api("POST", "/api/test/weather", { kind: "clear" });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    input: inputState({ up: true })
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: PLAYER_BALL_SAFE_RADIUS - 0.06 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  state = (await api("POST", "/api/test/tick", { frames: 10 })).state;
  assert.ok(
    state.ball.position.z > PLAYER_BALL_SAFE_RADIUS,
    `walking player should push the ball instead of passing through it; z=${state.ball.position.z}`
  );
  assert.ok(
    speed2(state.ball.velocity) > 0.2,
    `player body collision should give the ball visible velocity, got ${speed2(state.ball.velocity)}`
  );

  await api("POST", "/api/test/players", { count: 2 });
  state = (await api("POST", "/api/test/reset", {})).state;
  const blockerId = playerAt(state, 1).id;
  await api("POST", "/api/test/player/1", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: Math.PI,
    input: inputState()
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: -1.35 },
    velocity: { x: 0, y: 0, z: 170 }
  });
  state = (await api("POST", "/api/test/tick", { frames: 1 })).state;
  assert.ok(
    state.ball.position.z < -PLAYER_BALL_SAFE_RADIUS + 0.12,
    `fast ball should be kept on the incoming side of the blocker; z=${state.ball.position.z}`
  );
  assert.ok(
    state.ball.velocity.z < -40,
    `fast ball should rebound from the blocker instead of tunneling through; vz=${state.ball.velocity.z}`
  );
  assert.equal(
    playerAt(state, 1).id,
    blockerId,
    "blocker should remain the same player after ball collision"
  );
}

async function assertBallPossessionAndContextShots(api) {
  const possessionCooldownMs = Math.max(KICK_COOLDOWN_MS, 1000);
  await api("POST", "/api/game-settings", {
    settings: { ...DEFAULT_GAME_SETTINGS, kickCooldownMs: possessionCooldownMs }
  });
  await api("POST", "/api/test/players", { count: 1 });
  let state = (await api("POST", "/api/test/reset", {})).state;
  const ownerId = playerAt(state, 0).id;
  await api("POST", "/api/test/weather", { kind: "clear" });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 70,
    yaw: 0,
    input: inputState({ up: true })
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 0.72 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  state = (await api("POST", "/api/test/tick", { frames: 6 })).state;
  assert.equal(state.ball.ownerPlayerId, ownerId, "near slow ground ball should attach to the player as possession");
  const owner = playerAt(state, 0);
  assert.ok(
    Math.abs(state.ball.position.z - (owner.position.z + BALL_POSSESSION_CARRY_DISTANCE)) < 0.18,
    "owned ball should stay carried in front of the player"
  );
  state = (await api("POST", "/api/test/tick", { frames: 18 })).state;
  const movingOwner = playerAt(state, 0);
  assert.equal(state.ball.ownerPlayerId, ownerId, "possession should stay with the player while dribbling before a shot");
  assert.ok(
    Math.abs(state.ball.position.z - (movingOwner.position.z + BALL_POSSESSION_CARRY_DISTANCE)) < 0.22,
    "owned ball should keep following the player's carry point until a shot releases it"
  );

  await api("POST", "/api/test/player/0", { input: inputState({ kickLeft: 1 }) });
  state = (await api("POST", "/api/test/tick", { frames: 2 })).state;
  assert.equal(state.ball.ownerPlayerId, null, "LMB low shot should release possession");
  assert.equal(playerAt(state, 0).lastAction, "left", "LMB possession shot should replicate as a foot action");
  assert.ok(playerAt(state, 0).stamina >= 70, "LMB possession shot should not spend attacker stamina");
  assert.ok(
    state.ball.velocity.z > BALL_POSSESSION_LOW_SHOT_SPEED * 0.75,
    `low possession shot should drive the ball forward, got vz=${state.ball.velocity.z}`
  );
  assert.ok(
    state.ball.velocity.y < 1.2,
    `low possession shot should stay low, got vy=${state.ball.velocity.y}`
  );

  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 70,
    yaw: 0,
    input: inputState({ up: true })
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 0.72 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  state = (await api("POST", "/api/test/tick", { frames: 6 })).state;
  assert.equal(state.ball.ownerPlayerId, ownerId, "player should be able to regain possession for a strong low shot");
  await api("POST", "/api/test/player/0", { input: inputState({ kickLeft: 2, sprint: true }) });
  state = (await api("POST", "/api/test/tick", { frames: 2 })).state;
  assert.equal(state.ball.ownerPlayerId, null, "LMB+Shift strong low shot should release possession");
  assert.equal(playerAt(state, 0).lastAction, "left", "LMB+Shift possession shot should replicate as a foot action");
  assert.ok(playerAt(state, 0).stamina >= 70, "LMB+Shift shot should not spend attacker stamina unless Shift is driving movement drain");
  assert.ok(
    state.ball.velocity.z > BALL_POSSESSION_LOW_SHOT_SPEED * BALL_POSSESSION_STRONG_MULTIPLIER * 0.72,
    `LMB+Shift low shot should be substantially stronger, got vz=${state.ball.velocity.z}`
  );

  const cooldownOwner = playerAt(state, 0);
  await api("POST", "/api/test/ball", {
    position: {
      x: cooldownOwner.position.x,
      y: BALL_RADIUS + 0.04,
      z: cooldownOwner.position.z + BALL_POSSESSION_CARRY_DISTANCE * 0.72
    },
    velocity: { x: 0, y: 0, z: 0 }
  });
  state = (await api("POST", "/api/test/tick", { frames: 6 })).state;
  assert.equal(state.ball.ownerPlayerId, ownerId, "player should quickly regain possession for a cooldown retry check");
  await api("POST", "/api/test/player/0", { input: inputState({ kickLeft: 3 }) });
  state = (await api("POST", "/api/test/tick", { frames: 2 })).state;
  assert.equal(state.ball.ownerPlayerId, ownerId, "LMB possession shot should wait while the kick cooldown is active");
  state = (await api("POST", "/api/test/tick", {
    frames: Math.ceil((possessionCooldownMs + 80) / (1000 / 60))
  })).state;
  assert.equal(state.ball.ownerPlayerId, null, "LMB possession shot should retry and release after the cooldown expires");
  assert.equal(playerAt(state, 0).lastAction, "left", "retried LMB possession shot should replicate as a foot action");

  await api("POST", "/api/test/reset", {});
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 70,
    yaw: 0,
    input: inputState({ up: true })
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 0.72 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  state = (await api("POST", "/api/test/tick", { frames: 6 })).state;
  assert.equal(state.ball.ownerPlayerId, ownerId, "player should be able to regain possession for an upper shot");
  await api("POST", "/api/test/player/0", { input: inputState({ kickRight: 1, sprint: true }) });
  state = (await api("POST", "/api/test/tick", { frames: 2 })).state;
  assert.equal(state.ball.ownerPlayerId, null, "RMB upper shot should release possession");
  assert.equal(playerAt(state, 0).lastAction, "hand", "RMB possession shot should keep the existing right-button action channel");
  assert.ok(playerAt(state, 0).stamina >= 70, "RMB possession shot should not spend attacker stamina");
  assert.ok(
    state.ball.velocity.z > BALL_POSSESSION_LOW_SHOT_SPEED * 0.95,
    `Shift upper shot should be stronger than a normal low drive, got vz=${state.ball.velocity.z}`
  );
  assert.ok(
    state.ball.velocity.y > BALL_POSSESSION_UPPER_SHOT_LIFT * BALL_POSSESSION_STRONG_MULTIPLIER * 0.5,
    `RMB upper shot should lift the ball, got vy=${state.ball.velocity.y}`
  );
}

async function assertExhaustedPlayersCannotPossessBall(api) {
  await api("POST", "/api/game-settings", { settings: DEFAULT_GAME_SETTINGS });
  await api("POST", "/api/test/players", { count: 1 });
  let state = (await api("POST", "/api/test/reset", {})).state;
  const exhaustedPlayerId = playerAt(state, 0).id;
  await api("POST", "/api/test/weather", { kind: "clear" });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    stamina: 0,
    ragdoll: false,
    grounded: true,
    verticalVelocity: 0,
    yaw: 0,
    input: inputState({ up: true })
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 0.72 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  state = (await api("POST", "/api/test/tick", { frames: 8 })).state;
  const exhaustedPlayer = state.players.find((player) => player.id === exhaustedPlayerId);
  assert.ok(exhaustedPlayer, "exhausted possession fixture player should remain in state");
  assert.equal(exhaustedPlayer.ragdoll, false, "exhausted non-ragdoll player should remain standing for the possession gate");
  assert.equal(exhaustedPlayer.exhausted, true, "zero-stamina player should still be exhausted during the possession gate");
  assert.equal(state.ball.ownerPlayerId, null, "exhausted player should not capture or keep possession of a nearby slow ball");

  await api("POST", "/api/test/player/0", {
    stamina: PLAYER_STAMINA_MAX,
    input: inputState({ up: true })
  });
  await api("POST", "/api/test/ball", {
    position: { x: exhaustedPlayer.position.x, y: BALL_RADIUS + 0.04, z: exhaustedPlayer.position.z + 0.72 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  state = (await api("POST", "/api/test/tick", { frames: 8 })).state;
  assert.equal(state.ball.ownerPlayerId, exhaustedPlayerId, "same player should regain normal possession after stamina recovers");
}

async function assertPossessedBallHitsOtherPlayers(api) {
  await api("POST", "/api/game-settings", { settings: DEFAULT_GAME_SETTINGS });
  await api("POST", "/api/test/players", { count: 2 });
  let state = (await api("POST", "/api/test/reset", {})).state;
  await api("POST", "/api/test/weather", { kind: "clear" });
  const ownerId = playerAt(state, 0).id;
  const blockerId = playerAt(state, 1).id;
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    stamina: PLAYER_STAMINA_MAX,
    yaw: 0,
    input: inputState({ up: true })
  });
  await api("POST", "/api/test/player/1", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 1.46 },
    velocity: { x: 0, y: 0, z: 0 },
    stamina: PLAYER_STAMINA_MAX,
    yaw: Math.PI,
    input: inputState()
  });
  await api("POST", "/api/test/ball", {
    position: { x: 0, y: BALL_RADIUS + 0.04, z: 0.72 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  state = (await api("POST", "/api/test/tick", { frames: 8 })).state;
  const blocker = state.players.find((player) => player.id === blockerId);
  assert.ok(blocker, "possession blocker should remain in state");
  assert.equal(
    state.ball.ownerPlayerId,
    null,
    "owned ball should drop possession when it hits another player's body"
  );
  assert.ok(
    state.ball.position.z < blocker.position.z - PLAYER_BALL_SAFE_RADIUS + 0.18,
    `owned ball should stay on the incoming side of the blocker; ball=${state.ball.position.z}, blocker=${blocker.position.z}`
  );
  assert.ok(
    state.ball.velocity.z < -0.2,
    `owned ball should rebound from the blocker instead of passing through; vz=${state.ball.velocity.z}`
  );
  assert.equal(
    playerAt(state, 0).id,
    ownerId,
    "possession owner should remain active after losing the ball to a blocker"
  );
}

async function assertFullKnockoutFriendlyFireAndJumpDash(api) {
  const combatSettings = await api("POST", "/api/game-settings", { settings: DEFAULT_GAME_SETTINGS });
  assertCoreCombatSettings(combatSettings.settings, "friendly-fire knockout fixture");
  await api("POST", "/api/test/players", { count: 2 });
  let state = (await api("POST", "/api/test/reset", {})).state;
  const groundedFootTargetId = playerAt(state, 1).id;
  await api("POST", "/api/test/weather", { kind: "clear" });
  await api("POST", "/api/test/ball", {
    position: { x: 14, y: BALL_RADIUS + 0.04, z: 18 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: PLAYER_STAMINA_MAX,
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/player/1", {
    position: { x: 0.1, y: PLAYER_HEIGHT / 2, z: 1.15 },
    stamina: PLAYER_STAMINA_MAX,
    yaw: Math.PI,
    input: inputState()
  });
  await api("POST", "/api/test/player/0", { input: inputState({ kickLeft: 1 }) });
  state = (await api("POST", "/api/test/tick", { frames: 4 })).state;
  let attacker = playerAt(state, 0);
  const groundedFootTarget = state.players.find((player) => player.id === groundedFootTargetId);
  assert.ok(groundedFootTarget, "grounded LMB target should remain in state");
  assert.equal(attacker.lastAction, "left", "grounded no-ball LMB should replicate as a foot strike");
  assert.equal(attacker.stamina, PLAYER_STAMINA_MAX, "grounded no-ball LMB should not spend attacker stamina by default");
  assert.equal(groundedFootTarget.stamina, 0, "grounded no-ball LMB should fully drain target stamina");
  assert.equal(groundedFootTarget.ragdoll, true, "grounded no-ball LMB should ragdoll the target");

  await api("POST", "/api/test/players", { count: 3 });
  state = (await api("POST", "/api/test/reset", {})).state;
  const teammateId = playerAt(state, 2).id;
  await api("POST", "/api/test/weather", { kind: "clear" });
  await api("POST", "/api/test/ball", {
    position: { x: 14, y: BALL_RADIUS + 0.04, z: 18 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: PLAYER_STAMINA_MAX,
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/player/2", {
    position: { x: 0.15, y: PLAYER_HEIGHT / 2, z: 1.05 },
    stamina: PLAYER_STAMINA_MAX,
    yaw: Math.PI,
    input: inputState()
  });
  await api("POST", "/api/test/player/0", { input: inputState({ kickRight: 1 }) });
  state = (await api("POST", "/api/test/tick", { frames: 4 })).state;
  attacker = playerAt(state, 0);
  const teammate = state.players.find((player) => player.id === teammateId);
  assert.ok(teammate, "friendly-fire target should remain in state");
  assert.equal(teammate.team, playerAt(state, 0).team, "test target should be a teammate");
  assert.equal(attacker.lastAction, "hand", "grounded no-ball RMB should replicate as a hand strike");
  assert.equal(attacker.stamina, PLAYER_STAMINA_MAX, "grounded no-ball RMB should not spend attacker stamina by default");
  assert.equal(teammate.stamina, 0, "default friendly-fire hit should fully drain teammate stamina");
  assert.equal(teammate.ragdoll, true, "one hit should put teammate into ragdoll");
  assert.ok(teammate.velocity.z > 7.5, `friendly-fire ragdoll should be knocked forward, got z=${teammate.velocity.z}`);

  await api("POST", "/api/test/players", { count: 2 });
  state = (await api("POST", "/api/test/reset", {})).state;
  const airborneTargetId = playerAt(state, 1).id;
  await api("POST", "/api/test/ball", {
    position: { x: 14, y: BALL_RADIUS + 0.04, z: 18 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2 + 0.95, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    grounded: false,
    verticalVelocity: 0,
    stamina: PLAYER_STAMINA_MAX,
    yaw: 0,
    input: inputState({ kickLeft: 1 })
  });
  await api("POST", "/api/test/player/1", {
    position: { x: 0.08, y: PLAYER_HEIGHT / 2, z: 3.65 },
    stamina: PLAYER_STAMINA_MAX,
    yaw: Math.PI,
    input: inputState()
  });
  state = (await api("POST", "/api/test/tick", { frames: 8 })).state;
  attacker = playerAt(state, 0);
  const airborneTarget = state.players.find((player) => player.id === airborneTargetId);
  assert.ok(airborneTarget, "airborne kick target should remain in state");
  assert.equal(attacker.lastAction, "left", "airborne LMB should replicate as a foot kick");
  assert.ok(attacker.velocity.z > 4, `airborne foot kick should dash attacker forward, got z=${attacker.velocity.z}`);
  assert.equal(airborneTarget.stamina, 0, "airborne dash kick should sweep forward and fully drain target stamina");
  assert.equal(airborneTarget.ragdoll, true, "airborne dash kick should ragdoll target");
  assert.ok(airborneTarget.velocity.z > 7.5, `airborne dash kick should knock target forward, got z=${airborneTarget.velocity.z}`);
}

async function assertPlayerHitVerticalReach(api) {
  await api("POST", "/api/game-settings", { settings: DEFAULT_GAME_SETTINGS });
  await api("POST", "/api/test/players", { count: 2 });
  let state = (await api("POST", "/api/test/reset", {})).state;
  const targetId = playerAt(state, 1).id;
  await api("POST", "/api/test/weather", { kind: "clear" });
  await api("POST", "/api/test/ball", {
    position: { x: 14, y: BALL_RADIUS + 0.04, z: 18 },
    velocity: { x: 0, y: 0, z: 0 }
  });
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: PLAYER_STAMINA_MAX,
    yaw: 0,
    input: inputState()
  });
  await api("POST", "/api/test/player/1", {
    position: { x: 0.18, y: PLAYER_HEIGHT / 2 + PLAYER_HEIGHT * 1.55, z: 1.05 },
    stamina: PLAYER_STAMINA_MAX,
    yaw: Math.PI,
    input: inputState()
  });
  await api("POST", "/api/test/player/0", { input: inputState({ kickRight: 1 }) });
  state = (await api("POST", "/api/test/tick", { frames: 4 })).state;
  const attacker = playerAt(state, 0);
  const highTarget = state.players.find((player) => player.id === targetId);
  assert.ok(highTarget, "vertical reach target should remain in state");
  assert.equal(attacker.lastAction, "hand", "unreachable player strike should still replicate as a visible hand whiff");
  assert.equal(attacker.stamina, PLAYER_STAMINA_MAX, "unreachable player strike should not spend attacker stamina");
  assert.equal(highTarget.stamina, PLAYER_STAMINA_MAX, "player hit should not damage a target outside vertical reach");
  assert.equal(highTarget.ragdoll, false, "player hit should not ragdoll a target outside vertical reach");
}

async function assertKick(api, kind, ballPosition, input) {
  let state = await prepareSinglePlayer(api);
  assert.equal(state.players.length, 1);
  const playerId = playerAt(state, 0).id;
  await api("POST", "/api/test/player/0", {
    position: { x: 0, y: PLAYER_HEIGHT / 2, z: 0 },
    stamina: 70,
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
  assert.ok(playerAt(state, 0).stamina >= 70, `${kind} ball kick should not spend attacker stamina`);
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
    stamina: 70,
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
