#!/usr/bin/env node
import dns from "node:dns/promises";
import fs from "node:fs";
import https from "node:https";
import tls from "node:tls";

const PRIMARY_HEALTH_URL = "https://io-games.mecharulez.com/ai_chat/api/deploy-health";
const MOSCOW_HEALTH_URL = "https://moscow-io-games.mecharulez.com/ai_chat/api/deploy-health";
const MOSCOW_RELAY_URL = "https://moscow-io-games.mecharulez.com/ai_chat/api/deploy-relay";
const MOSCOW_GAME_URL = "https://moscow-io-games.mecharulez.com/unsoccer/";
const MOSCOW_API_HEALTH_URL = "https://moscow-io-games.mecharulez.com/unsoccer/api/health";
const MOSCOW_HOST = "moscow-io-games.mecharulez.com";
const MOSCOW_EXPECTED_IP = "5.42.121.207";
const PRIMARY_IP = "145.239.0.57";

function expectedRelease() {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const clientSource = fs.readFileSync("unsoccer/client/src/main.ts", "utf8");
  const weightMatch = clientSource.match(/BUILD_WEIGHT_LABEL\s*=\s*["'`]([^"'`]+)["'`]/);
  if (!pkg.games || !pkg.games.unsoccer || !pkg.games.unsoccer.version) {
    throw new Error("package.json missing games.unsoccer.version");
  }
  if (!weightMatch) throw new Error("BUILD_WEIGHT_LABEL not found in unsoccer/client/src/main.ts");
  return {
    version: pkg.games.unsoccer.version,
    weightLabel: weightMatch[1],
  };
}

const EXPECTED_RELEASE = expectedRelease();

const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
const mode = modeArg ? modeArg.slice("--mode=".length) : "report";
if (!["report", "live"].includes(mode)) {
  console.error("usage: node ai_chat/deploy/verify-moscow-relay.mjs [--mode=report|live]");
  process.exit(2);
}

function request(url, options = {}) {
  const method = options.method || "GET";
  const body = options.body ? Buffer.from(options.body) : null;
  const timeoutMs = options.timeoutMs || 8000;
  const headers = { "User-Agent": "itch-games-moscow-relay-verifier", ...(options.headers || {}) };
  if (body) headers["Content-Length"] = String(body.length);
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      timeout: timeoutMs,
      headers,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`${url} timed out`)));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getJson(url, timeoutMs = 8000) {
  const response = await request(url, { timeoutMs });
  try {
    return { ...response, json: JSON.parse(response.body) };
  } catch (error) {
    throw new Error(`${url} returned invalid JSON: ${error.message}`);
  }
}

function tlsCertificate(host, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      resolve({
        authorized: socket.authorized,
        authorizationError: socket.authorizationError || null,
        protocol: socket.getProtocol(),
        subjectCN: cert && cert.subject ? cert.subject.CN || null : null,
        issuerCN: cert && cert.issuer ? cert.issuer.CN || null : null,
        validTo: cert ? cert.valid_to || null : null,
      });
      socket.end();
    });
    socket.on("timeout", () => socket.destroy(new Error(`${host}:443 TLS timed out`)));
    socket.on("error", reject);
  });
}

function relaySummary(health) {
  const relay = health.deploy_relay || {};
  return {
    has_relay_block: Boolean(health.deploy_relay),
    fanout_enabled: relay.fanout_enabled === true,
    fanout_targets: Array.isArray(relay.fanout_targets) ? relay.fanout_targets : [],
    accept_enabled: relay.accept_enabled === true,
    accept_allowed_ips: Array.isArray(relay.accept_allowed_ips) ? relay.accept_allowed_ips : [],
    relay_token_configured: relay.relay_token_configured === true,
    timeout_ms: relay.timeout_ms || null,
  };
}

function hostSummary(report) {
  const health = report.json || {};
  return {
    status: report.status,
    ready: health.ready === true,
    version: health.project_version || null,
    commit: health.git && health.git.commit ? health.git.commit : null,
    dirty: Boolean(health.git && health.git.dirty),
    relay: relaySummary(health),
  };
}

function check(name, ok, details = "") {
  return { name, ok: Boolean(ok), details };
}

const [primaryReport, moscowReport, moscowGameReport, moscowApiReport, relayProbeReport, moscowDns, moscowTls] = await Promise.all([
  getJson(PRIMARY_HEALTH_URL),
  getJson(MOSCOW_HEALTH_URL),
  request(MOSCOW_GAME_URL),
  getJson(MOSCOW_API_HEALTH_URL),
  request(MOSCOW_RELAY_URL, {
    method: "POST",
    body: JSON.stringify({ ref: "refs/heads/main" }),
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": "ping",
    },
  }),
  dns.resolve4(MOSCOW_HOST),
  tlsCertificate(MOSCOW_HOST),
]);

const primary = hostSummary(primaryReport);
const moscow = hostSummary(moscowReport);
const moscowPublicGame = {
  status: moscowGameReport.status,
  contains_version: Boolean(moscow.version && moscowGameReport.body.includes(moscow.version)),
  contains_weight: moscowGameReport.body.includes(EXPECTED_RELEASE.weightLabel),
};
const moscowPublicApi = {
  status: moscowApiReport.status,
  ok: moscowApiReport.json && moscowApiReport.json.ok === true,
  version: moscowApiReport.json ? moscowApiReport.json.version || null : null,
};
const moscowRelayProbe = {
  status: relayProbeReport.status,
  route_exists: [200, 202, 400, 403].includes(relayProbeReport.status),
};
const checks = [
  check("moscow DNS resolves to expected IP", moscowDns.includes(MOSCOW_EXPECTED_IP), moscowDns.join(", ")),
  check("moscow TLS certificate is valid", moscowTls.authorized === true, `${moscowTls.subjectCN || "unknown"} / ${moscowTls.authorizationError || "authorized"}`),
  check("moscow TLS certificate matches host", moscowTls.subjectCN === MOSCOW_HOST, moscowTls.subjectCN || ""),
  check("moscow public game reachable", moscowPublicGame.status === 200, MOSCOW_GAME_URL),
  check("moscow public game shows version", moscowPublicGame.contains_version, moscow.version || ""),
  check("moscow public game shows current weight", moscowPublicGame.contains_weight, EXPECTED_RELEASE.weightLabel),
  check("moscow public API health ready", moscowPublicApi.status === 200 && moscowPublicApi.ok, MOSCOW_API_HEALTH_URL),
  check("moscow public API version matches", moscow.version && moscowPublicApi.version === moscow.version, `${moscowPublicApi.version} / ${moscow.version}`),
  check("primary deploy-health ready", primary.ready, PRIMARY_HEALTH_URL),
  check("moscow deploy-health ready", moscow.ready, MOSCOW_HEALTH_URL),
  check("primary version is current", primary.version === EXPECTED_RELEASE.version, `${primary.version} / ${EXPECTED_RELEASE.version}`),
  check("moscow version is current", moscow.version === EXPECTED_RELEASE.version, `${moscow.version} / ${EXPECTED_RELEASE.version}`),
  check("versions match", primary.version && primary.version === moscow.version, `${primary.version} / ${moscow.version}`),
  check("commits match", primary.commit && primary.commit === moscow.commit, `${primary.commit} / ${moscow.commit}`),
  check("moscow deploy-relay route exists", moscowRelayProbe.route_exists, `status ${moscowRelayProbe.status}`),
  check("primary exposes deploy_relay", primary.relay.has_relay_block),
  check("moscow exposes deploy_relay", moscow.relay.has_relay_block),
  check("primary relay fanout enabled", primary.relay.fanout_enabled),
  check("primary relay targets Moscow", primary.relay.fanout_targets.includes(MOSCOW_RELAY_URL), primary.relay.fanout_targets.join(", ")),
  check("moscow relay accept enabled", moscow.relay.accept_enabled),
  check("moscow relay allows primary IP", moscow.relay.accept_allowed_ips.includes(PRIMARY_IP), moscow.relay.accept_allowed_ips.join(", ")),
];

const ok = checks.every((item) => item.ok);
const output = {
  ok,
  mode,
  expected: EXPECTED_RELEASE,
  primary,
  moscow,
  moscow_public: {
    dns: moscowDns,
    tls: moscowTls,
    game: moscowPublicGame,
    api: moscowPublicApi,
    relay_probe: moscowRelayProbe,
  },
  checks,
};

console.log(JSON.stringify(output, null, 2));

if (mode === "live" && !ok) process.exit(1);
