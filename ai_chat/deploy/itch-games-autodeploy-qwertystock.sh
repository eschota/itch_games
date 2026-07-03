#!/usr/bin/env bash
set -euo pipefail
trap 'echo "autodeploy failed at line ${LINENO}" >&2' ERR

stage() {
  echo "== $1 =="
}

cd /home/generic/itch_games
DEPLOY_LOCK="${ITCH_GAMES_DEPLOY_LOCK:-/tmp/itch-games-autodeploy.lock}"
DEPLOY_PID="${ITCH_GAMES_DEPLOY_PID:-/tmp/itch-games-autodeploy.pid}"
DEPLOY_MAX_SECONDS="${ITCH_GAMES_DEPLOY_MAX_SECONDS:-900}"

if [ "${ITCH_GAMES_DEPLOY_DETACHED:-0}" != "1" ]; then
  log="/tmp/itch-games-autodeploy-$(date -u +%Y%m%dT%H%M%SZ).log"
  nohup env ITCH_GAMES_DEPLOY_DETACHED=1 "$0" >"$log" 2>&1 &
  echo "detached autodeploy started; log=${log}"
  exit 0
fi

exec 9>"$DEPLOY_LOCK"
if ! flock -n 9; then
  echo "another detached autodeploy is already running; checking for stale deploy processes older than ${DEPLOY_MAX_SECONDS}s"
  stale_pids="$(ps -eo pid=,etimes=,args= | awk -v self="$$" -v max="$DEPLOY_MAX_SECONDS" '$1 != self && $2 > max && $0 ~ /[i]tch-games-autodeploy-qwertystock\.sh/ {print $1}' || true)"
  if [ -z "$stale_pids" ] && [ -s "$DEPLOY_PID" ]; then
    lock_pid="$(cat "$DEPLOY_PID" 2>/dev/null || true)"
    if [[ "$lock_pid" =~ ^[0-9]+$ ]] && [ "$lock_pid" != "$$" ] && kill -0 "$lock_pid" 2>/dev/null; then
      lock_age="$(ps -p "$lock_pid" -o etimes= 2>/dev/null | tr -d ' ' || true)"
      if [ "${lock_age:-0}" -gt "$DEPLOY_MAX_SECONDS" ]; then
        stale_pids="$lock_pid"
      fi
    fi
  fi
  if [ -n "$stale_pids" ]; then
    echo "terminating stale deploy process(es): $stale_pids"
    for pid in $stale_pids; do
      kill -TERM "$pid" 2>/dev/null || true
    done
    sleep 2
    for pid in $stale_pids; do
      kill -KILL "$pid" 2>/dev/null || true
    done
  fi
  if ! flock -w 10 9; then
    echo "unable to acquire autodeploy lock after stale-process recovery" >&2
    exit 75
  fi
fi
printf '%s\n' "$$" >"$DEPLOY_PID"
cleanup_deploy_pid() {
  rm -f "$DEPLOY_PID"
}
trap cleanup_deploy_pid EXIT
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

find_unsoccer_pids() {
  ps -eo pid=,args= | awk '/[n]ode .*\/home\/generic\/itch_games\/unsoccer\/server\/dist\/index\.js/ {print $1}' || true
}

terminate_unsoccer_processes() {
  pids="$(find_unsoccer_pids)"
  if [ -z "$pids" ]; then
    return 0
  fi
  echo "terminating UnSoccer process(es): $pids"
  for pid in $pids; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  sleep 2
  for pid in $pids; do
    kill -KILL "$pid" 2>/dev/null || true
  done
}

wait_for_unsoccer_version() {
  attempts="${1:-20}"
  api_health=""
  for _ in $(seq 1 "$attempts"); do
    api_health="$(curl -fsS http://127.0.0.1:8787/api/health || true)"
    if grep -q "\"version\":\"${expected_version}\"" <<< "$api_health"; then
      printf '%s\n' "$api_health"
      return 0
    fi
    sleep 1
  done
  printf '%s\n' "$api_health"
  return 1
}

restart_unsoccer() {
  stage "$1"
  service_available=0
  if sudo -n systemctl enable itch-games-unsoccer-server.service; then
    service_available=1
    sudo -n systemctl stop itch-games-unsoccer-server.service || true
    sudo -n systemctl kill --kill-who=all itch-games-unsoccer-server.service || true
    sudo -n pkill -f '/home/generic/itch_games/unsoccer/server/dist/index.js' || true
    terminate_unsoccer_processes
    if sudo -n systemctl start itch-games-unsoccer-server.service; then
      if wait_for_unsoccer_version 20; then
        return 0
      fi
    else
      echo "systemd start failed; using fallback path"
    fi
    echo "systemd start did not expose ${expected_version}; retrying restart"
    sudo -n systemctl restart itch-games-unsoccer-server.service || true
    if wait_for_unsoccer_version 20; then
      return 0
    fi
    sudo -n systemctl status --no-pager itch-games-unsoccer-server.service || true
    echo "systemd restart did not expose ${expected_version}; using direct process fallback"
    sudo -n systemctl stop itch-games-unsoccer-server.service || true
    sudo -n systemctl kill --kill-who=all itch-games-unsoccer-server.service || true
  else
    echo "sudo systemctl is unavailable; using direct UnSoccer process restart"
  fi

  sudo -n pkill -f '/home/generic/itch_games/unsoccer/server/dist/index.js' || true
  terminate_unsoccer_processes
  nohup env NODE_ENV=production UNSOCCER_PORT=8787 /usr/bin/node /home/generic/itch_games/unsoccer/server/dist/index.js >/tmp/itch-games-unsoccer-fallback.log 2>&1 &
  wait_for_unsoccer_version 20
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
