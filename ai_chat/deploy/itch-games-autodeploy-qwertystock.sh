#!/usr/bin/env bash
set -euo pipefail

cd /home/generic/itch_games
git fetch origin main
git checkout main
git pull --ff-only origin main
git status --short
npm ci
npm run build:unsoccer
sudo -n install -m 0644 ai_chat/deploy/itch-games-io-games-qwertystock.conf /etc/nginx/sites-available/itch-games-io-games.conf
sudo -n install -m 0644 ai_chat/deploy/itch-games-unsoccer-server-qwertystock.service /etc/systemd/system/itch-games-unsoccer-server.service
sudo -n ln -sfn /etc/nginx/sites-available/itch-games-io-games.conf /etc/nginx/sites-enabled/itch-games-io-games.conf
sudo -n rm -f /etc/nginx/sites-enabled/itch-games-orbital-courier.conf
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now itch-games-unsoccer-server.service
sudo -n systemctl restart itch-games-unsoccer-server.service
sudo -n systemctl is-active --quiet itch-games-unsoccer-server.service
curl -fsS http://127.0.0.1:8787/api/health
sudo -n nginx -t
sudo -n systemctl reload nginx
sudo -n systemctl restart itch-games-ai-chat.service
sudo -n systemctl is-active --quiet itch-games-ai-chat.service
curl -fsS http://127.0.0.1:8765/api/health
