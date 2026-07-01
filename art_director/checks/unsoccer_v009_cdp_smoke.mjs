import fs from "node:fs/promises";

const targetUrl = process.argv[2] || "http://127.0.0.1:5189/?name=ArtSmoke&qaTime=18";
const outputDir = process.argv[3] || "R:/itch_games/art_director/checks";
const debugPort = Number(process.argv[4] || 9233);

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
await client.send("Page.navigate", { url: targetUrl });
await new Promise((resolve) => setTimeout(resolve, 4500));

const expression = `(() => {
  const root = document.documentElement;
  const canvas = document.querySelector("canvas");
  const debug = window.unsoccerDebug?.snapshot?.();
  return {
    title: document.title,
    url: location.href,
    badge: document.querySelector("#version-badge")?.textContent || "",
    canvas: canvas ? {
      width: canvas.width,
      height: canvas.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight
    } : null,
    dataset: {
      gameVersion: root.dataset.gameVersion,
      gameWeightLabel: root.dataset.gameWeightLabel,
      artPass: root.dataset.artPass,
      environment: root.dataset.environment,
      environmentModels: root.dataset.environmentModels,
      playerRig: root.dataset.playerRig,
      animatedPlayers: root.dataset.animatedPlayers,
      sunVisible: root.dataset.sunVisible,
      moonVisible: root.dataset.moonVisible,
      dayCycleSeconds: root.dataset.dayCycleSeconds,
      dayCycleLengthSeconds: root.dataset.dayCycleLengthSeconds,
      daylight: root.dataset.daylight,
      ambientFill: root.dataset.ambientFill,
      courtyardBounce: root.dataset.courtyardBounce,
      transport: root.dataset.transport,
      interpolationBuffer: root.dataset.interpolationBuffer,
      audioServerPrimed: root.dataset.audioServerPrimed
    },
    debug
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

const timestamp = "2026-07-01-unsoccer-v0.0.009-art-smoke";
const pngPath = `${outputDir}/${timestamp}.png`;
const jsonPath = `${outputDir}/${timestamp}.json`;
await fs.writeFile(pngPath, Buffer.from(screenshot.data, "base64"));
await fs.writeFile(jsonPath, JSON.stringify({
  ok: true,
  targetUrl,
  result: evaluation.result?.value,
  logEvents,
  screenshot: pngPath
}, null, 2));

console.log(JSON.stringify({ ok: true, jsonPath, pngPath, result: evaluation.result?.value, logEvents }, null, 2));
