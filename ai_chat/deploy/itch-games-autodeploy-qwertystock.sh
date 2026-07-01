#!/usr/bin/env bash
set -euo pipefail
trap 'echo "autodeploy failed at line ${LINENO}" >&2' ERR

stage() {
  echo "== $1 =="
}

cd /home/generic/itch_games
stage "git update"
git fetch origin main
git checkout main
git pull --ff-only origin main
git rev-parse --short HEAD
git status --short
stage "node and npm"
echo "node: $(node -v)"
echo "npm: $(npm -v)"
stage "npm ci with dev dependencies"
rm -rf node_modules/@geckos.io node_modules/node-datachannel node_modules/ws node_modules/@types/ws
NODE_ENV=development npm ci --include=dev
stage "dependency check"
node --input-type=module -e "await import('@dimforge/rapier3d-compat'); await import('@itch-games/unsoccer-shared'); console.log('unsoccer required dependencies ok')"
stage "build unsoccer"
rm -rf unsoccer/client/dist
npm run build:unsoccer
stage "artifact checks"
dist_html="unsoccer/client/dist/index.html"
dist_assets="unsoccer/client/dist/assets"
test -s "$dist_html"
test -d "$dist_assets"
find "$dist_assets" -maxdepth 1 -type f -name '*.js' -print -quit | grep -q .
grep -q 'v0.0.008' "$dist_html"
grep -q '0.56 MB' "$dist_html"
grep -R -q 'residential-courtyard' "$dist_assets"
grep -R -q '0.56 MB' "$dist_assets"
! grep -Eq 'geckos|node-datachannel|@geckos.io|from ["'\'']ws["'\'']|import\(["'\'']ws["'\'']\)' unsoccer/server/dist/index.js
stage "install service references"
sudo -n install -m 0644 ai_chat/deploy/itch-games-io-games-qwertystock.conf /etc/nginx/sites-available/itch-games-io-games.conf
sudo -n install -m 0644 ai_chat/deploy/itch-games-ai-chat-qwertystock.service /etc/systemd/system/itch-games-ai-chat.service
sudo -n install -m 0644 ai_chat/deploy/itch-games-unsoccer-server-qwertystock.service /etc/systemd/system/itch-games-unsoccer-server.service
sudo -n ln -sfn /etc/nginx/sites-available/itch-games-io-games.conf /etc/nginx/sites-enabled/itch-games-io-games.conf
sudo -n rm -f /etc/nginx/sites-enabled/itch-games-orbital-courier.conf
sudo -n nginx -t
sudo -n systemctl daemon-reload
stage "restart unsoccer"
sudo -n systemctl enable --now itch-games-unsoccer-server.service
sudo -n systemctl restart itch-games-unsoccer-server.service
sleep 2
if ! curl -fsS http://127.0.0.1:8787/api/health; then
  sudo -n systemctl restart itch-games-unsoccer-server.service
  sleep 3
fi
curl -fsS http://127.0.0.1:8787/api/health
stage "restart chat and reload nginx"
sudo -n systemctl enable --now itch-games-ai-chat.service
curl -fsS http://127.0.0.1:8765/api/health
sudo -n systemctl reload nginx
stage "public unsoccer smoke"
public_html="$(curl -fsS https://io-games.mecharulez.com/unsoccer/)"
grep -q 'v0.0.008' <<< "$public_html"
grep -q '0.56 MB' <<< "$public_html"
api_health="$(curl -fsS https://io-games.mecharulez.com/unsoccer/api/health)"
grep -q '"version":"v0.0.008"' <<< "$api_health"
(sleep 2; sudo -n systemctl restart itch-games-ai-chat.service) >/dev/null 2>&1 &
