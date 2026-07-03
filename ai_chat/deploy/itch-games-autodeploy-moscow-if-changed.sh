#!/usr/bin/env bash
set -euo pipefail

ROOT="${ITCH_GAMES_ROOT:-/itch_games}"
REMOTE="${ITCH_GAMES_REMOTE:-origin}"
BRANCH="${ITCH_GAMES_BRANCH:-main}"
DEPLOY_SCRIPT="${ITCH_GAMES_DEPLOY_SCRIPT:-/usr/local/bin/itch-games-autodeploy-moscow.sh}"
LOCK_FILE="${ITCH_GAMES_DEPLOY_LOCK:-/run/itch-games-autodeploy-moscow.lock}"

cd "$ROOT"

if [ ! -d .git ]; then
  echo "skip: $ROOT is not a git checkout" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "skip: $ROOT has local changes; refusing automatic deploy" >&2
  git status --short >&2
  exit 0
fi

git fetch --quiet "$REMOTE" "$BRANCH"
local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse "$REMOTE/$BRANCH")"

if [ "$local_head" = "$remote_head" ]; then
  echo "no change: ${local_head:0:7}"
  exit 0
fi

echo "change detected: ${local_head:0:7} -> ${remote_head:0:7}; running Moscow deploy"
exec flock -n "$LOCK_FILE" "$DEPLOY_SCRIPT"
