#!/usr/bin/env node
import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..", "..");

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function currentGameVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    return packageJson.games?.unsoccer?.version || packageJson.gameVersion || "v0.0.053";
  } catch (_) {
    return "v0.0.053";
  }
}

function currentWeightLabel() {
  try {
    const source = fs.readFileSync(path.join(projectRoot, "unsoccer", "client", "src", "main.ts"), "utf8");
    const match = source.match(/const BUILD_WEIGHT_LABEL = "([^"]+)"/);
    return match ? match[1] : "40.05 MB";
  } catch (_) {
    return "40.05 MB";
  }
}

const mode = argValue("--mode", "report");
if (!["report", "live"].includes(mode)) {
  console.error("usage: node ui_designer/public_pages/verify-yandex-upload-pack.mjs [--mode=report|live] [--game-version=v0.0.053] [--weight-label=\"40.05 MB\"] [--entry-count=105] [--pack=PATH] [--ffprobe=PATH]");
  process.exit(2);
}

const gameVersion = argValue("--game-version", currentGameVersion());
const weightLabel = argValue("--weight-label", currentWeightLabel());
const expectedEntryCounts = {
  "v0.0.033": 140,
  "v0.0.052": 105,
  "v0.0.053": 105,
};
const expectedEntryCount = Number(argValue("--entry-count", String(expectedEntryCounts[gameVersion] || 0)));
const defaultPackDir = path.resolve(projectRoot, "dist", `yandex-upload-547090-${gameVersion}`);
const packDir = path.resolve(argValue("--pack", defaultPackDir));
const ffprobePath = argValue("--ffprobe", fs.existsSync("C:/API/ffmpeg/bin/ffprobe.exe")
  ? "C:/API/ffmpeg/bin/ffprobe.exe"
  : "ffprobe");

const expectedFiles = {
  archive: `01-unsoccer-archive-${gameVersion}.zip`,
  icon: "02-icon-512x512.png",
  maskableIcon: "03-maskable-icon-512x512.png",
  cover: "04-cover-800x470.png",
  showcaseCover: "05-showcase-cover-1560x520.png",
  horizontalVideo: "06-gameplay-horizontal-1280x720.mp4",
  gifPreview: "07-gameplay-preview-480x270.gif",
  screenshot1: "08-screenshot-01-gameplay-1280x720.png",
  screenshot2: "09-screenshot-02-gameplay-1280x720.png",
  readme: "README.txt",
};

const expectedSha256ByVersion = {
  "v0.0.033": {
    "01-unsoccer-archive-v0.0.033.zip": "4b2fee2e451583afe0a6c871e25828530b235510f816f3db6f1ace22dcd9d331",
    "02-icon-512x512.png": "0eb80588edd9f799877028ec3a983f06ce16b3c428ebc3fead85a90263353fc7",
    "03-maskable-icon-512x512.png": "6877c8eb50f4e958f144aede7c070958f33b3d2b576053946ef14f7ad40ad21a",
    "04-cover-800x470.png": "4aabb927e521b12a2249ea8b365519e641389bd10e66fb5f80bada38aaea47ab",
    "05-showcase-cover-1560x520.png": "4e7aded895f004dbf6a490b89c810cf7449677fb85397db0309dfbd8d02c40d1",
    "06-gameplay-horizontal-1280x720.mp4": "e670e754502d5f2c9077172091a33144d3a14beb41918d995794d5cbce4eb1f5",
    "07-gameplay-preview-480x270.gif": "ea8095495471c2e3a7dada7b38ad03534a56234501473d54422475dfb1d31c8d",
    "08-screenshot-01-gameplay-1280x720.png": "b964328404359685bd9a0f5dace6aaad697c6b1aef70b2524cdee60f6460f876",
    "09-screenshot-02-gameplay-1280x720.png": "8c1c04f50db2190c688fd6ebbdd02c400574e40cdd94ec9cc16b9c79aa12dc1a",
    "README.txt": "c5a5cb2f08e5bb8325fec2f87dd996fd4f670ee710b72cc7fac346ee0ed079ba",
  },
  "v0.0.052": {
    "01-unsoccer-archive-v0.0.052.zip": "9217b6426c8375b056e3ad85aab7004c96418638d825eb78380d276f5973e55f",
    "02-icon-512x512.png": "0eb80588edd9f799877028ec3a983f06ce16b3c428ebc3fead85a90263353fc7",
    "03-maskable-icon-512x512.png": "6877c8eb50f4e958f144aede7c070958f33b3d2b576053946ef14f7ad40ad21a",
    "04-cover-800x470.png": "4aabb927e521b12a2249ea8b365519e641389bd10e66fb5f80bada38aaea47ab",
    "05-showcase-cover-1560x520.png": "4e7aded895f004dbf6a490b89c810cf7449677fb85397db0309dfbd8d02c40d1",
    "06-gameplay-horizontal-1280x720.mp4": "e670e754502d5f2c9077172091a33144d3a14beb41918d995794d5cbce4eb1f5",
    "07-gameplay-preview-480x270.gif": "ea8095495471c2e3a7dada7b38ad03534a56234501473d54422475dfb1d31c8d",
    "08-screenshot-01-gameplay-1280x720.png": "b964328404359685bd9a0f5dace6aaad697c6b1aef70b2524cdee60f6460f876",
    "09-screenshot-02-gameplay-1280x720.png": "8c1c04f50db2190c688fd6ebbdd02c400574e40cdd94ec9cc16b9c79aa12dc1a",
    "README.txt": "e12b9213d786dc05839f2ccfb863df704b5b9115268a2c4e0df5fcc30607f952",
  },
  "v0.0.053": {
    "01-unsoccer-archive-v0.0.053.zip": "af037e1587fd9f7c6264a73a50308ec0282909f76afde256f8f0d066f7f0834e",
    "02-icon-512x512.png": "0eb80588edd9f799877028ec3a983f06ce16b3c428ebc3fead85a90263353fc7",
    "03-maskable-icon-512x512.png": "6877c8eb50f4e958f144aede7c070958f33b3d2b576053946ef14f7ad40ad21a",
    "04-cover-800x470.png": "4aabb927e521b12a2249ea8b365519e641389bd10e66fb5f80bada38aaea47ab",
    "05-showcase-cover-1560x520.png": "4e7aded895f004dbf6a490b89c810cf7449677fb85397db0309dfbd8d02c40d1",
    "06-gameplay-horizontal-1280x720.mp4": "e670e754502d5f2c9077172091a33144d3a14beb41918d995794d5cbce4eb1f5",
    "07-gameplay-preview-480x270.gif": "ea8095495471c2e3a7dada7b38ad03534a56234501473d54422475dfb1d31c8d",
    "08-screenshot-01-gameplay-1280x720.png": "b964328404359685bd9a0f5dace6aaad697c6b1aef70b2524cdee60f6460f876",
    "09-screenshot-02-gameplay-1280x720.png": "8c1c04f50db2190c688fd6ebbdd02c400574e40cdd94ec9cc16b9c79aa12dc1a",
    "README.txt": "9aa1b16df57b1f63991f9acc136dcd893db8f34885a25aaeacd85121ae00c871",
  },
};
const expectedSha256 = expectedSha256ByVersion[gameVersion] || {};

function check(name, ok, details = "") {
  return { name, ok: Boolean(ok), details };
}

function fileInfo(name) {
  const fullPath = path.join(packDir, name);
  if (!fs.existsSync(fullPath)) return { name, path: fullPath, exists: false, size: 0 };
  const stat = fs.statSync(fullPath);
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex");
  return { name, path: fullPath, exists: true, size: stat.size, sha256 };
}

function parsePngDimensions(filePath) {
  const header = fs.readFileSync(filePath, { start: 0, end: 32 });
  const signature = header.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error(`${filePath} is not a PNG`);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

function parseGifDimensions(filePath) {
  const header = fs.readFileSync(filePath, { start: 0, end: 16 });
  const signature = header.subarray(0, 6).toString("ascii");
  if (!["GIF87a", "GIF89a"].includes(signature)) throw new Error(`${filePath} is not a GIF`);
  return { width: header.readUInt16LE(6), height: header.readUInt16LE(8) };
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
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
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

function ffprobe(filePath) {
  const result = childProcess.spawnSync(ffprobePath, [
    "-v", "error",
    "-count_frames",
    "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,width,height,r_frame_rate,avg_frame_rate,duration,bit_rate,pix_fmt,nb_read_frames",
    "-show_entries", "format=duration,size,bit_rate,format_name",
    "-of", "json",
    filePath,
  ], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `ffprobe exited ${result.status}`);
  return JSON.parse(result.stdout);
}

function expectDimensions(label, name, width, height, checks, dimensions) {
  const info = fileInfo(name);
  if (!info.exists) {
    checks.push(check(`${label} exists`, false, name));
    return;
  }
  const dim = name.toLowerCase().endsWith(".gif") ? parseGifDimensions(info.path) : parsePngDimensions(info.path);
  dimensions[label] = { file: name, width: dim.width, height: dim.height, size: info.size };
  checks.push(check(`${label} dimensions`, dim.width === width && dim.height === height, `${dim.width}x${dim.height}, expected ${width}x${height}`));
}

const checks = [];
const files = Object.fromEntries(Object.entries(expectedFiles).map(([key, name]) => [key, fileInfo(name)]));
for (const [key, info] of Object.entries(files)) {
  checks.push(check(`${key} exists`, info.exists, info.name));
  if (info.exists && expectedSha256[info.name]) {
    checks.push(check(`${key} sha256`, info.sha256 === expectedSha256[info.name], info.sha256));
  }
}

const archive = files.archive.exists ? readZipEntries(files.archive.path) : { entries: [], buffer: Buffer.alloc(0) };
const archiveNames = archive.entries.map((entry) => entry.name);
checks.push(check("archive has root index.html", archiveNames.includes("index.html")));
checks.push(check(
  "archive entry count",
  expectedEntryCount > 0 ? archiveNames.length === expectedEntryCount : archiveNames.length > 0,
  expectedEntryCount > 0 ? `${archiveNames.length}, expected ${expectedEntryCount}` : `${archiveNames.length}, no pinned expected count`,
));
checks.push(check("archive size under 100 MB", files.archive.size > 0 && files.archive.size < 100 * 1024 * 1024, String(files.archive.size)));

const internalPattern = /(^|\/)(\.git|ai_chat|ui_designer|art_director|game_designer|programmer|tester|sound_designer|orchestrator|skill\.xml|.*\.skill\.md|checks|deploy)(\/|$)/i;
const internalEntries = archiveNames.filter((name) => internalPattern.test(name));
checks.push(check("archive excludes internal docs/skills/deploy files", internalEntries.length === 0, internalEntries.slice(0, 8).join(", ")));

let indexHtml = "";
if (archiveNames.includes("index.html")) {
  indexHtml = extractZipEntry(archive, "index.html").toString("utf8");
}
checks.push(check(`archive index contains ${gameVersion}`, indexHtml.includes(gameVersion)));
checks.push(check(`archive index contains ${weightLabel} label`, indexHtml.includes(weightLabel)));
const assetRefs = Array.from(indexHtml.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.(?:js|css))"/g)).map((match) => match[1]);
const missingAssets = assetRefs.filter((asset) => !archiveNames.includes(asset));
checks.push(check("archive asset refs exist", assetRefs.length >= 2 && missingAssets.length === 0, missingAssets.join(", ")));

const dimensions = {};
expectDimensions("icon", expectedFiles.icon, 512, 512, checks, dimensions);
expectDimensions("maskableIcon", expectedFiles.maskableIcon, 512, 512, checks, dimensions);
expectDimensions("cover", expectedFiles.cover, 800, 470, checks, dimensions);
expectDimensions("showcaseCover", expectedFiles.showcaseCover, 1560, 520, checks, dimensions);
expectDimensions("gifPreview", expectedFiles.gifPreview, 480, 270, checks, dimensions);
expectDimensions("screenshot1", expectedFiles.screenshot1, 1280, 720, checks, dimensions);
expectDimensions("screenshot2", expectedFiles.screenshot2, 1280, 720, checks, dimensions);
checks.push(check("gif preview under 600 KB", files.gifPreview.exists && files.gifPreview.size <= 600 * 1024, String(files.gifPreview.size)));

const videoProbe = files.horizontalVideo.exists ? ffprobe(files.horizontalVideo.path) : null;
const videoStream = videoProbe && videoProbe.streams ? videoProbe.streams[0] : null;
const videoFormat = videoProbe ? videoProbe.format : null;
checks.push(check("horizontal MP4 dimensions", videoStream && videoStream.width === 1280 && videoStream.height === 720, videoStream ? `${videoStream.width}x${videoStream.height}` : "missing"));
checks.push(check("horizontal MP4 codec h264", videoStream && videoStream.codec_name === "h264", videoStream ? videoStream.codec_name : "missing"));
checks.push(check("horizontal MP4 pix_fmt yuv420p", videoStream && videoStream.pix_fmt === "yuv420p", videoStream ? videoStream.pix_fmt : "missing"));
checks.push(check("horizontal MP4 duration 3-30s", videoFormat && Number(videoFormat.duration) >= 3 && Number(videoFormat.duration) <= 30, videoFormat ? videoFormat.duration : "missing"));
checks.push(check("horizontal MP4 under 20 MB", files.horizontalVideo.exists && files.horizontalVideo.size < 20 * 1024 * 1024, String(files.horizontalVideo.size)));

const ok = checks.every((item) => item.ok);
const report = {
  ok,
  mode,
  gameVersion,
  weightLabel,
  expectedEntryCount,
  packDir,
  ffprobePath,
  files: Object.fromEntries(Object.entries(files).map(([key, info]) => [key, {
    name: info.name,
    exists: info.exists,
    size: info.size,
    sha256: info.sha256 || null,
  }])),
  archive: {
    entries: archiveNames.length,
    assetRefs,
  },
  dimensions,
  video: videoStream ? {
    file: expectedFiles.horizontalVideo,
    width: videoStream.width,
    height: videoStream.height,
    codec: videoStream.codec_name,
    pix_fmt: videoStream.pix_fmt,
    duration: videoFormat ? videoFormat.duration : null,
    size: files.horizontalVideo.size,
  } : null,
  checks,
};

console.log(JSON.stringify(report, null, 2));
if (mode === "live" && !ok) process.exit(1);
