#!/usr/bin/env bash
set -euo pipefail

cd /home/generic/itch_games
git fetch origin main
git checkout main
git pull --ff-only origin main
git status --short
sudo -n systemctl restart itch-games-ai-chat.service
sudo -n systemctl is-active --quiet itch-games-ai-chat.service
curl -fsS http://127.0.0.1:8765/api/health
