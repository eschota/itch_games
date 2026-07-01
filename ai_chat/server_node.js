#!/usr/bin/env node
"use strict";

const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STATIC_DIR = path.join(__dirname, "static");
const DATA_DIR = process.env.AI_CHAT_DATA_DIR || path.join(__dirname, "data");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.jsonl");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const TASK_EVENTS_FILE = path.join(DATA_DIR, "tasks.jsonl");
const TELEGRAM_SEEN_FILE = path.join(DATA_DIR, "telegram_seen_updates.txt");
const MAX_MESSAGE_CHARS = 4000;
const MAX_ROLE_CHARS = 80;
const MAX_TASK_TEXT_CHARS = 2000;
let deployRunning = false;

const TASK_ROLES = [
  "Orchestrator",
  "Art Director",
  "Game Designer",
  "UI Designer",
  "Programmer",
  "Tester",
  "Sound Designer",
];
const ROLE_BADGES = [
  { label: "Producer", icon: "👑", match: ["producer", "продюсер", "рџс"] },
  { label: "Orchestrator", icon: "🧭", match: ["orchestrator"] },
  { label: "Art", icon: "🎨", match: ["art director"] },
  { label: "Game", icon: "🎲", match: ["game designer"] },
  { label: "UI", icon: "🖼️", match: ["ui designer"] },
  { label: "Code", icon: "💻", match: ["programmer", "developer", "engineer"] },
  { label: "QA", icon: "🔍", match: ["tester", "qa"] },
  { label: "Sound", icon: "🎧", match: ["sound designer", "audio"] },
  { label: "Tasks", icon: "📋", match: ["task queue"] },
  { label: "Deploy", icon: "🚀", match: ["deploy webhook", "deploy"] },
  { label: "Telegram", icon: "💬", match: ["telegram"] },
];
const TASK_STATUSES = ["new", "claimed", "in_progress", "blocked", "review", "done"];
const TASK_PRIORITIES = ["low", "normal", "high", "urgent"];
const DEFAULT_TASK_SEEDS = [
  {
    seed_key: "orchestrator-parallel-plan",
    role: "Orchestrator",
    priority: "urgent",
    title: "Create milestone Parallel Plan and task ownership",
    description: "Turn Producer requests into role-owned tasks before implementation starts. Define workstreams, owners, file scopes, branch/task ids, dependencies, merge order, and validation owner.",
    scope: ["skill.md", "skill.xml", "ai_chat/**"],
    acceptance: "Every active role has a task id and agreed scope before editing project files.",
  },
  {
    seed_key: "game-designer-core-loop",
    role: "Game Designer",
    priority: "high",
    title: "Define the next playable core loop and milestone rules",
    description: "Own mechanics, player goals, scoring, pacing, progression, and the smallest fun playable milestone.",
    scope: ["game_designer/**"],
    acceptance: "A concise design brief lists loop, win/loss, scoring, risks, affected roles, and acceptance checks.",
  },
  {
    seed_key: "programmer-game-engine",
    role: "Programmer",
    priority: "high",
    title: "Build the browser game engine foundation",
    description: "Own runtime architecture: game loop, state machine, input, physics/collision hooks, networking/server hooks when needed, versioning, packaging, and deploy-safe code boundaries.",
    scope: ["orbital-courier/src/**", "unsoccer/**", "tools/package_itch.py", "package.json"],
    acceptance: "A playable build runs locally, packages cleanly, exposes version/status, and does not touch art/UI/audio scopes without an assigned task.",
  },
  {
    seed_key: "art-director-visual-3d",
    role: "Art Director",
    priority: "high",
    title: "Define visual direction and 3D model requirements",
    description: "Own art direction, visual quality, 3D model targets, lighting, VFX, animation style, and asset acceptance rules for the next playable milestone.",
    scope: ["art_director/**"],
    acceptance: "Style/asset guidance identifies silhouettes, materials, 3D model list, visual risks, and in-game acceptance checks.",
  },
  {
    seed_key: "ui-designer-interface",
    role: "UI Designer",
    priority: "normal",
    title: "Design HUD, menus, controls, and public game presentation",
    description: "Own player-facing UI, HUD clarity, menu flow, responsive layout, catalog/game entry pages, and readable state feedback.",
    scope: ["ui_designer/**", "index.html", "*/index.html", "*/src/styles.css"],
    acceptance: "UI brief or implementation defines player actions, states, responsive behavior, and validation viewports.",
  },
  {
    seed_key: "sound-designer-audio",
    role: "Sound Designer",
    priority: "normal",
    title: "Create sound map and implement sourced/generated audio",
    description: "Own free sound search, generated audio, license notes, mix plan, event triggers, and browser audio validation.",
    scope: ["sound_designer/**"],
    acceptance: "Audio map lists gameplay events, sources/generation provenance, implementation points, mix checks, and packaging checks.",
  },
  {
    seed_key: "tester-qa-validation",
    role: "Tester",
    priority: "normal",
    title: "Create QA plan and validate integrated milestones",
    description: "Own bug reproduction, regression checks, playability, browser/input coverage, packaging checks, and separate creative QA ideas.",
    scope: ["tester/**"],
    acceptance: "QA report covers build/version, browser, inputs, critical bugs, regression risk, and concrete validation evidence.",
  },
];

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function jsonResponse(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": String(body.length),
  });
  res.end(body);
}

function errorJson(res, status, message) {
  jsonResponse(res, status, { ok: false, error: message });
}

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  return crypto.randomBytes(16).toString("hex");
}

function roleBadge(role) {
  const clean = String(role || "Agent").trim();
  const key = clean.toLowerCase();
  const badge = ROLE_BADGES.find((item) => item.match.some((part) => key.includes(part)));
  if (badge) return { icon: badge.icon, label: badge.label, text: `${badge.icon} ${badge.label}` };
  const fallback = clean.split(/[/:|-]/)[0].trim().split(/\s+/).slice(0, 2).join(" ") || "Agent";
  return { icon: "🤖", label: fallback.slice(0, 18), text: `🤖 ${fallback.slice(0, 18)}` };
}

function readPackage() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  } catch (_) {
    return {};
  }
}

function projectVersion() {
  const pkg = readPackage();
  return String(pkg.gameVersion || pkg.version || "unknown");
}

function gitCmd(args, timeoutMs) {
  return childProcess.execFileSync("git", ["-C", ROOT].concat(args), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: timeoutMs || 4000,
  }).trim();
}

function gitContext() {
  let branch = "unknown";
  let commit = "unknown";
  let dirty = false;
  try {
    branch = gitCmd(["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch (_) {}
  try {
    commit = gitCmd(["rev-parse", "--short", "HEAD"]);
  } catch (_) {}
  try {
    dirty = Boolean(gitCmd(["status", "--short"]));
  } catch (_) {}
  return { branch, commit, dirty };
}

function readMessages(limit) {
  if (!fs.existsSync(MESSAGES_FILE)) return [];
  const rows = [];
  for (const line of fs.readFileSync(MESSAGES_FILE, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (_) {}
  }
  return rows.slice(-limit);
}

function appendMessage(role, text, source, mirrorTelegram) {
  const cleanRole = String(role || "Agent").trim().split(/\s+/).join(" ").slice(0, MAX_ROLE_CHARS) || "Agent";
  const cleanText = String(text || "").trim().slice(0, MAX_MESSAGE_CHARS);
  if (!cleanText) throw new Error("message is required");
  const context = gitContext();
  const badge = roleBadge(cleanRole);
  const record = {
    id: randomId(),
    created_at: nowIso(),
    role: cleanRole,
    role_icon: badge.icon,
    role_label: badge.label,
    role_badge: badge.text,
    message: cleanText,
    project_version: projectVersion(),
    branch: context.branch,
    commit: context.commit,
    dirty: context.dirty,
    source: source || "web",
  };
  ensureDataDir();
  fs.appendFileSync(MESSAGES_FILE, JSON.stringify(record) + os.EOL, "utf8");
  if (mirrorTelegram !== false && record.source !== "telegram") {
    mirrorRecordToTelegram(record);
  }
  return record;
}

function cleanText(value, maxChars) {
  return String(value || "").trim().slice(0, maxChars || MAX_TASK_TEXT_CHARS);
}

function cleanRole(value) {
  return String(value || "Agent").trim().split(/\s+/).join(" ").slice(0, MAX_ROLE_CHARS) || "Agent";
}

function roleKey(value) {
  return cleanRole(value).toLowerCase();
}

function isProducerOrOrchestrator(role) {
  const key = roleKey(role);
  return key.includes("producer") || key.includes("orchestrator") || key.includes("продюсер");
}

function canonicalTaskRole(value) {
  const key = roleKey(value);
  return TASK_ROLES.find((role) => role.toLowerCase() === key) || "";
}

function canActOnTask(actorRole, task) {
  if (isProducerOrOrchestrator(actorRole)) return true;
  return canonicalTaskRole(actorRole) === task.role;
}

function normalizeList(value, maxItems) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  const items = raw
    .map((item) => cleanText(item, 180))
    .filter(Boolean);
  return Array.from(new Set(items)).slice(0, maxItems || 20);
}

function readTasks() {
  if (!fs.existsSync(TASKS_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(TASKS_FILE, "utf8"));
    return Array.isArray(parsed.tasks) ? parsed.tasks : [];
  } catch (_) {
    return [];
  }
}

function writeTasks(tasks) {
  ensureDataDir();
  const payload = JSON.stringify({ updated_at: nowIso(), tasks }, null, 2) + os.EOL;
  const tempFile = `${TASKS_FILE}.tmp`;
  fs.writeFileSync(tempFile, payload, "utf8");
  fs.renameSync(tempFile, TASKS_FILE);
}

function appendTaskEvent(action, task, actorRole, payload) {
  const context = gitContext();
  const record = {
    id: randomId(),
    created_at: nowIso(),
    action,
    task_id: task.id,
    task_role: task.role,
    task_status: task.status,
    actor_role: cleanRole(actorRole || "Agent"),
    project_version: projectVersion(),
    branch: context.branch,
    commit: context.commit,
    dirty: context.dirty,
    payload: payload || {},
  };
  ensureDataDir();
  fs.appendFileSync(TASK_EVENTS_FILE, JSON.stringify(record) + os.EOL, "utf8");
  return record;
}

function taskIdFromSeed(seedKey) {
  return `task_${String(seedKey || "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function newTaskId() {
  return `task_${Date.now().toString(36)}_${randomId().slice(0, 6)}`;
}

function validateTaskPayload(payload, existingTask) {
  const role = canonicalTaskRole(payload.role || existingTask?.role);
  if (!role) throw new Error("valid task role is required");
  const title = cleanText(payload.title || existingTask?.title, 160);
  if (!title) throw new Error("task title is required");
  const priority = TASK_PRIORITIES.includes(payload.priority) ? payload.priority : (existingTask?.priority || "normal");
  const status = TASK_STATUSES.includes(payload.status) ? payload.status : (existingTask?.status || "new");
  return {
    role,
    title,
    priority,
    status,
    description: cleanText(payload.description || existingTask?.description || "", MAX_TASK_TEXT_CHARS),
    scope: normalizeList(payload.scope !== undefined ? payload.scope : existingTask?.scope, 30),
    depends_on: normalizeList(payload.depends_on !== undefined ? payload.depends_on : existingTask?.depends_on, 20),
    branch: cleanText(payload.branch || existingTask?.branch || "", 120),
    acceptance: cleanText(payload.acceptance || existingTask?.acceptance || "", MAX_TASK_TEXT_CHARS),
    parallel_plan: cleanText(payload.parallel_plan || existingTask?.parallel_plan || "", MAX_TASK_TEXT_CHARS),
    validation_owner: cleanText(payload.validation_owner || existingTask?.validation_owner || "", 120),
  };
}

function taskForResponse(task) {
  const badge = roleBadge(task.role || "Agent");
  return Object.assign({}, task, {
    role_icon: badge.icon,
    role_label: badge.label,
    role_badge: badge.text,
    comments: Array.isArray(task.comments) ? task.comments.slice(-20) : [],
  });
}

function createTask(payload, seed) {
  const actorRole = cleanRole(payload.created_by_role || payload.actor_role || payload.role_actor);
  if (!isProducerOrOrchestrator(actorRole)) {
    throw new Error("only Producer or Orchestrator can create tasks");
  }
  const normalized = validateTaskPayload(payload);
  const context = gitContext();
  const task = Object.assign({
    id: seed?.id || newTaskId(),
    seed_key: seed?.seed_key || "",
    created_at: nowIso(),
    updated_at: nowIso(),
    created_by_role: actorRole,
    created_by: cleanText(payload.created_by || actorRole, 120),
    owner: "",
    owner_role: "",
    lease_until: "",
    comments: [],
    project_version: projectVersion(),
    branch_context: context.branch,
    commit_context: context.commit,
  }, normalized);
  return task;
}

function appendTaskMessage(action, task, actorRole, extra) {
  const actor = actorRole ? `${actorRole}: ` : "";
  const suffix = extra ? `\n${extra}` : "";
  appendMessage("Task Queue", `${actor}${action} \`${task.id}\` for ${task.role}: ${task.title}${suffix}`);
}

function pushTaskComment(task, actorRole, text) {
  const clean = cleanText(text, MAX_TASK_TEXT_CHARS);
  if (!clean) return;
  const comments = Array.isArray(task.comments) ? task.comments : [];
  comments.push({
    id: randomId(),
    created_at: nowIso(),
    role: cleanRole(actorRole),
    text: clean,
  });
  task.comments = comments.slice(-100);
}

function seedDefaultTasks(actorRole) {
  const tasks = readTasks();
  const existingKeys = new Set(tasks.map((task) => task.seed_key).filter(Boolean));
  const existingIds = new Set(tasks.map((task) => task.id));
  const created = [];
  for (const seed of DEFAULT_TASK_SEEDS) {
    const id = taskIdFromSeed(seed.seed_key);
    if (existingKeys.has(seed.seed_key) || existingIds.has(id)) continue;
    const task = createTask(Object.assign({}, seed, {
      created_by_role: actorRole,
      created_by: actorRole,
    }), { id, seed_key: seed.seed_key });
    tasks.push(task);
    created.push(task);
  }
  if (created.length) {
    writeTasks(tasks);
    for (const task of created) appendTaskEvent("seed", task, actorRole, {});
    appendMessage("Task Queue", `${actorRole}: Seeded ${created.length} role backlog tasks.\n${created.map((task) => `- ${task.id} -> ${task.role}: ${task.title}`).join("\n")}`);
  }
  return created;
}

function updateTask(id, updater) {
  const tasks = readTasks();
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) throw new Error("task not found");
  const next = updater(Object.assign({}, tasks[index], {
    comments: Array.isArray(tasks[index].comments) ? tasks[index].comments.slice() : [],
  }));
  next.updated_at = nowIso();
  tasks[index] = next;
  writeTasks(tasks);
  return next;
}

function telegramConfig() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || process.env.AI_CHAT_TELEGRAM_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || process.env.AI_CHAT_TELEGRAM_CHAT_ID || "").trim();
  const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET || process.env.AI_CHAT_TELEGRAM_SECRET_TOKEN || "").trim();
  return { enabled: Boolean(token && chatId), token, chat_id: chatId, secret };
}

function telegramApi(method, payload, timeoutMs) {
  const config = telegramConfig();
  if (!config.enabled) return Promise.reject(new Error("Telegram bridge is not configured"));
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const options = {
    hostname: "api.telegram.org",
    path: `/bot${config.token}/${method}`,
    method: "POST",
    timeout: timeoutMs || 35000,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(body.length),
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let parsed = {};
        try {
          parsed = JSON.parse(raw || "{}");
        } catch (_) {
          parsed = { ok: false, raw };
        }
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(parsed);
        else reject(new Error(`Telegram HTTP ${response.statusCode}: ${raw.slice(0, 300)}`));
      });
    });
    req.on("timeout", () => req.destroy(new Error("Telegram request timed out")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function telegramText(record) {
  const role = String(record.role || "Agent");
  const badge = record.role_badge || roleBadge(role).text;
  const message = String(record.message || "");
  const version = String(record.project_version || "version unknown");
  const branch = String(record.branch || "branch unknown");
  const commit = String(record.commit || "commit unknown");
  const dirty = record.dirty ? " dirty" : "";
  let text = `${badge}: ${message}\n\n${version} - ${branch} @ ${commit}${dirty}`;
  if (text.length > 3900) text = `${text.slice(0, 3890).trimEnd()}\n...[truncated]`;
  return text;
}

function sendTelegramMessage(text) {
  if (!telegramConfig().enabled) return;
  telegramApi("sendMessage", {
    chat_id: telegramConfig().chat_id,
    text: text.slice(0, 4096),
    disable_web_page_preview: true,
  }).catch((error) => {
    console.error(`telegram send failed: ${error.message}`);
  });
}

function mirrorRecordToTelegram(record) {
  if (!telegramConfig().enabled) return;
  setImmediate(() => sendTelegramMessage(telegramText(record)));
}

function telegramUpdateSeen(updateId) {
  const numeric = Number(updateId || 0);
  if (!numeric) return false;
  ensureDataDir();
  const seen = new Set();
  if (fs.existsSync(TELEGRAM_SEEN_FILE)) {
    for (const line of fs.readFileSync(TELEGRAM_SEEN_FILE, "utf8").split(/\r?\n/)) {
      const value = Number(line.trim());
      if (value) seen.add(value);
    }
  }
  if (seen.has(numeric)) return true;
  seen.add(numeric);
  const recent = Array.from(seen).sort((a, b) => a - b).slice(-1000);
  fs.writeFileSync(TELEGRAM_SEEN_FILE, recent.join(os.EOL), "utf8");
  return false;
}

function telegramSenderName(message) {
  const sender = message.from || {};
  const fullName = [sender.first_name, sender.last_name].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
  return fullName || String(sender.username || "Telegram user");
}

function telegramMessageText(message) {
  if (message.text !== undefined && message.text !== null) return String(message.text).trim();
  if (message.caption !== undefined && message.caption !== null) return String(message.caption).trim();
  return "";
}

function processTelegramUpdate(update) {
  const updateId = Number(update.update_id || 0);
  if (telegramUpdateSeen(updateId)) return false;
  const message = update.message || update.edited_message || {};
  const chat = message.chat || {};
  const config = telegramConfig();
  if (String(chat.id) !== String(config.chat_id)) return false;
  const sender = message.from || {};
  if (sender.is_bot) return false;
  const text = telegramMessageText(message);
  if (!text) return false;
  const telegramProducerName = telegramSenderName(message);
  const telegramProducerText = telegramProducerName
    ? `Продюсер: ${text}\n\nTelegram user: ${telegramProducerName}`
    : `Продюсер: ${text}`;
  appendMessage("Продюсер", telegramProducerText, "telegram", false);
  return true;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyTelegramSecret(headers) {
  const secret = telegramConfig().secret;
  if (!secret) return [false, "Telegram webhook secret is not configured"];
  const received = headers["x-telegram-bot-api-secret-token"] || "";
  if (!safeEqual(received, secret)) return [false, "invalid Telegram webhook secret"];
  return [true, "ok"];
}

function recentCommits(limit) {
  const branches = [];
  const commits = [];
  try {
    const rawBranches = gitCmd([
      "for-each-ref",
      "--format=%(refname:short)%1f%(objectname:short)%1f%(committerdate:iso-strict)%1f%(subject)",
      "refs/heads",
      "refs/remotes/origin",
    ]);
    for (const line of rawBranches.split(/\r?\n/)) {
      const parts = line.split("\x1f");
      if (parts.length === 4) branches.push({ name: parts[0], commit: parts[1], date: parts[2], subject: parts[3] });
    }
  } catch (_) {}
  try {
    const rawCommits = gitCmd([
      "log",
      "--all",
      `-n${limit || 80}`,
      "--date=iso-strict",
      "--pretty=format:%H%x1f%h%x1f%cd%x1f%D%x1f%an%x1f%s",
    ]);
    for (const line of rawCommits.split(/\r?\n/)) {
      const parts = line.split("\x1f");
      if (parts.length === 6) commits.push({ hash: parts[0], short: parts[1], date: parts[2], refs: parts[3], author: parts[4], subject: parts[5] });
    }
  } catch (_) {}
  return { branches, commits };
}

async function readJsonPayload(req, maxBytes) {
  const body = await readBody(req, maxBytes || 32768);
  if (!body.length) throw new Error("invalid request size");
  return JSON.parse(body.toString("utf8"));
}

function filteredTasks(query) {
  let tasks = readTasks();
  const role = cleanText(query.role || "", 80);
  const status = cleanText(query.status || "", 40);
  if (role && role !== "all") {
    const canonical = canonicalTaskRole(role);
    tasks = tasks.filter((task) => task.role === canonical);
  }
  if (status && status !== "all") {
    tasks = tasks.filter((task) => task.status === status);
  }
  const statusOrder = new Map(TASK_STATUSES.map((value, index) => [value, index]));
  const priorityOrder = new Map(TASK_PRIORITIES.map((value, index) => [value, index]));
  return tasks
    .slice()
    .sort((a, b) => {
      const statusDiff = (statusOrder.get(a.status) || 99) - (statusOrder.get(b.status) || 99);
      if (statusDiff) return statusDiff;
      const priorityDiff = (priorityOrder.get(b.priority) || 0) - (priorityOrder.get(a.priority) || 0);
      if (priorityDiff) return priorityDiff;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    })
    .map(taskForResponse);
}

function taskById(id) {
  return readTasks().find((task) => task.id === id);
}

function assertTaskActor(actorRole, task) {
  if (!actorRole || actorRole === "Agent") throw new Error("actor_role is required");
  if (!canActOnTask(actorRole, task)) throw new Error("actor role cannot change this task");
}

function verifyGithubSignature(headers, body) {
  const secret = process.env.AI_CHAT_WEBHOOK_SECRET || "";
  if (!secret) return [false, "webhook secret is not configured"];
  const signature = headers["x-hub-signature-256"] || "";
  if (!String(signature).startsWith("sha256=")) return [false, "missing sha256 signature"];
  const digest = crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (!safeEqual(signature, `sha256=${digest}`)) return [false, "invalid signature"];
  return [true, "ok"];
}

function runDeployFromWebhook(payload) {
  if (deployRunning) {
    appendMessage("Deploy Webhook", "Deploy webhook received, but another deploy is already running.");
    return;
  }
  deployRunning = true;
  const ref = String(payload.ref || "unknown");
  const head = payload.head_commit || {};
  const headId = String(head.id || "").slice(0, 12) || "unknown";
  appendMessage("Deploy Webhook", `GitHub push received for \`${ref}\` at \`${headId}\`. Starting autodeploy.`);
  const script = process.env.AI_CHAT_DEPLOY_SCRIPT || path.join(ROOT, "ai_chat", "deploy", "itch-games-autodeploy-qwertystock.sh");
  childProcess.execFile(script, {
    cwd: ROOT,
    timeout: 300000,
    maxBuffer: 1024 * 1024,
    encoding: "utf8",
  }, (error, stdout, stderr) => {
    const output = [stdout, stderr].map((part) => String(part || "").trim()).filter(Boolean).join("\n").slice(-2500) || "no output";
    if (!error) {
      appendMessage("Deploy Webhook", `Autodeploy completed for \`${ref}\`.\n${output}`);
    } else {
      const code = error.code === undefined ? "unknown" : error.code;
      appendMessage("Deploy Webhook", `Autodeploy failed for \`${ref}\` with exit ${code}.\n${output}`);
    }
    deployRunning = false;
  });
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("invalid request size"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendStatic(res, requestPath) {
  let target;
  if (!requestPath || requestPath === "/") {
    target = path.join(STATIC_DIR, "index.html");
  } else {
    const decoded = decodeURIComponent(requestPath.replace(/^\/+/, ""));
    const safePath = path.normalize(decoded);
    if (safePath.startsWith("..") || path.isAbsolute(safePath)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    target = path.join(STATIC_DIR, safePath);
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const body = fs.readFileSync(target);
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
    "Cache-Control": path.basename(target) === "index.html" ? "no-store" : "public, max-age=60",
    "Content-Length": String(body.length),
  });
  res.end(body);
}

function normalizePath(pathname) {
  if (pathname === "/ai_chat") return "/";
  if (pathname.startsWith("/ai_chat/")) return pathname.slice("/ai_chat".length);
  return pathname;
}

async function handleGet(req, res, parsed) {
  const pathname = normalizePath(parsed.pathname);
  if (pathname === "/api/health" || pathname === "/health") {
    jsonResponse(res, 200, {
      ok: true,
      time: nowIso(),
      project_version: projectVersion(),
      git: gitContext(),
      telegram: { enabled: telegramConfig().enabled },
    });
    return;
  }
  if (pathname === "/api/messages") {
    const limit = Math.min(Math.max(Number(parsed.query.limit || 200) || 200, 1), 500);
    jsonResponse(res, 200, { ok: true, messages: readMessages(limit) });
    return;
  }
  if (pathname === "/api/tasks") {
    jsonResponse(res, 200, {
      ok: true,
      roles: TASK_ROLES,
      statuses: TASK_STATUSES,
      priorities: TASK_PRIORITIES,
      tasks: filteredTasks(parsed.query),
    });
    return;
  }
  if (pathname.startsWith("/api/tasks/")) {
    const id = decodeURIComponent(pathname.slice("/api/tasks/".length).split("/")[0] || "");
    const task = taskById(id);
    if (!task) {
      errorJson(res, 404, "task not found");
      return;
    }
    jsonResponse(res, 200, { ok: true, task: taskForResponse(task) });
    return;
  }
  if (pathname === "/api/commits") {
    jsonResponse(res, 200, Object.assign({ ok: true }, recentCommits(80)));
    return;
  }
  if (pathname === "/api/status") {
    jsonResponse(res, 200, {
      ok: true,
      project_version: projectVersion(),
      git: gitContext(),
      message_count: readMessages(100000).length,
      task_count: readTasks().length,
      telegram: { enabled: telegramConfig().enabled },
    });
    return;
  }
  sendStatic(res, pathname);
}

async function handlePost(req, res, parsed) {
  const pathname = normalizePath(parsed.pathname);
  if (pathname === "/api/deploy-webhook") {
    const body = await readBody(req, 262144);
    const [ok, reason] = verifyGithubSignature(req.headers, body);
    if (!ok) {
      errorJson(res, 403, reason);
      return;
    }
    let payload;
    try {
      payload = JSON.parse(body.toString("utf8"));
    } catch (_) {
      errorJson(res, 400, "invalid json");
      return;
    }
    const event = req.headers["x-github-event"] || "";
    if (event === "ping") {
      jsonResponse(res, 200, { ok: true, event: "ping", message: "pong" });
      return;
    }
    if (event !== "push") {
      jsonResponse(res, 200, { ok: true, ignored: true, event });
      return;
    }
    const ref = String(payload.ref || "");
    if (ref !== "refs/heads/main") {
      jsonResponse(res, 200, { ok: true, ignored: true, event, ref });
      return;
    }
    setImmediate(() => runDeployFromWebhook(payload));
    jsonResponse(res, 202, { ok: true, accepted: true, event, ref });
    return;
  }

  if (pathname === "/api/telegram-webhook") {
    const [ok, reason] = verifyTelegramSecret(req.headers);
    if (!ok) {
      errorJson(res, 403, reason);
      return;
    }
    const body = await readBody(req, 262144);
    let payload;
    try {
      payload = JSON.parse(body.toString("utf8"));
    } catch (_) {
      errorJson(res, 400, "invalid json");
      return;
    }
    try {
      jsonResponse(res, 200, { ok: true, accepted: processTelegramUpdate(payload) });
    } catch (error) {
      errorJson(res, 500, `telegram update failed: ${error.message}`);
    }
    return;
  }

  if (pathname === "/api/tasks") {
    try {
      const payload = await readJsonPayload(req, 32768);
      const task = createTask(payload);
      const tasks = readTasks();
      tasks.push(task);
      writeTasks(tasks);
      appendTaskEvent("create", task, task.created_by_role, { title: task.title });
      appendTaskMessage("Created task", task, task.created_by_role, task.scope.length ? `Scope: ${task.scope.join(", ")}` : "");
      jsonResponse(res, 201, { ok: true, task: taskForResponse(task) });
    } catch (error) {
      errorJson(res, 400, error.message);
    }
    return;
  }

  if (pathname === "/api/tasks/seed") {
    try {
      const payload = await readJsonPayload(req, 8192);
      const actorRole = cleanRole(payload.actor_role || payload.created_by_role);
      if (!isProducerOrOrchestrator(actorRole)) throw new Error("only Producer or Orchestrator can seed tasks");
      const created = seedDefaultTasks(actorRole);
      jsonResponse(res, 201, { ok: true, created: created.map(taskForResponse), tasks: filteredTasks({}) });
    } catch (error) {
      errorJson(res, 400, error.message);
    }
    return;
  }

  if (pathname.startsWith("/api/tasks/")) {
    const parts = pathname.split("/").filter(Boolean);
    const taskId = decodeURIComponent(parts[2] || "");
    const action = parts[3] || "";
    try {
      const payload = await readJsonPayload(req, 32768);
      const actorRole = cleanRole(payload.actor_role || payload.role || payload.owner_role);
      const task = updateTask(taskId, (current) => {
        if (action === "comment") {
          if (!actorRole || actorRole === "Agent") throw new Error("actor_role is required");
          pushTaskComment(current, actorRole, payload.comment || payload.note || payload.message);
          return current;
        }
        assertTaskActor(actorRole, current);
        if (action === "claim") {
          if (current.status === "done") throw new Error("done task cannot be claimed");
          current.owner = cleanText(payload.owner || actorRole, 120);
          current.owner_role = canonicalTaskRole(payload.owner_role || actorRole) || current.role;
          current.status = current.status === "new" ? "claimed" : current.status;
          const leaseMinutes = Math.min(Math.max(Number(payload.lease_minutes || 120) || 120, 15), 1440);
          current.lease_until = new Date(Date.now() + leaseMinutes * 60000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
          pushTaskComment(current, actorRole, payload.note || `Claimed for ${leaseMinutes} minutes.`);
          return current;
        }
        if (action === "status") {
          const nextStatus = cleanText(payload.status, 40);
          if (!TASK_STATUSES.includes(nextStatus)) throw new Error("valid status is required");
          current.status = nextStatus;
          if (payload.owner) current.owner = cleanText(payload.owner, 120);
          if (payload.owner_role) current.owner_role = canonicalTaskRole(payload.owner_role) || current.owner_role;
          pushTaskComment(current, actorRole, payload.note || payload.comment || "");
          return current;
        }
        if (action === "update") {
          if (!isProducerOrOrchestrator(actorRole)) throw new Error("only Producer or Orchestrator can update task ownership/scope");
          const normalized = validateTaskPayload(payload, current);
          Object.assign(current, normalized);
          pushTaskComment(current, actorRole, payload.note || "");
          return current;
        }
        throw new Error("unknown task action");
      });
      appendTaskEvent(action, task, actorRole, { status: task.status, owner: task.owner });
      if (action !== "comment") {
        appendTaskMessage(`${action} task`, task, actorRole, task.status ? `Status: ${task.status}` : "");
      }
      jsonResponse(res, 200, { ok: true, task: taskForResponse(task) });
    } catch (error) {
      const status = error.message === "task not found" ? 404 : 400;
      errorJson(res, status, error.message);
    }
    return;
  }

  if (pathname !== "/api/messages") {
    errorJson(res, 404, "not found");
    return;
  }
  const body = await readBody(req, 16384);
  if (!body.length) {
    errorJson(res, 400, "invalid request size");
    return;
  }
  try {
    const payload = JSON.parse(body.toString("utf8"));
    const record = appendMessage(payload.role || "Agent", payload.message || "");
    jsonResponse(res, 201, { ok: true, message: record });
  } catch (error) {
    errorJson(res, 400, error.message);
  }
}

async function handleRequest(req, res) {
  const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
  const parsed = {
    pathname: requestUrl.pathname,
    query: Object.fromEntries(requestUrl.searchParams.entries()),
  };
  try {
    if (req.method === "GET") {
      await handleGet(req, res, parsed);
      return;
    }
    if (req.method === "POST") {
      await handlePost(req, res, parsed);
      return;
    }
    errorJson(res, 405, "method not allowed");
  } catch (error) {
    if (!res.headersSent) errorJson(res, 500, error.message || "internal server error");
  }
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function main() {
  const host = argValue("--host", process.env.AI_CHAT_HOST || "127.0.0.1");
  const port = Number(argValue("--port", process.env.AI_CHAT_PORT || "8765"));
  ensureDataDir();
  console.log(`telegram bridge ${telegramConfig().enabled ? "enabled" : "disabled"}`);
  http.createServer(handleRequest).listen(port, host, () => {
    console.log(`ai_chat node server listening on http://${host}:${port}`);
  });
}

main();
