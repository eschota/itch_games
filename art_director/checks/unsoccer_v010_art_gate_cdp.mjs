import fs from "node:fs/promises";

const targetUrl = process.argv[2] || "http://127.0.0.1:5181/?server=http://127.0.0.1:8793&qaTime=30";
const outputDir = process.argv[3] || "R:/itch_games/art_director/checks/v010-final-art-gate";
const debugPort = Number(process.argv[4] || 9235);
const label = String(process.argv[5] || "desktop").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
const width = Number(process.argv[6] || 1366);
const height = Number(process.argv[7] || 768);
const mobile = process.argv[8] === "mobile";

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return await response.json();
}

async function waitForEndpoint(url, timeoutMs = 8000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      return await getJson(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 160));
    }
  }
  throw lastError || new Error(`timeout waiting for ${url}`);
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const events = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result || {});
      return;
    }
    if (message.method) events.push(message);
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        events,
        send(method, params = {}) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((resolveSend, rejectSend) => pending.set(id, { resolve: resolveSend, reject: rejectSend }));
        },
        close() {
          socket.close();
        }
      });
    }, { once: true });
    socket.addEventListener("error", () => reject(new Error(`failed to connect ${wsUrl}`)), { once: true });
  });
}

await fs.mkdir(outputDir, { recursive: true });
const tabs = await waitForEndpoint(`http://127.0.0.1:${debugPort}/json`);
const tab = tabs.find((item) => item.type === "page") || tabs[0];
if (!tab?.webSocketDebuggerUrl) throw new Error("no CDP page websocket found");

const client = await connect(tab.webSocketDebuggerUrl);
await client.send("Page.enable");
await client.send("Runtime.enable");
await client.send("Log.enable");
await client.send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile,
  screenWidth: width,
  screenHeight: height
});
await client.send("Page.navigate", { url: targetUrl });
await new Promise((resolve) => setTimeout(resolve, 5200));

const expression = `(() => {
  const root = document.documentElement;
  const canvas = document.querySelector("canvas");
  const rectOf = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      visible: !!(rect.width && rect.height) && getComputedStyle(element).display !== "none"
    };
  };
  const artDataset = Object.fromEntries(
    Object.entries(root.dataset).filter(([key]) =>
      /(game|weight|art|environment|player|animated|sun|moon|day|light|ambient|courtyard|transport|interpolation|audioServer)/i.test(key)
    )
  );
  return {
    title: document.title,
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    badge: document.querySelector("#version-badge")?.textContent || "",
    canvas: canvas ? {
      width: canvas.width,
      height: canvas.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight
    } : null,
    artDataset,
    hudRects: {
      playerChip: rectOf("#player-chip"),
      score: rectOf(".score"),
      network: rectOf("#network-panel"),
      status: rectOf("#status"),
      weather: rectOf("#weather"),
      roster: rectOf("#roster"),
      events: rectOf("#event-feed"),
      hints: rectOf("#control-hints"),
      toolbar: rectOf("#toolbar"),
      version: rectOf("#version-badge")
    },
    debug: window.unsoccerDebug?.snapshot?.()
  };
})()`;

const evaluation = await client.send("Runtime.evaluate", {
  expression,
  returnByValue: true,
  awaitPromise: true
});
const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
const logEvents = client.events.filter((event) =>
  event.method === "Runtime.exceptionThrown" ||
  event.method === "Log.entryAdded" ||
  event.method === "Runtime.consoleAPICalled"
);
client.close();

const stamp = `2026-07-01-unsoccer-v0.0.010-art-gate-${label}`;
const pngPath = `${outputDir}/${stamp}.png`;
const jsonPath = `${outputDir}/${stamp}.json`;
const value = evaluation.result?.value;
const checks = {
  version010: value?.artDataset?.gameVersion === "v0.0.010",
  badge010: value?.badge === "v0.0.010 / 0.61 MB",
  sunFramed: value?.artDataset?.sunFramed === "true",
  moonFramed: value?.artDataset?.moonFramed === "true",
  dayCycle120: value?.artDataset?.dayCycleLengthSeconds === "120",
  environment010: value?.artDataset?.environment === "residential-courtyard-v010",
  rig: value?.artDataset?.playerRig === "procedural-animated-footballer",
  consoleClean: logEvents.length === 0
};

await fs.writeFile(pngPath, Buffer.from(screenshot.data, "base64"));
await fs.writeFile(jsonPath, JSON.stringify({
  ok: true,
  label,
  targetUrl,
  width,
  height,
  mobile,
  checks,
  result: value,
  logEvents,
  screenshot: pngPath
}, null, 2));

console.log(JSON.stringify({ ok: true, jsonPath, pngPath, checks, result: value, logEvents }, null, 2));
