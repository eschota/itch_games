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
const TELEGRAM_SEEN_FILE = path.join(DATA_DIR, "telegram_seen_updates.txt");
const MAX_MESSAGE_CHARS = 4000;
const MAX_ROLE_CHARS = 80;
let deployRunning = false;

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
  const record = {
    id: randomId(),
    created_at: nowIso(),
    role: cleanRole,
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
  const message = String(record.message || "");
  const version = String(record.project_version || "version unknown");
  const branch = String(record.branch || "branch unknown");
  const commit = String(record.commit || "commit unknown");
  const dirty = record.dirty ? " dirty" : "";
  let text = `${role}: ${message}\n\n${version} - ${branch} @ ${commit}${dirty}`;
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
  const senderName = telegramSenderName(message);
  const producerText = senderName
    ? `Продюсер: ${text}\n\nTelegram user: ${senderName}`
    : `Продюсер: ${text}`;
  appendMessage("Продюсер", producerText, "telegram", false);
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
  const script = process.env.AI_CHAT_DEPLOY_SCRIPT || "/usr/local/bin/itch-games-autodeploy.sh";
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
