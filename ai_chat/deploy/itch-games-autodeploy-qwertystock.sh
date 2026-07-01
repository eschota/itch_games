#!/usr/bin/env bash
set -euo pipefail

cd /home/generic/itch_games
git fetch origin main
git checkout main
git pull --ff-only origin main
git status --short
npm ci
npm run build:unsoccer
test -s unsoccer/client/dist/index.html
test -d unsoccer/client/dist/assets
find unsoccer/client/dist/assets -maxdepth 1 -type f -name '*.js' -print -quit | grep -q .
sudo -n install -m 0644 ai_chat/deploy/itch-games-io-games-qwertystock.conf /etc/nginx/sites-available/itch-games-io-games.conf
sudo -n install -m 0644 ai_chat/deploy/itch-games-ai-chat-qwertystock.service /etc/systemd/system/itch-games-ai-chat.service
sudo -n install -m 0644 ai_chat/deploy/itch-games-unsoccer-server-qwertystock.service /etc/systemd/system/itch-games-unsoccer-server.service
sudo -n ln -sfn /etc/nginx/sites-available/itch-games-io-games.conf /etc/nginx/sites-enabled/itch-games-io-games.conf
sudo -n rm -f /etc/nginx/sites-enabled/itch-games-orbital-courier.conf
sudo -n nginx -t
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now itch-games-unsoccer-server.service
sudo -n systemctl restart itch-games-unsoccer-server.service
sleep 2
if ! curl -fsS http://127.0.0.1:8787/api/health; then
  sudo -n systemctl restart itch-games-unsoccer-server.service
  sleep 3
fi
curl -fsS http://127.0.0.1:8787/api/health
sudo -n systemctl enable --now itch-games-ai-chat.service
curl -fsS http://127.0.0.1:8765/api/health
sudo -n systemctl reload nginx
(sleep 2; sudo -n systemctl restart itch-games-ai-chat.service) >/dev/null 2>&1 &
