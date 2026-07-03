#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..", "..");
const vkPlayProjectId = "48793";
const developerId = "9572";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function currentGameVersion() {
  const packageJson = readJson(path.join(projectRoot, "package.json"));
  return packageJson.games?.unsoccer?.version || packageJson.gameVersion;
}

function currentWeightLabel() {
  const source = fs.readFileSync(path.join(projectRoot, "unsoccer", "client", "src", "main.ts"), "utf8");
  const match = source.match(/const BUILD_WEIGHT_LABEL = "([^"]+)"/);
  if (!match) throw new Error("BUILD_WEIGHT_LABEL not found in unsoccer/client/src/main.ts");
  return match[1];
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readZipEntries(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP EOCD not found");
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error(`bad central directory signature at ${offset}`);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { buffer, entries };
}

function extractZipEntry(zip, name) {
  const entry = zip.entries.find((item) => item.name === name);
  if (!entry) throw new Error(`${name} not found in ZIP`);
  const offset = entry.localOffset;
  if (zip.buffer.readUInt32LE(offset) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
  const nameLength = zip.buffer.readUInt16LE(offset + 26);
  const extraLength = zip.buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const compressed = zip.buffer.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`unsupported ZIP method ${entry.method} for ${name}`);
}

function copyFile(source, destination) {
  fs.copyFileSync(source, destination);
  return { name: path.basename(destination), size: fs.statSync(destination).size, sha256: sha256(destination) };
}

const gameVersion = currentGameVersion();
if (!gameVersion) throw new Error("UnSoccer game version not found in package.json");
const weightLabel = currentWeightLabel();
const archiveSource = path.join(projectRoot, "dist", "unsoccer-itch.zip");
if (!fs.existsSync(archiveSource)) throw new Error("dist/unsoccer-itch.zip is missing; run python tools/package_itch.py unsoccer first");

const archive = readZipEntries(archiveSource);
const archiveNames = archive.entries.map((entry) => entry.name);
const indexHtml = extractZipEntry(archive, "index.html").toString("utf8");
const assetRefs = Array.from(indexHtml.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.(?:js|css))"/g)).map((match) => match[1]);
const missingAssets = assetRefs.filter((asset) => !archiveNames.includes(asset));
if (!indexHtml.includes(gameVersion)) throw new Error(`archive index.html does not contain ${gameVersion}`);
if (!indexHtml.includes(weightLabel)) throw new Error(`archive index.html does not contain ${weightLabel}`);
if (missingAssets.length) throw new Error(`archive is missing referenced assets: ${missingAssets.join(", ")}`);

const outputDir = path.join(projectRoot, "dist", `vkplay-upload-${developerId}-${gameVersion}`);
fs.mkdirSync(outputDir, { recursive: true });

const mediaDir = path.join(scriptDir, "unsoccer-yandex-games-assets");
const files = [
  copyFile(archiveSource, path.join(outputDir, `01-browser-build-${gameVersion}.zip`)),
  copyFile(path.join(mediaDir, "icon-512x512.png"), path.join(outputDir, "02-icon-512x512.png")),
  copyFile(path.join(mediaDir, "cover-800x470.png"), path.join(outputDir, "03-cover-800x470.png")),
  copyFile(path.join(mediaDir, "showcase-cover-1560x520.png"), path.join(outputDir, "04-wide-cover-1560x520.png")),
  copyFile(path.join(mediaDir, "screenshot-01-gameplay-1280x720.png"), path.join(outputDir, "05-screenshot-01-1280x720.png")),
  copyFile(path.join(mediaDir, "screenshot-02-gameplay-1280x720.png"), path.join(outputDir, "06-screenshot-02-1280x720.png")),
  copyFile(path.join(mediaDir, "gameplay-horizontal-1280x720.mp4"), path.join(outputDir, "07-gameplay-horizontal-1280x720.mp4")),
];

const readme = `VK Play Developers game ${vkPlayProjectId} upload staging pack for Ragdoll Soccer II ${gameVersion}.

Prepared VK Play fields:
- Name: Ragdoll Soccer II
- Game type: Browser
- IFrame link: https://moscow-io-games.mecharulez.com/unsoccer/?source=vkplay&version=${gameVersion}
- Supported OS: Android, Windows
- Basic Localization: Russian

Release gate:
- Follow ui_designer/public_pages/unsoccer-vkplay-release-gate.md.
- Do not save or increment the VK Play iframe URL until primary and Moscow live
  health both serve ${gameVersion}.
- Live check: node ai_chat/deploy/verify-moscow-relay.mjs --mode=report

Upload files:
1. Browser build archive: 01-browser-build-${gameVersion}.zip
2. Icon: 02-icon-512x512.png
3. Cover: 03-cover-800x470.png
4. Wide cover: 04-wide-cover-1560x520.png
5. Screenshots: 05-screenshot-01-1280x720.png and 06-screenshot-02-1280x720.png
6. Gameplay video: 07-gameplay-horizontal-1280x720.mp4

Update flow:
1. Build and package the new UnSoccer release.
2. Run: node ui_designer/public_pages/prepare-vkplay-upload-pack.mjs
3. Update the VK Play IFrame link version parameter and press Increment.
4. Upload changed media only if the store art changed.
`;
fs.writeFileSync(path.join(outputDir, "README.txt"), readme, "utf8");
files.push({ name: "README.txt", size: fs.statSync(path.join(outputDir, "README.txt")).size, sha256: sha256(path.join(outputDir, "README.txt")) });

const report = {
  ok: true,
  vkPlayProjectId,
  developerId,
  gameVersion,
  weightLabel,
  outputDir,
  archive: {
    entries: archiveNames.length,
    assetRefs,
  },
  files,
};

console.log(JSON.stringify(report, null, 2));
