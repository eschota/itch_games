#!/usr/bin/env bash
set -euo pipefail
trap 'echo "autodeploy failed at line ${LINENO}" >&2' ERR

stage() {
  echo "== $1 =="
}

cd /home/generic/itch_games
if [ "${ITCH_GAMES_DEPLOY_DETACHED:-0}" != "1" ]; then
  log="/tmp/itch-games-autodeploy-$(date -u +%Y%m%dT%H%M%SZ).log"
  nohup env ITCH_GAMES_DEPLOY_DETACHED=1 "$0" >"$log" 2>&1 &
  echo "detached autodeploy started; log=${log}"
  exit 0
fi
exec 9>/tmp/itch-games-autodeploy.lock
if ! flock -n 9; then
  echo "another detached autodeploy is already running"
  exit 0
fi
stage "git update"
git fetch origin main
git checkout main
git pull --ff-only origin main
git rev-parse --short HEAD
git status --short
previous_head="$(git rev-parse HEAD@{1} 2>/dev/null || true)"
source_changed_without_dist=0
if [ -n "$previous_head" ]; then
  changed_files="$(git diff --name-only "$previous_head" HEAD -- package.json package-lock.json tools/unsoccer_acceptance.mjs unsoccer/client unsoccer/server unsoccer/shared || true)"
  non_dist_changed="$(printf '%s\n' "$changed_files" | grep -E '^(package-lock\.json|package\.json|tools/unsoccer_acceptance\.mjs|unsoccer/(client|server|shared)/)' | grep -Ev '^unsoccer/(client|server|shared)/dist/' || true)"
  dist_changed="$(printf '%s\n' "$changed_files" | grep -E '^unsoccer/(client|server|shared)/dist/' || true)"
  if [ -n "$non_dist_changed" ] && [ -z "$dist_changed" ]; then
    source_changed_without_dist=1
    echo "UnSoccer source changed without committed dist; forcing server build"
  fi
fi
stage "node and npm"
echo "node: $(node -v)"
echo "npm: $(npm -v)"
expected_version="$(node -p "require('./package.json').games.unsoccer.version")"
expected_weight="$(node <<'NODE'
const fs = require("node:fs");
const source = fs.readFileSync("unsoccer/client/src/main.ts", "utf8");
const match = source.match(/BUILD_WEIGHT_LABEL\s*=\s*["'`]([^"'`]+)["'`]/);
if (!match) throw new Error("BUILD_WEIGHT_LABEL not found in unsoccer/client/src/main.ts");
console.log(match[1]);
NODE
)"
echo "unsoccer expected version: ${expected_version}"
echo "unsoccer expected weight: ${expected_weight}"

restart_unsoccer() {
  stage "$1"
  sudo -n systemctl enable itch-games-unsoccer-server.service
  sudo -n systemctl stop itch-games-unsoccer-server.service || true
  sudo -n pkill -f '/home/generic/itch_games/unsoccer/server/dist/index.js' || true
  sudo -n systemctl start itch-games-unsoccer-server.service
  sleep 2
  api_health="$(curl -fsS http://127.0.0.1:8787/api/health || true)"
  if ! grep -q "\"version\":\"${expected_version}\"" <<< "$api_health"; then
    sudo -n systemctl restart itch-games-unsoccer-server.service
    sleep 3
    api_health="$(curl -fsS http://127.0.0.1:8787/api/health)"
  fi
  printf '%s\n' "$api_health"
  grep -q "\"version\":\"${expected_version}\"" <<< "$api_health"
}

dist_ready=0
if [ -s "unsoccer/client/dist/index.html" ] && [ -s "unsoccer/server/dist/index.js" ] && [ -s "unsoccer/shared/dist/index.js" ]; then
  if grep -q "$expected_version" "unsoccer/client/dist/index.html" \
    && grep -q "$expected_weight" "unsoccer/client/dist/index.html" \
    && grep -q "GAME_VERSION" "unsoccer/server/dist/index.js" \
    && grep -q "$expected_version" "unsoccer/shared/dist/index.js"; then
    dist_ready=1
  fi
fi
if [ "$dist_ready" -eq 1 ]; then
  current_api_health="$(curl -fsS http://127.0.0.1:8787/api/health || true)"
  if ! grep -q "\"version\":\"${expected_version}\"" <<< "$current_api_health"; then
    echo "UnSoccer local API is stale before artifact checks; restarting service for ${expected_version}"
    restart_unsoccer "restart stale unsoccer api"
  fi
fi
if [ "$dist_ready" -eq 1 ] && [ "$source_changed_without_dist" -eq 0 ]; then
  stage "committed dist ready"
  echo "using committed UnSoccer dist for ${expected_version}; skipping npm ci/build"
else
  stage "npm dependencies"
  rm -rf node_modules/@geckos.io node_modules/node-datachannel node_modules/ws node_modules/@types/ws
  package_changed=1
  if [ -n "$previous_head" ] && git diff --quiet "$previous_head" HEAD -- package.json package-lock.json unsoccer/shared/package.json unsoccer/server/package.json unsoccer/client/package.json; then
    package_changed=0
  fi
  if [ "$package_changed" -eq 0 ] && [ -d node_modules ]; then
    echo "package manifests unchanged since ${previous_head}; reusing existing node_modules"
  else
    NODE_ENV=development npm ci --include=dev
  fi
  stage "dependency check"
  node --input-type=module -e "await import('@dimforge/rapier3d-compat'); await import('@itch-games/unsoccer-shared'); console.log('unsoccer required dependencies ok')"
  stage "build unsoccer"
  rm -rf unsoccer/client/dist unsoccer/server/dist unsoccer/shared/dist
  npm run build:unsoccer
fi
stage "artifact checks"
dist_html="unsoccer/client/dist/index.html"
dist_assets="unsoccer/client/dist/assets"
test -s "$dist_html"
test -d "$dist_assets"
EXPECTED_VERSION="$expected_version" EXPECTED_WEIGHT="$expected_weight" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const expectedVersion = process.env.EXPECTED_VERSION;
const expectedWeight = process.env.EXPECTED_WEIGHT;
const htmlPath = "unsoccer/client/dist/index.html";
const assetsDir = "unsoccer/client/dist/assets";
const html = fs.readFileSync(htmlPath, "utf8");
if (!html.includes(expectedVersion)) throw new Error(`dist html missing ${expectedVersion}`);
if (!html.includes(expectedWeight)) throw new Error(`dist html missing ${expectedWeight} weight label`);
const versions = new Set(html.match(/v\d+\.\d+\.\d+/g) || []);
if (versions.size !== 1 || !versions.has(expectedVersion)) {
  throw new Error(`dist html version markers mismatch: ${Array.from(versions).join(", ") || "none"}`);
}
const refs = Array.from(html.matchAll(/(?:src|href)="\.\/assets\/([^"]+)"/g)).map((match) => match[1]);
if (!refs.length) throw new Error("dist html has no asset references");
if (!refs.some((name) => name.endsWith(".js"))) throw new Error("dist html has no js asset reference");
for (const name of refs) {
  const target = path.join(assetsDir, name);
  if (!fs.existsSync(target)) throw new Error(`missing dist asset referenced by html: ${name}`);
}
console.log(`dist html references ok: ${refs.join(", ")}`);
NODE
grep -R -q 'residential-courtyard' "$dist_assets"
grep -R -q "$expected_weight" "$dist_assets"
! grep -Eq 'geckos|node-datachannel|@geckos.io|from ["'\'']ws["'\'']|import\(["'\'']ws["'\'']\)' unsoccer/server/dist/index.js
stage "install service references"
sudo -n install -m 0644 ai_chat/deploy/itch-games-io-games-qwertystock.conf /etc/nginx/sites-available/itch-games-io-games.conf
sudo -n install -m 0644 ai_chat/deploy/itch-games-ai-chat-qwertystock.service /etc/systemd/system/itch-games-ai-chat.service
sudo -n install -m 0644 ai_chat/deploy/itch-games-unsoccer-server-qwertystock.service /etc/systemd/system/itch-games-unsoccer-server.service
sudo -n ln -sfn /etc/nginx/sites-available/itch-games-io-games.conf /etc/nginx/sites-enabled/itch-games-io-games.conf
sudo -n rm -f /etc/nginx/sites-enabled/itch-games-orbital-courier.conf
sudo -n nginx -t
sudo -n systemctl daemon-reload
restart_unsoccer "restart unsoccer"
stage "restart chat and reload nginx"
sudo -n systemctl enable --now itch-games-ai-chat.service
curl -fsS http://127.0.0.1:8765/api/health
sudo -n systemctl reload nginx
stage "public unsoccer smoke"
public_html="$(curl -fsS https://io-games.mecharulez.com/unsoccer/)"
grep -q "$expected_version" <<< "$public_html"
grep -q "$expected_weight" <<< "$public_html"
api_health="$(curl -fsS https://io-games.mecharulez.com/unsoccer/api/health)"
grep -q "\"version\":\"${expected_version}\"" <<< "$api_health"
(sleep 12; sudo -n systemctl restart itch-games-ai-chat.service) >/dev/null 2>&1 &
