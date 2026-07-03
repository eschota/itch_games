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
const MESSAGE_ARCHIVES_DIR = path.join(DATA_DIR, "message_archives");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const TASK_EVENTS_FILE = path.join(DATA_DIR, "tasks.jsonl");
const TODOS_FILE = path.join(DATA_DIR, "todos.json");
const TODO_EVENTS_FILE = path.join(DATA_DIR, "todos.jsonl");
const MEDIA_DIR = path.join(DATA_DIR, "media");
const TELEGRAM_SEEN_FILE = path.join(DATA_DIR, "telegram_seen_updates.txt");
const DEPLOY_STATUS_FILE = path.join(DATA_DIR, "deploy_status.json");
const MAX_MESSAGE_CHARS = 4000;
const MAX_ROLE_CHARS = 80;
const MAX_TASK_TEXT_CHARS = 2000;
const MAX_MEDIA_FILE_BYTES = 25 * 1024 * 1024;
const MAX_MEDIA_UPLOAD_BYTES = 80 * 1024 * 1024;
const MAX_MEDIA_ATTACHMENTS = 8;
let deployRunning = false;
let deployQueuedPayload = null;
let unsoccerChild = null;
let unsoccerLastStart = null;
let unsoccerLastExit = null;
let unsoccerOutputTail = [];
let shuttingDown = false;

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
  { label: "Producer", icon: "👑", match: ["producer", "продюсер"] },
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
const TODO_STATUSES = ["open", "promoted", "done", "blocked"];
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
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".wav": "audio/wav",
  ".zip": "application/zip",
};

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function ensureMediaDir() {
  ensureDataDir();
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
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

function sanitizeFileName(value, fallback) {
  const name = String(value || fallback || "file")
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 90);
  return name || fallback || "file";
}

function extensionFromMime(mimeType) {
  const mime = String(mimeType || "").toLowerCase().split(";")[0].trim();
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "text/plain": ".txt",
  };
  return map[mime] || "";
}

function safeMediaType(fileName, mimeType) {
  const mime = String(mimeType || "").toLowerCase().split(";")[0].trim();
  const ext = path.extname(String(fileName || "")).toLowerCase();
  const allowedByExt = {
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".txt": "text/plain",
    ".wav": "audio/wav",
    ".webm": "video/webm",
    ".webp": "image/webp",
    ".zip": "application/zip",
  };
  const allowedMimes = new Set(Object.values(allowedByExt));
  const safeMime = allowedMimes.has(mime) ? mime : (allowedByExt[ext] || "application/octet-stream");
  const safeExt = allowedByExt[ext] === safeMime ? ext : (extensionFromMime(safeMime) || ".bin");
  return { mimeType: safeMime, extension: safeExt };
}

function mediaKind(mimeType, fileName) {
  const mime = String(mimeType || "").toLowerCase();
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (mime.startsWith("image/") || [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) return "image";
  if (mime.startsWith("video/") || [".mp4", ".webm", ".mov"].includes(ext)) return "video";
  if (mime.startsWith("audio/") || [".mp3", ".wav", ".ogg"].includes(ext)) return "audio";
  return "file";
}

function publicBaseUrl(req) {
  const configured = String(process.env.AI_CHAT_PUBLIC_URL || "").replace(/\/+$/, "").replace(/\/ai_chat$/i, "");
  if (configured) return configured;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1";
  const forwardedProto = req.headers["x-forwarded-proto"];
  let proto = forwardedProto || (req.socket.encrypted ? "https" : "http");
  if (!forwardedProto && !/^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)(:\d+)?$/i.test(String(host))) proto = "https";
  return `${proto}://${host}`;
}

function mediaUrl(req, relativePath) {
  return `${publicBaseUrl(req)}/ai_chat/media/${relativePath.split(path.sep).join("/")}`;
}

function datedMediaDir() {
  const now = new Date();
  const parts = [
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ];
  return path.join(...parts);
}

function attachmentFromStoredFile(req, options) {
  const relativePath = options.relativePath.split(path.sep).join("/");
  const mimeType = String(options.mimeType || MIME_TYPES[path.extname(options.fileName).toLowerCase()] || "application/octet-stream");
  return {
    id: randomId(),
    collection_id: options.collectionId || "",
    created_at: nowIso(),
    source: options.source || "web",
    kind: mediaKind(mimeType, options.fileName),
    file_name: options.fileName,
    original_name: options.originalName || options.fileName,
    mime_type: mimeType,
    size: Number(options.size || 0),
    path: relativePath,
    url: mediaUrl(req, relativePath),
  };
}

function storeMediaBuffer(req, file, source, collectionId) {
  const body = Buffer.isBuffer(file.body) ? file.body : Buffer.alloc(0);
  if (!body.length) throw new Error("empty media file");
  if (body.length > MAX_MEDIA_FILE_BYTES) throw new Error(`media file exceeds ${MAX_MEDIA_FILE_BYTES} bytes`);
  ensureMediaDir();
  const originalName = sanitizeFileName(file.filename || "upload", "upload");
  const mediaType = safeMediaType(originalName, file.contentType);
  const ext = mediaType.extension;
  const baseName = sanitizeFileName(path.basename(originalName, path.extname(originalName)), "media");
  const storedName = `${Date.now().toString(36)}-${randomId().slice(0, 8)}-${baseName}${ext}`.toLowerCase();
  const relativeDir = datedMediaDir();
  const absoluteDir = path.join(MEDIA_DIR, relativeDir);
  fs.mkdirSync(absoluteDir, { recursive: true });
  const absolutePath = path.join(absoluteDir, storedName);
  fs.writeFileSync(absolutePath, body);
  return attachmentFromStoredFile(req, {
    relativePath: path.join(relativeDir, storedName),
    fileName: storedName,
    originalName,
    mimeType: mediaType.mimeType,
    size: body.length,
    source,
    collectionId,
  });
}

function storeMediaStream(req, readable, options) {
  ensureMediaDir();
  const originalName = sanitizeFileName(options.originalName || "telegram-file", "telegram-file");
  const mediaType = safeMediaType(originalName, options.mimeType);
  const ext = mediaType.extension;
  const baseName = sanitizeFileName(path.basename(originalName, path.extname(originalName)), "media");
  const storedName = `${Date.now().toString(36)}-${randomId().slice(0, 8)}-${baseName}${ext}`.toLowerCase();
  const relativeDir = datedMediaDir();
  const absoluteDir = path.join(MEDIA_DIR, relativeDir);
  fs.mkdirSync(absoluteDir, { recursive: true });
  const absolutePath = path.join(absoluteDir, storedName);
  let size = 0;
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(absolutePath, { flags: "wx" });
    readable.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_MEDIA_FILE_BYTES) {
        readable.destroy(new Error(`media file exceeds ${MAX_MEDIA_FILE_BYTES} bytes`));
      }
    });
    readable.on("error", reject);
    output.on("error", reject);
    output.on("finish", () => resolve(attachmentFromStoredFile(req, {
      relativePath: path.join(relativeDir, storedName),
      fileName: storedName,
      originalName,
      mimeType: mediaType.mimeType,
      size,
      source: options.source || "telegram",
      collectionId: options.collectionId || "",
    })));
    readable.pipe(output);
  });
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
  return readAllMessages().slice(-limit);
}

function readAllMessages() {
  if (!fs.existsSync(MESSAGES_FILE)) return [];
  const rows = [];
  for (const line of fs.readFileSync(MESSAGES_FILE, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (_) {}
  }
  return rows;
}

function writeMessages(records) {
  ensureDataDir();
  const payload = records.map((record) => JSON.stringify(record)).join(os.EOL) + (records.length ? os.EOL : "");
  const tempFile = `${MESSAGES_FILE}.tmp`;
  fs.writeFileSync(tempFile, payload, "utf8");
  fs.renameSync(tempFile, MESSAGES_FILE);
}

function messageArchiveCount() {
  if (!fs.existsSync(MESSAGE_ARCHIVES_DIR)) return 0;
  return fs.readdirSync(MESSAGE_ARCHIVES_DIR).filter((name) => name.endsWith(".jsonl")).length;
}

function isAdminRole(role) {
  const key = roleKey(role);
  return key.includes("admin") || key.includes("storekeeper") || key.includes("administrator");
}

function archiveMessages(payload) {
  const actorRole = cleanRole(payload.actor_role || payload.role || payload.created_by_role);
  if (!isProducerOrOrchestrator(actorRole) && !isAdminRole(actorRole)) {
    throw new Error("only Producer, Orchestrator, or Admin can archive chat");
  }
  if (String(payload.confirm || "").trim() !== "archive-chat") {
    throw new Error("confirm must be archive-chat");
  }

  const keep = Math.min(Math.max(Number(payload.keep || 160) || 160, 50), 500);
  const reason = cleanText(payload.reason || "Admin chat history archive", 500);
  const messages = readAllMessages();
  if (messages.length <= keep) {
    return { archived: 0, kept: messages.length, archive_file: "", keep, reason };
  }

  const archive = messages.slice(0, messages.length - keep);
  const kept = messages.slice(-keep);
  fs.mkdirSync(MESSAGE_ARCHIVES_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeVersion = sanitizeFileName(projectVersion(), "version");
  const archiveFile = path.join(MESSAGE_ARCHIVES_DIR, `${stamp}-${safeVersion}-${archive.length}-messages.jsonl`);
  fs.writeFileSync(archiveFile, archive.map((record) => JSON.stringify(record)).join(os.EOL) + os.EOL, "utf8");

  const context = gitContext();
  const badge = roleBadge("Admin Storekeeper");
  kept.push({
    id: randomId(),
    created_at: nowIso(),
    role: "Admin Storekeeper",
    role_icon: badge.icon,
    role_label: badge.label,
    role_badge: badge.text,
    message: `Archived ${archive.length} older chat message(s) to ${path.relative(DATA_DIR, archiveFile).replace(/\\/g, "/")}. Reason: ${reason}`,
    project_version: projectVersion(),
    branch: context.branch,
    commit: context.commit,
    dirty: context.dirty,
    source: "system",
    attachments: [],
  });
  writeMessages(kept);
  return { archived: archive.length, kept: kept.length, archive_file: path.basename(archiveFile), keep, reason };
}

function sanitizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((item) => item && item.url && item.file_name)
    .slice(0, MAX_MEDIA_ATTACHMENTS)
    .map((item) => ({
      id: cleanText(item.id || randomId(), 80),
      collection_id: cleanText(item.collection_id || "", 120),
      created_at: cleanText(item.created_at || nowIso(), 40),
      source: cleanText(item.source || "web", 40),
      kind: ["image", "video", "audio", "file"].includes(item.kind) ? item.kind : "file",
      file_name: cleanText(item.file_name, 180),
      original_name: cleanText(item.original_name || item.file_name, 180),
      mime_type: cleanText(item.mime_type || "application/octet-stream", 120),
      size: Number(item.size || 0),
      path: cleanText(item.path || "", 300),
      url: cleanText(item.url, 1000),
    }));
}

function appendMessage(role, text, source, mirrorTelegram, attachments) {
  const cleanRole = String(role || "Agent").trim().split(/\s+/).join(" ").slice(0, MAX_ROLE_CHARS) || "Agent";
  const cleanAttachments = sanitizeAttachments(attachments);
  let cleanText = String(text || "").trim().slice(0, MAX_MESSAGE_CHARS);
  if (!cleanText && cleanAttachments.length) cleanText = "Media attachments";
  if (!cleanText) throw new Error("message or media attachment is required");
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
    attachments: cleanAttachments,
  };
  ensureDataDir();
  fs.appendFileSync(MESSAGES_FILE, JSON.stringify(record) + os.EOL, "utf8");
  if (mirrorTelegram !== false && record.source !== "telegram") {
    mirrorRecordToTelegram(record);
  }
  return record;
}

function deployPayloadSummary(payload) {
  const head = payload?.head_commit || {};
  return {
    ref: String(payload?.ref || "unknown"),
    head_id: String(head.id || "").slice(0, 12) || "unknown",
    head_message: cleanText(head.message || "", 240),
    received_at: nowIso(),
  };
}

function readDeployStatus() {
  try {
    return JSON.parse(fs.readFileSync(DEPLOY_STATUS_FILE, "utf8"));
  } catch (_) {
    return null;
  }
}

function writeDeployStatus(patch) {
  const current = readDeployStatus() || {};
  const next = Object.assign({}, current, patch, { updated_at: nowIso() });
  ensureDataDir();
  fs.writeFileSync(DEPLOY_STATUS_FILE, JSON.stringify(next, null, 2) + os.EOL, "utf8");
  return next;
}

function deployOutputTail(stdout, stderr) {
  const output = [stdout, stderr]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n")
    .slice(-6000);
  return output || "no output";
}

function deployScriptPath() {
  const fallback = path.join(ROOT, "ai_chat", "deploy", "itch-games-autodeploy-qwertystock.sh");
  const configured = String(process.env.AI_CHAT_DEPLOY_SCRIPT || "").trim();
  if (!configured) return fallback;
  if (configured === "/usr/local/bin/itch-games-autodeploy.sh") return fallback;
  if (!fs.existsSync(configured)) return fallback;
  return configured;
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

function readTodos() {
  if (!fs.existsSync(TODOS_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(TODOS_FILE, "utf8"));
    return Array.isArray(parsed.todos) ? parsed.todos : [];
  } catch (_) {
    return [];
  }
}

function writeTodos(todos) {
  ensureDataDir();
  const payload = JSON.stringify({ updated_at: nowIso(), todos }, null, 2) + os.EOL;
  const tempFile = `${TODOS_FILE}.tmp`;
  fs.writeFileSync(tempFile, payload, "utf8");
  fs.renameSync(tempFile, TODOS_FILE);
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

function appendTodoEvent(action, todo, actorRole, payload) {
  const context = gitContext();
  const record = {
    id: randomId(),
    created_at: nowIso(),
    action,
    todo_id: todo.id,
    todo_status: todo.status,
    actor_role: cleanRole(actorRole || "Agent"),
    project_version: projectVersion(),
    branch: context.branch,
    commit: context.commit,
    dirty: context.dirty,
    payload: payload || {},
  };
  ensureDataDir();
  fs.appendFileSync(TODO_EVENTS_FILE, JSON.stringify(record) + os.EOL, "utf8");
  return record;
}

function taskIdFromSeed(seedKey) {
  return `task_${String(seedKey || "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function newTaskId() {
  return `task_${Date.now().toString(36)}_${randomId().slice(0, 6)}`;
}

function newTodoId() {
  return `todo_${Date.now().toString(36)}_${randomId().slice(0, 6)}`;
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

function validateTodoPayload(payload, existingTodo) {
  const title = cleanText(payload.title || existingTodo?.title, 200);
  if (!title) throw new Error("todo title is required");
  const priority = TASK_PRIORITIES.includes(payload.priority) ? payload.priority : (existingTodo?.priority || "normal");
  const status = TODO_STATUSES.includes(payload.status) ? payload.status : (existingTodo?.status || "open");
  return {
    title,
    priority,
    status,
    description: cleanText(payload.description || existingTodo?.description || "", MAX_TASK_TEXT_CHARS),
    acceptance: cleanText(payload.acceptance || existingTodo?.acceptance || "", MAX_TASK_TEXT_CHARS),
    source: cleanText(payload.source || existingTodo?.source || "producer-idea", 120),
    tags: normalizeList(payload.tags !== undefined ? payload.tags : existingTodo?.tags, 20),
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

function todoForResponse(todo) {
  return Object.assign({}, todo, {
    mandatory_when_idle: todo.status === "open",
    comments: Array.isArray(todo.comments) ? todo.comments.slice(-20) : [],
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

function createTodo(payload) {
  const actorRole = cleanRole(payload.created_by_role || payload.actor_role || "Orchestrator");
  if (!isProducerOrOrchestrator(actorRole)) {
    throw new Error("only Producer or Orchestrator can create todos");
  }
  const normalized = validateTodoPayload(payload);
  const context = gitContext();
  return Object.assign({
    id: newTodoId(),
    created_at: nowIso(),
    updated_at: nowIso(),
    created_by_role: actorRole,
    created_by: cleanText(payload.created_by || actorRole, 120),
    owner_role: "Orchestrator",
    promoted_task_id: "",
    comments: [],
    project_version: projectVersion(),
    branch_context: context.branch,
    commit_context: context.commit,
  }, normalized);
}

function appendTaskMessage(action, task, actorRole, extra) {
  const actor = actorRole ? `${actorRole}: ` : "";
  const suffix = extra ? `\n${extra}` : "";
  appendMessage("Task Queue", `${actor}${action} \`${task.id}\` for ${task.role}: ${task.title}${suffix}`);
}

function appendTodoMessage(action, todo, actorRole, extra) {
  const actor = actorRole ? `${actorRole}: ` : "";
  const suffix = extra ? `\n${extra}` : "";
  appendMessage("Todo List", `${actor}${action} \`${todo.id}\`: ${todo.title}${suffix}`);
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

function pushTodoComment(todo, actorRole, text) {
  const clean = cleanText(text, MAX_TASK_TEXT_CHARS);
  if (!clean) return;
  const comments = Array.isArray(todo.comments) ? todo.comments : [];
  comments.push({
    id: randomId(),
    created_at: nowIso(),
    role: cleanRole(actorRole),
    text: clean,
  });
  todo.comments = comments.slice(-100);
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

function updateTodo(id, updater) {
  const todos = readTodos();
  const index = todos.findIndex((todo) => todo.id === id);
  if (index < 0) throw new Error("todo not found");
  const next = updater(Object.assign({}, todos[index], {
    comments: Array.isArray(todos[index].comments) ? todos[index].comments.slice() : [],
  }));
  next.updated_at = nowIso();
  todos[index] = next;
  writeTodos(todos);
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

function telegramCaption(record) {
  const caption = telegramText(record);
  return caption.length > 1024 ? `${caption.slice(0, 1014).trimEnd()}\n...[cut]` : caption;
}

function publicSiteBaseUrl() {
  const configured = String(process.env.AI_CHAT_PUBLIC_URL || "").replace(/\/+$/, "").replace(/\/ai_chat$/i, "");
  return configured || "https://io-games.mecharulez.com";
}

function envList(name) {
  return String(process.env[name] || "")
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function openBuildUrl() {
  const configured = String(process.env.AI_CHAT_OPEN_BUILD_URL || process.env.AI_CHAT_BUILD_URL || "").trim();
  return configured || `${publicSiteBaseUrl()}/unsoccer/`;
}

function isBuildNotification(record) {
  const role = String(record.role || "").toLowerCase();
  const message = String(record.message || "").toLowerCase();
  return role.includes("deploy")
    || message.includes("autodeploy")
    || message.includes("build:unsoccer")
    || message.includes("package:unsoccer")
    || message.includes("package_itch.py unsoccer")
    || message.includes("unsoccer-itch.zip")
    || message.includes("health 8788")
    || message.includes("health 8787");
}

function telegramOpenBuildMarkup(record) {
  if (!isBuildNotification(record)) return null;
  const url = openBuildUrl();
  const button = process.env.AI_CHAT_TELEGRAM_BUILD_WEB_APP === "1"
    ? { text: "Открыть билд", web_app: { url } }
    : { text: "Открыть билд", url };
  return { inline_keyboard: [[button]] };
}

function sendTelegramMessage(text, replyMarkup) {
  if (!telegramConfig().enabled) return Promise.resolve();
  const payload = {
    chat_id: telegramConfig().chat_id,
    text: text.slice(0, 4096),
    disable_web_page_preview: true,
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramApi("sendMessage", payload);
}

function telegramAttachmentUrl(attachment) {
  const configured = String(process.env.AI_CHAT_PUBLIC_URL || "").replace(/\/+$/, "").replace(/\/ai_chat$/i, "");
  if (!configured) return attachment.url;
  try {
    const url = new URL(String(attachment.url || ""));
    return `${configured}${url.pathname}${url.search}`;
  } catch (_) {
    return attachment.url;
  }
}

function telegramMediaType(attachment) {
  if (attachment.kind === "image") return "photo";
  if (attachment.kind === "video") return "video";
  if (attachment.kind === "audio") return "audio";
  return "document";
}

function sendTelegramAttachment(attachment, caption) {
  const type = telegramMediaType(attachment);
  const payload = {
    chat_id: telegramConfig().chat_id,
    caption: caption || undefined,
  };
  if (type === "photo") payload.photo = telegramAttachmentUrl(attachment);
  else if (type === "video") payload.video = telegramAttachmentUrl(attachment);
  else if (type === "audio") payload.audio = telegramAttachmentUrl(attachment);
  else payload.document = telegramAttachmentUrl(attachment);
  const method = type === "photo" ? "sendPhoto"
    : type === "video" ? "sendVideo"
    : type === "audio" ? "sendAudio"
    : "sendDocument";
  return telegramApi(method, payload, 60000);
}

async function sendTelegramRecord(record) {
  const attachments = sanitizeAttachments(record.attachments);
  const text = telegramText(record);
  const openBuildMarkup = telegramOpenBuildMarkup(record);
  if (!attachments.length) {
    await sendTelegramMessage(text, openBuildMarkup);
    return;
  }
  await sendTelegramMessage(text, openBuildMarkup);
  const groupable = attachments.length > 1
    && attachments.length <= 10
    && attachments.every((attachment) => ["image", "video"].includes(attachment.kind));
  if (groupable) {
    await telegramApi("sendMediaGroup", {
      chat_id: telegramConfig().chat_id,
      media: attachments.map((attachment, index) => ({
        type: attachment.kind === "video" ? "video" : "photo",
        media: telegramAttachmentUrl(attachment),
        caption: index === 0 ? `Media attachments (${attachments.length})` : undefined,
      })),
    }, 60000);
    return;
  }
  for (let index = 0; index < attachments.length; index += 1) {
    await sendTelegramAttachment(attachments[index], `Media ${index + 1}/${attachments.length}`);
  }
}

function mirrorRecordToTelegram(record) {
  if (!telegramConfig().enabled) return;
  setImmediate(() => {
    sendTelegramRecord(record).catch((error) => {
      console.error(`telegram send failed: ${error.message}`);
    });
  });
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

function telegramAttachmentCandidates(message) {
  const items = [];
  if (Array.isArray(message.photo) && message.photo.length) {
    const photo = message.photo[message.photo.length - 1];
    items.push({
      file_id: photo.file_id,
      file_size: photo.file_size || 0,
      original_name: `telegram-photo-${message.message_id || Date.now()}.jpg`,
      mime_type: "image/jpeg",
    });
  }
  if (message.document?.file_id) {
    items.push({
      file_id: message.document.file_id,
      file_size: message.document.file_size || 0,
      original_name: message.document.file_name || `telegram-document-${message.message_id || Date.now()}`,
      mime_type: message.document.mime_type || "application/octet-stream",
    });
  }
  if (message.video?.file_id) {
    items.push({
      file_id: message.video.file_id,
      file_size: message.video.file_size || 0,
      original_name: message.video.file_name || `telegram-video-${message.message_id || Date.now()}.mp4`,
      mime_type: message.video.mime_type || "video/mp4",
    });
  }
  if (message.audio?.file_id) {
    items.push({
      file_id: message.audio.file_id,
      file_size: message.audio.file_size || 0,
      original_name: message.audio.file_name || `telegram-audio-${message.message_id || Date.now()}.mp3`,
      mime_type: message.audio.mime_type || "audio/mpeg",
    });
  }
  if (message.voice?.file_id) {
    items.push({
      file_id: message.voice.file_id,
      file_size: message.voice.file_size || 0,
      original_name: `telegram-voice-${message.message_id || Date.now()}.ogg`,
      mime_type: message.voice.mime_type || "audio/ogg",
    });
  }
  if (message.animation?.file_id) {
    items.push({
      file_id: message.animation.file_id,
      file_size: message.animation.file_size || 0,
      original_name: message.animation.file_name || `telegram-animation-${message.message_id || Date.now()}.mp4`,
      mime_type: message.animation.mime_type || "video/mp4",
    });
  }
  return items.filter((item) => item.file_id).slice(0, MAX_MEDIA_ATTACHMENTS);
}

function telegramFileDownloadStream(token, filePath) {
  const encodedPath = String(filePath || "").split("/").map(encodeURIComponent).join("/");
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: "api.telegram.org",
      path: `/file/bot${token}/${encodedPath}`,
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Telegram file HTTP ${response.statusCode}`));
        return;
      }
      resolve(response);
    });
    req.on("error", reject);
    req.setTimeout(60000, () => req.destroy(new Error("Telegram file download timed out")));
  });
}

async function downloadTelegramAttachment(req, candidate, collectionId) {
  if (candidate.file_size && candidate.file_size > MAX_MEDIA_FILE_BYTES) {
    throw new Error(`${candidate.original_name} exceeds media size limit`);
  }
  const config = telegramConfig();
  const info = await telegramApi("getFile", { file_id: candidate.file_id }, 30000);
  const filePath = info?.result?.file_path;
  if (!filePath) throw new Error("Telegram getFile did not return file_path");
  const stream = await telegramFileDownloadStream(config.token, filePath);
  return storeMediaStream(req, stream, {
    originalName: candidate.original_name,
    mimeType: candidate.mime_type,
    source: "telegram",
    collectionId,
  });
}

async function processTelegramUpdate(req, update) {
  const updateId = Number(update.update_id || 0);
  if (telegramUpdateSeen(updateId)) return false;
  const message = update.message || update.edited_message || {};
  const chat = message.chat || {};
  const config = telegramConfig();
  if (String(chat.id) !== String(config.chat_id)) return false;
  const sender = message.from || {};
  if (sender.is_bot) return false;
  const text = telegramMessageText(message);
  const candidates = telegramAttachmentCandidates(message);
  if (!text && !candidates.length) return false;
  const collectionId = message.media_group_id ? `telegram_${message.media_group_id}` : "";
  const attachments = [];
  const mediaErrors = [];
  for (const candidate of candidates) {
    try {
      attachments.push(await downloadTelegramAttachment(req, candidate, collectionId));
    } catch (error) {
      mediaErrors.push(`${candidate.original_name}: ${error.message}`);
    }
  }
  const telegramProducerName = telegramSenderName(message);
  const mediaNote = attachments.length ? `\n\nMedia: ${attachments.map((item) => item.url).join("\n")}` : "";
  const errorNote = mediaErrors.length ? `\n\nMedia download errors:\n${mediaErrors.join("\n")}` : "";
  const telegramProducerText = telegramProducerName
    ? `Продюсер: ${text || "Media message"}${mediaNote}${errorNote}\n\nTelegram user: ${telegramProducerName}`
    : `Продюсер: ${text || "Media message"}${mediaNote}${errorNote}`;
  appendMessage("Продюсер", telegramProducerText, "telegram", false, attachments);
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

function activeTasksRemaining() {
  return readTasks().filter((task) => task.status !== "done").length;
}

function filteredTodos(query) {
  let todos = readTodos();
  const status = cleanText(query.status || "", 40);
  if (status && status !== "all") {
    todos = todos.filter((todo) => todo.status === status);
  }
  const statusOrder = new Map(TODO_STATUSES.map((value, index) => [value, index]));
  const priorityOrder = new Map(TASK_PRIORITIES.map((value, index) => [value, index]));
  return todos
    .slice()
    .sort((a, b) => {
      const statusDiff = (statusOrder.get(a.status) || 99) - (statusOrder.get(b.status) || 99);
      if (statusDiff) return statusDiff;
      const priorityDiff = (priorityOrder.get(b.priority) || 0) - (priorityOrder.get(a.priority) || 0);
      if (priorityDiff) return priorityDiff;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    })
    .map(todoForResponse);
}

function mandatoryNextTodo() {
  if (activeTasksRemaining() > 0) return null;
  const openTodos = filteredTodos({ status: "open" });
  return openTodos[0] || null;
}

function todoGate() {
  const activeTaskCount = activeTasksRemaining();
  const openTodos = readTodos().filter((todo) => todo.status === "open").length;
  return {
    active_task_count: activeTaskCount,
    open_todo_count: openTodos,
    required: activeTaskCount === 0 && openTodos > 0,
    mandatory_next_todo: mandatoryNextTodo(),
  };
}

function taskById(id) {
  return readTasks().find((task) => task.id === id);
}

function todoById(id) {
  return readTodos().find((todo) => todo.id === id);
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

function normalizeIp(value) {
  const ip = String(value || "").trim();
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) return ip.slice("::ffff:".length);
  if (ip === "::1") return "127.0.0.1";
  return ip;
}

function requestClientIp(req) {
  const realIp = normalizeIp(req.headers["x-real-ip"]);
  if (realIp) return realIp;
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0];
  const forwardedIp = normalizeIp(forwarded);
  if (forwardedIp) return forwardedIp;
  return normalizeIp(req.socket && req.socket.remoteAddress);
}

function verifyDeployRelayRequest(req) {
  const allowedIps = envList("AI_CHAT_DEPLOY_RELAY_ALLOW_IPS").map(normalizeIp);
  if (!allowedIps.length) return [false, "deploy relay is not configured"];
  const clientIp = requestClientIp(req);
  if (!allowedIps.includes(clientIp)) return [false, `deploy relay source is not allowed: ${clientIp || "unknown"}`];
  const token = String(process.env.AI_CHAT_DEPLOY_RELAY_TOKEN || "");
  if (token && !safeEqual(req.headers["x-io-games-relay-token"] || "", token)) {
    return [false, "invalid deploy relay token"];
  }
  return [true, "ok"];
}

function postDeployRelay(targetUrl, body, headers) {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const transport = target.protocol === "https:" ? https : http;
    const timeoutMs = Number(process.env.AI_CHAT_DEPLOY_RELAY_TIMEOUT_MS || "10000") || 10000;
    const requestHeaders = {
      "Content-Type": "application/json",
      "Content-Length": String(body.length),
      "X-GitHub-Event": String(headers["x-github-event"] || "push"),
      "X-GitHub-Delivery": String(headers["x-github-delivery"] || ""),
      "X-AI-Chat-Relay": "1",
      "X-IO-Games-Relay-Source": publicSiteBaseUrl(),
      "User-Agent": "ai-chat-deploy-relay",
    };
    const token = String(process.env.AI_CHAT_DEPLOY_RELAY_TOKEN || "");
    if (token) requestHeaders["X-IO-Games-Relay-Token"] = token;
    const req = transport.request({
      method: "POST",
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      headers: requestHeaders,
      timeout: 10000,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: raw.slice(0, 300) });
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.setTimeout(timeoutMs);
    req.on("timeout", () => req.destroy(new Error("deploy relay request timed out")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function relayDeployWebhook(body, headers, payload) {
  if (headers["x-ai-chat-relay"]) return;
  const targets = envList("AI_CHAT_DEPLOY_RELAY_URLS");
  if (!targets.length) return;
  const ref = String(payload.ref || "unknown");
  const head = payload.head_commit || {};
  const headId = String(head.id || "").slice(0, 12) || "unknown";
  await Promise.all(targets.map(async (target) => {
    try {
      const result = await postDeployRelay(target, body, headers);
      appendMessage("Deploy Webhook", `Relayed GitHub push \`${ref}\` at \`${headId}\` to \`${target}\` (${result.statusCode}).`);
    } catch (error) {
      appendMessage("Deploy Webhook", `Deploy relay failed for \`${target}\` on \`${ref}\` at \`${headId}\`: ${error.message}`);
    }
  }));
}

function runDeployFromWebhook(payload) {
  if (deployRunning) {
    deployQueuedPayload = payload;
    const queued = deployPayloadSummary(payload);
    writeDeployStatus({
      running: true,
      queued,
      note: "deploy queued behind currently running deploy",
    });
    appendMessage("Deploy Webhook", `Deploy webhook received for \`${queued.ref}\` at \`${queued.head_id}\`, queued behind the running deploy.`);
    return;
  }
  deployRunning = true;
  const summary = deployPayloadSummary(payload);
  const ref = summary.ref;
  const headId = summary.head_id;
  appendMessage("Deploy Webhook", `GitHub push received for \`${ref}\` at \`${headId}\`. Starting autodeploy.`);
  const script = deployScriptPath();
  const startedAt = nowIso();
  writeDeployStatus({
    running: true,
    queued: null,
    ok: null,
    ref,
    head_id: headId,
    head_message: summary.head_message,
    script,
    started_at: startedAt,
    finished_at: null,
    exit_code: null,
    signal: null,
    output_tail: "",
    error: null,
  });
  childProcess.execFile(script, {
    cwd: ROOT,
    env: {
      ...process.env,
      ITCH_GAMES_DEPLOY_DETACHED: "1",
    },
    timeout: 900000,
    maxBuffer: 4 * 1024 * 1024,
    encoding: "utf8",
  }, (error, stdout, stderr) => {
    const output = deployOutputTail(stdout, stderr);
    const exitCode = error ? (error.code === undefined ? "unknown" : error.code) : 0;
    writeDeployStatus({
      running: false,
      queued: deployQueuedPayload ? deployPayloadSummary(deployQueuedPayload) : null,
      ok: !error,
      ref,
      head_id: headId,
      script,
      started_at: startedAt,
      finished_at: nowIso(),
      exit_code: exitCode,
      signal: error?.signal || null,
      output_tail: output,
      error: error ? String(error.message || error).slice(0, 1000) : null,
    });
    if (!error) {
      appendMessage("Deploy Webhook", `Autodeploy completed for \`${ref}\`.\n${output}`);
    } else {
      appendMessage("Deploy Webhook", `Autodeploy failed for \`${ref}\` with exit ${exitCode}.\n${output}`);
    }
    deployRunning = false;
    const nextPayload = deployQueuedPayload;
    deployQueuedPayload = null;
    if (nextPayload) {
      setImmediate(() => runDeployFromWebhook(nextPayload));
    }
  });
}

function fileReport(...parts) {
  const target = path.join(ROOT, ...parts);
  const relativePath = path.relative(ROOT, target).split(path.sep).join("/");
  try {
    const stat = fs.statSync(target);
    return {
      path: relativePath,
      exists: true,
      file: stat.isFile(),
      directory: stat.isDirectory(),
      size: stat.size,
      mtime: stat.mtime.toISOString(),
    };
  } catch (error) {
    return {
      path: relativePath,
      exists: false,
      error: error.code || error.message,
    };
  }
}

function readTextFileSlice(parts, maxBytes) {
  const target = path.join(ROOT, ...parts);
  try {
    return fs.readFileSync(target, "utf8").slice(0, maxBytes || 12000);
  } catch (_) {
    return "";
  }
}

function expectedUnsoccerWeightLabel(distHtml) {
  const source = readTextFileSlice(["unsoccer", "client", "src", "main.ts"], 24000);
  const sourceMatch = source.match(/BUILD_WEIGHT_LABEL\s*=\s*["'`]([^"'`]+)["'`]/);
  if (sourceMatch) return sourceMatch[1];
  const htmlMatch = String(distHtml || "").match(/\b\d+(?:\.\d+)?\s*(?:MB|KiB|KB)\b/i);
  return htmlMatch ? htmlMatch[0] : "";
}

function unsoccerDistAssetReports(distHtml) {
  const matches = Array.from(distHtml.matchAll(/(?:src|href)="\.\/assets\/([^"]+)"/g))
    .map((match) => match[1])
    .filter(Boolean);
  return Array.from(new Set(matches)).map((assetName) => fileReport("unsoccer", "client", "dist", "assets", assetName));
}

function localHttpJson(port, requestPath, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const request = http.get({
      hostname: "127.0.0.1",
      port,
      path: requestPath,
      timeout: timeoutMs || 1500,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (_) {
          json = null;
        }
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          elapsed_ms: Date.now() - startedAt,
          json,
          body_sample: json ? undefined : body.slice(0, 400),
        });
      });
    });
    request.on("error", (error) => resolve({
      ok: false,
      elapsed_ms: Date.now() - startedAt,
      error: error.message,
    }));
    request.on("timeout", () => {
      request.destroy(new Error("timeout"));
    });
  });
}

function remoteHttpText(targetUrl, timeoutMs, maxBytes) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (error) {
      resolve({ ok: false, elapsed_ms: 0, error: error.message });
      return;
    }
    const transport = parsedUrl.protocol === "http:" ? http : https;
    const limit = maxBytes || 16000;
    const request = transport.get(parsedUrl, {
      timeout: timeoutMs || 2000,
      headers: { "User-Agent": "itch-games-deploy-health" },
    }, (response) => {
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        if (total < limit) chunks.push(chunk.subarray(0, limit - total));
        total += chunk.length;
      });
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          elapsed_ms: Date.now() - startedAt,
          truncated: total > limit,
          body,
        });
      });
    });
    request.on("error", (error) => resolve({
      ok: false,
      elapsed_ms: Date.now() - startedAt,
      error: error.message,
    }));
    request.on("timeout", () => {
      request.destroy(new Error("timeout"));
    });
  });
}

async function remoteHttpJson(targetUrl, timeoutMs) {
  const report = await remoteHttpText(targetUrl, timeoutMs || 2000, 4000);
  let json = null;
  try {
    json = report.body ? JSON.parse(report.body) : null;
  } catch (_) {
    json = null;
  }
  return {
    ok: report.ok && Boolean(json),
    status: report.status,
    elapsed_ms: report.elapsed_ms,
    json,
    body_sample: json ? undefined : String(report.body || "").slice(0, 400),
    error: report.error,
  };
}

function execFileReport(command, args, timeoutMs) {
  return new Promise((resolve) => {
    childProcess.execFile(command, args, {
      timeout: timeoutMs || 1500,
      encoding: "utf8",
      maxBuffer: 64 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && error.code !== undefined ? error.code : 0,
        signal: error && error.signal ? error.signal : "",
        stdout: String(stdout || "").trim().slice(-1000),
        stderr: String(stderr || "").trim().slice(-1000),
        error: error ? error.message : "",
      });
    });
  });
}

function sanitizeRelayTarget(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (_) {
    return "invalid-url";
  }
}

function deployRelayHealth() {
  const relayTargets = envList("AI_CHAT_DEPLOY_RELAY_URLS").map(sanitizeRelayTarget);
  const allowIps = envList("AI_CHAT_DEPLOY_RELAY_ALLOW_IPS").map(normalizeIp);
  const timeoutMs = Number(process.env.AI_CHAT_DEPLOY_RELAY_TIMEOUT_MS || "10000") || 10000;
  return {
    relay_route: "/api/deploy-relay",
    fanout_enabled: relayTargets.length > 0,
    fanout_target_count: relayTargets.length,
    fanout_targets: relayTargets,
    accept_enabled: allowIps.length > 0,
    accept_allowed_ip_count: allowIps.length,
    accept_allowed_ips: allowIps,
    relay_token_configured: Boolean(process.env.AI_CHAT_DEPLOY_RELAY_TOKEN || ""),
    timeout_ms: timeoutMs,
  };
}

function unsoccerChildStatus() {
  return {
    pid: unsoccerChild && unsoccerChild.pid ? unsoccerChild.pid : null,
    running: Boolean(unsoccerChild && unsoccerChild.exitCode === null && !unsoccerChild.killed),
    last_start: unsoccerLastStart,
    last_exit: unsoccerLastExit,
    output_tail: unsoccerOutputTail.slice(-24),
  };
}

function trackUnsoccerOutput(streamName, chunk) {
  const text = String(chunk || "");
  process[streamName === "stderr" ? "stderr" : "stdout"].write(`[unsoccer] ${text}`);
  for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    unsoccerOutputTail.push({ time: nowIso(), stream: streamName, line: line.slice(0, 500) });
  }
  if (unsoccerOutputTail.length > 40) unsoccerOutputTail = unsoccerOutputTail.slice(-40);
}

async function deployHealthSnapshot() {
  const publicBaseUrl = publicSiteBaseUrl();
  const distHtml = readTextFileSlice(["unsoccer", "client", "dist", "index.html"], 16000);
  const distAssets = unsoccerDistAssetReports(distHtml);
  const serverHealth = await localHttpJson(Number(process.env.UNSOCCER_PORT || 8787), "/api/health", 1800);
  const publicGameHtml = await remoteHttpText(`${publicBaseUrl}/unsoccer/`, 2500, 16000);
  const publicApiHealth = await remoteHttpJson(`${publicBaseUrl}/unsoccer/api/health`, 2500);
  const systemd = await execFileReport("systemctl", ["is-active", "itch-games-unsoccer-server.service"], 1800);
  const processList = await execFileReport("pgrep", ["-af", "unsoccer/server/dist/index.js"], 1800);
  const dependencyCheck = await execFileReport(process.execPath, [
    "--input-type=module",
    "-e",
    "await import('@dimforge/rapier3d-compat'); await import('@itch-games/unsoccer-shared'); console.log('unsoccer required dependencies ok')",
  ], 5000);
  const hasBuiltHtml = /(?:src|href)="\.\/assets\/[\w-]+\.(?:js|css)"/.test(distHtml);
  const hasJsAsset = distAssets.some((asset) => asset.exists && /\.js$/i.test(asset.path));
  const expectedVersion = projectVersion();
  const expectedWeightLabel = expectedUnsoccerWeightLabel(distHtml);
  const distHtmlVersionMatches = Boolean(expectedVersion && distHtml.includes(expectedVersion));
  const distHtmlWeightMatches = Boolean(expectedWeightLabel && distHtml.includes(expectedWeightLabel));
  const localApiVersion = String(serverHealth.json?.version || "");
  const localApiVersionMatches = Boolean(localApiVersion && localApiVersion === expectedVersion);
  const publicHtmlVersionMatches = Boolean(publicGameHtml.ok && expectedVersion && publicGameHtml.body.includes(expectedVersion));
  const publicHtmlWeightMatches = Boolean(publicGameHtml.ok && expectedWeightLabel && publicGameHtml.body.includes(expectedWeightLabel));
  const publicApiVersion = String(publicApiHealth.json?.version || "");
  const publicApiVersionMatches = Boolean(publicApiVersion && publicApiVersion === expectedVersion);
  const requiresSystemd = process.platform === "linux";
  return {
    ok: true,
    ready: Boolean(hasBuiltHtml && hasJsAsset && serverHealth.ok && distHtmlVersionMatches
      && distHtmlWeightMatches && localApiVersionMatches && publicHtmlVersionMatches && publicHtmlWeightMatches
      && publicApiVersionMatches),
    time: nowIso(),
    project_version: expectedVersion,
    expected_weight_label: expectedWeightLabel,
    git: gitContext(),
    deploy_running: deployRunning,
    deploy_queued: deployQueuedPayload ? deployPayloadSummary(deployQueuedPayload) : null,
    last_deploy: readDeployStatus(),
    deploy_script: deployScriptPath(),
    deploy_relay: deployRelayHealth(),
    urls: {
      public_game: `${publicBaseUrl}/unsoccer/`,
      public_api_health: `${publicBaseUrl}/unsoccer/api/health`,
      local_api_health: "http://127.0.0.1:8787/api/health",
    },
    unsoccer: {
      built_html_detected: hasBuiltHtml,
      dist_html_version_matches: distHtmlVersionMatches,
      dist_html_weight_matches: distHtmlWeightMatches,
      local_api_version_matches: localApiVersionMatches,
      public_html_version_matches: publicHtmlVersionMatches,
      public_html_weight_matches: publicHtmlWeightMatches,
      public_api_version_matches: publicApiVersionMatches,
      public_game_html: {
        ok: publicGameHtml.ok,
        status: publicGameHtml.status,
        elapsed_ms: publicGameHtml.elapsed_ms,
        truncated: publicGameHtml.truncated,
        body_sample: String(publicGameHtml.body || "").slice(0, 400),
        error: publicGameHtml.error,
      },
      files: {
        public_page: fileReport("unsoccer", "index.html"),
        client_dev_html: fileReport("unsoccer", "client", "index.html"),
        client_dist_html: fileReport("unsoccer", "client", "dist", "index.html"),
        server_entry: fileReport("unsoccer", "server", "dist", "index.js"),
      },
      dist_assets: distAssets,
      local_api_health: serverHealth,
      public_api_health: publicApiHealth,
      requires_systemd: requiresSystemd,
      systemd_service: systemd,
      process_list: processList,
      dependency_check: dependencyCheck,
      autostart_env: String(process.env.UNSOCCER_AUTOSTART || ""),
      autostart_child: unsoccerChildStatus(),
    },
  };
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

function headerParameter(value, name) {
  const pattern = new RegExp(`${name}="([^"]*)"|${name}=([^;\\s]+)`, "i");
  const match = String(value || "").match(pattern);
  return match ? (match[1] || match[2] || "") : "";
}

function multipartBoundary(contentType) {
  const boundary = headerParameter(contentType, "boundary");
  return boundary ? Buffer.from(`--${boundary}`) : null;
}

function trimPartBody(body) {
  if (body.length >= 2 && body[body.length - 2] === 13 && body[body.length - 1] === 10) {
    return body.subarray(0, body.length - 2);
  }
  return body;
}

function parseMultipartBody(buffer, contentType) {
  const boundary = multipartBoundary(contentType);
  if (!boundary) throw new Error("multipart boundary is required");
  const fields = {};
  const files = [];
  let cursor = buffer.indexOf(boundary);
  while (cursor >= 0) {
    let partStart = cursor + boundary.length;
    if (buffer[partStart] === 45 && buffer[partStart + 1] === 45) break;
    if (buffer[partStart] === 13 && buffer[partStart + 1] === 10) partStart += 2;
    const next = buffer.indexOf(boundary, partStart);
    if (next < 0) break;
    const rawPart = buffer.subarray(partStart, next);
    const headerEnd = rawPart.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd >= 0) {
      const headerText = rawPart.subarray(0, headerEnd).toString("utf8");
      const body = trimPartBody(rawPart.subarray(headerEnd + 4));
      const headers = {};
      for (const line of headerText.split(/\r?\n/)) {
        const split = line.indexOf(":");
        if (split > 0) headers[line.slice(0, split).trim().toLowerCase()] = line.slice(split + 1).trim();
      }
      const disposition = headers["content-disposition"] || "";
      const name = headerParameter(disposition, "name");
      const filename = headerParameter(disposition, "filename");
      if (name) {
        if (filename) {
          files.push({
            fieldName: name,
            filename,
            contentType: headers["content-type"] || "application/octet-stream",
            body,
          });
        } else {
          fields[name] = body.toString("utf8");
        }
      }
    }
    cursor = next;
  }
  return { fields, files };
}

function attachmentsFromUploadedFiles(req, files, source) {
  const selected = files.filter((file) => file.fieldName === "files" || file.fieldName === "file" || file.fieldName === "attachments").slice(0, MAX_MEDIA_ATTACHMENTS);
  const collectionId = selected.length > 1 ? `media_${Date.now().toString(36)}_${randomId().slice(0, 6)}` : "";
  return selected.map((file) => storeMediaBuffer(req, file, source || "web", collectionId));
}

async function parseMessageRequest(req) {
  const contentType = String(req.headers["content-type"] || "");
  if (contentType.toLowerCase().startsWith("multipart/form-data")) {
    const body = await readBody(req, MAX_MEDIA_UPLOAD_BYTES);
    const parsed = parseMultipartBody(body, contentType);
    return {
      payload: parsed.fields,
      attachments: attachmentsFromUploadedFiles(req, parsed.files, "web"),
    };
  }
  const body = await readBody(req, 32768);
  if (!body.length) throw new Error("invalid request size");
  const payload = JSON.parse(body.toString("utf8"));
  return { payload, attachments: sanitizeAttachments(payload.attachments) };
}

function sendMediaFile(req, res, requestPath) {
  const requested = decodeURIComponent(requestPath.replace(/^\/media\/+/, ""));
  const safePath = path.normalize(requested);
  if (!requested || safePath.startsWith("..") || path.isAbsolute(safePath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  const target = path.join(MEDIA_DIR, safePath);
  const relative = path.relative(MEDIA_DIR, target);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const stat = fs.statSync(target);
  const contentType = MIME_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream";
  const kind = mediaKind(contentType, target);
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400",
    "Content-Length": String(stat.size),
    "X-Content-Type-Options": "nosniff",
  };
  if (kind === "file") {
    headers["Content-Disposition"] = `attachment; filename="${path.basename(target).replace(/["\\]/g, "-")}"`;
  }
  res.writeHead(200, headers);
  fs.createReadStream(target).pipe(res);
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

function spawnUnsoccerServer(port) {
  const entry = path.join(ROOT, "unsoccer", "server", "dist", "index.js");
  if (!fs.existsSync(entry)) {
    console.warn(`unsoccer autostart skipped: missing ${entry}`);
    return;
  }
  unsoccerLastStart = { time: nowIso(), port, entry };
  unsoccerLastExit = null;
  unsoccerOutputTail = [];
  unsoccerChild = childProcess.spawn(process.execPath, [entry], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || "production",
      UNSOCCER_PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  unsoccerChild.stdout.on("data", (chunk) => trackUnsoccerOutput("stdout", chunk));
  unsoccerChild.stderr.on("data", (chunk) => trackUnsoccerOutput("stderr", chunk));
  unsoccerChild.on("exit", (code, signal) => {
    console.error(`unsoccer server exited code=${code} signal=${signal || ""}`);
    unsoccerLastExit = { time: nowIso(), code, signal: signal || "" };
    unsoccerChild = null;
    if (!shuttingDown) {
      const timer = setTimeout(startUnsoccerServer, 3000);
      timer.unref();
    }
  });
}

function startUnsoccerServer() {
  if (process.env.UNSOCCER_AUTOSTART === "0") return;
  if (unsoccerChild && unsoccerChild.exitCode === null && !unsoccerChild.killed) return;
  const port = Number(process.env.UNSOCCER_PORT || 8787);
  let settled = false;
  const spawnIfNeeded = () => {
    if (settled) return;
    settled = true;
    spawnUnsoccerServer(port);
  };
  const request = http.get({ hostname: "127.0.0.1", port, path: "/api/health", timeout: 1000 }, (response) => {
    response.resume();
    if (response.statusCode === 200) {
      settled = true;
      console.log(`unsoccer server already listening on 127.0.0.1:${port}`);
      return;
    }
    spawnIfNeeded();
  });
  request.on("error", spawnIfNeeded);
  request.on("timeout", () => {
    request.destroy();
    spawnIfNeeded();
  });
}

function installShutdownHandlers() {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      shuttingDown = true;
      if (unsoccerChild && unsoccerChild.exitCode === null && !unsoccerChild.killed) {
        unsoccerChild.kill(signal);
      }
      process.exit(0);
    });
  }
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
  if (pathname === "/api/deploy-health") {
    jsonResponse(res, 200, await deployHealthSnapshot());
    return;
  }
  if (pathname === "/api/tasks") {
    jsonResponse(res, 200, {
      ok: true,
      roles: TASK_ROLES,
      statuses: TASK_STATUSES,
      priorities: TASK_PRIORITIES,
      tasks: filteredTasks(parsed.query),
      todo_gate: todoGate(),
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
  if (pathname === "/api/todos") {
    jsonResponse(res, 200, {
      ok: true,
      statuses: TODO_STATUSES,
      priorities: TASK_PRIORITIES,
      todos: filteredTodos(parsed.query),
      gate: todoGate(),
    });
    return;
  }
  if (pathname.startsWith("/api/todos/")) {
    const id = decodeURIComponent(pathname.slice("/api/todos/".length).split("/")[0] || "");
    const todo = todoById(id);
    if (!todo) {
      errorJson(res, 404, "todo not found");
      return;
    }
    jsonResponse(res, 200, { ok: true, todo: todoForResponse(todo), gate: todoGate() });
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
      message_count: readAllMessages().length,
      message_archive_count: messageArchiveCount(),
      task_count: readTasks().length,
      todo_count: readTodos().length,
      todo_gate: todoGate(),
      telegram: { enabled: telegramConfig().enabled },
    });
    return;
  }
  if (pathname.startsWith("/media/")) {
    sendMediaFile(req, res, pathname);
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
    setImmediate(() => relayDeployWebhook(body, req.headers, payload));
    setImmediate(() => runDeployFromWebhook(payload));
    jsonResponse(res, 202, { ok: true, accepted: true, event, ref });
    return;
  }

  if (pathname === "/api/deploy-relay") {
    const body = await readBody(req, 262144);
    const [ok, reason] = verifyDeployRelayRequest(req);
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
    if (event && event !== "push") {
      jsonResponse(res, 200, { ok: true, ignored: true, event });
      return;
    }
    const ref = String(payload.ref || "");
    if (ref !== "refs/heads/main") {
      jsonResponse(res, 200, { ok: true, ignored: true, event: event || "relay", ref });
      return;
    }
    setImmediate(() => runDeployFromWebhook(payload));
    jsonResponse(res, 202, { ok: true, accepted: true, event: event || "relay", ref });
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
      jsonResponse(res, 200, { ok: true, accepted: await processTelegramUpdate(req, payload) });
    } catch (error) {
      errorJson(res, 500, `telegram update failed: ${error.message}`);
    }
    return;
  }

  if (pathname === "/api/media") {
    try {
      const contentType = String(req.headers["content-type"] || "");
      if (!contentType.toLowerCase().startsWith("multipart/form-data")) throw new Error("multipart/form-data is required");
      const body = await readBody(req, MAX_MEDIA_UPLOAD_BYTES);
      const parsed = parseMultipartBody(body, contentType);
      const attachments = attachmentsFromUploadedFiles(req, parsed.files, "web");
      jsonResponse(res, 201, { ok: true, attachments });
    } catch (error) {
      errorJson(res, 400, error.message);
    }
    return;
  }

  if (pathname === "/api/admin/archive-messages") {
    try {
      const payload = await readJsonPayload(req, 8192);
      const result = archiveMessages(payload);
      jsonResponse(res, 200, { ok: true, archive: result, message_count: readAllMessages().length, message_archive_count: messageArchiveCount() });
    } catch (error) {
      errorJson(res, 400, error.message);
    }
    return;
  }

  if (pathname === "/api/todos") {
    try {
      const payload = await readJsonPayload(req, 32768);
      const todo = createTodo(payload);
      const todos = readTodos();
      todos.push(todo);
      writeTodos(todos);
      appendTodoEvent("create", todo, todo.created_by_role, { title: todo.title });
      appendTodoMessage("Added future idea", todo, todo.created_by_role, todo.description ? `Description: ${todo.description}` : "");
      jsonResponse(res, 201, { ok: true, todo: todoForResponse(todo), gate: todoGate() });
    } catch (error) {
      errorJson(res, 400, error.message);
    }
    return;
  }

  if (pathname.startsWith("/api/todos/")) {
    const parts = pathname.split("/").filter(Boolean);
    const todoId = decodeURIComponent(parts[2] || "");
    const action = parts[3] || "";
    try {
      const payload = await readJsonPayload(req, 32768);
      const actorRole = cleanRole(payload.actor_role || payload.created_by_role || payload.role);
      if (!isProducerOrOrchestrator(actorRole)) throw new Error("only Producer or Orchestrator can change todos");
      if (action === "promote") {
        const activeCount = activeTasksRemaining();
        if (activeCount > 0) throw new Error(`cannot promote todo while ${activeCount} active task(s) remain`);
        let promotedTask = null;
        const todo = updateTodo(todoId, (current) => {
          if (current.status !== "open") throw new Error("only open todos can be promoted");
          const taskPayload = {
            created_by_role: actorRole,
            created_by: actorRole,
            role: payload.role || "Orchestrator",
            priority: payload.priority || current.priority,
            title: payload.title || current.title,
            description: [current.description, payload.description].filter(Boolean).join("\n\n"),
            scope: payload.scope || [],
            acceptance: payload.acceptance || current.acceptance,
            depends_on: payload.depends_on || [],
            validation_owner: payload.validation_owner || "",
          };
          promotedTask = createTask(taskPayload);
          promotedTask.source_todo_id = current.id;
          current.status = "promoted";
          current.promoted_task_id = promotedTask.id;
          pushTodoComment(current, actorRole, payload.note || `Promoted to task ${promotedTask.id}.`);
          return current;
        });
        const tasks = readTasks();
        tasks.push(promotedTask);
        writeTasks(tasks);
        appendTodoEvent("promote", todo, actorRole, { task_id: promotedTask.id });
        appendTaskEvent("create_from_todo", promotedTask, actorRole, { todo_id: todo.id });
        appendTodoMessage("Promoted future idea", todo, actorRole, `Created task \`${promotedTask.id}\` for ${promotedTask.role}.`);
        appendTaskMessage("Created task from Todo", promotedTask, actorRole, `Source Todo: ${todo.id}`);
        jsonResponse(res, 200, { ok: true, todo: todoForResponse(todo), task: taskForResponse(promotedTask), gate: todoGate() });
        return;
      }
      if (action === "status") {
        const nextStatus = cleanText(payload.status, 40);
        if (!TODO_STATUSES.includes(nextStatus)) throw new Error("valid todo status is required");
        const todo = updateTodo(todoId, (current) => {
          current.status = nextStatus;
          pushTodoComment(current, actorRole, payload.note || payload.comment || "");
          return current;
        });
        appendTodoEvent("status", todo, actorRole, { status: todo.status });
        appendTodoMessage("Updated future idea", todo, actorRole, `Status: ${todo.status}`);
        jsonResponse(res, 200, { ok: true, todo: todoForResponse(todo), gate: todoGate() });
        return;
      }
      if (action === "comment") {
        const todo = updateTodo(todoId, (current) => {
          pushTodoComment(current, actorRole, payload.comment || payload.note || payload.message);
          return current;
        });
        appendTodoEvent("comment", todo, actorRole, {});
        jsonResponse(res, 200, { ok: true, todo: todoForResponse(todo), gate: todoGate() });
        return;
      }
      throw new Error("unknown todo action");
    } catch (error) {
      const status = error.message === "todo not found" ? 404 : 400;
      errorJson(res, status, error.message);
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
  try {
    const parsed = await parseMessageRequest(req);
    const payload = parsed.payload || {};
    const record = appendMessage(payload.role || "Agent", payload.message || "", "web", true, parsed.attachments);
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
  installShutdownHandlers();
  startUnsoccerServer();
  const unsoccerWatchdog = setInterval(startUnsoccerServer, 15000);
  unsoccerWatchdog.unref();
  console.log(`telegram bridge ${telegramConfig().enabled ? "enabled" : "disabled"}`);
  http.createServer(handleRequest).listen(port, host, () => {
    console.log(`ai_chat node server listening on http://${host}:${port}`);
  });
}

main();
