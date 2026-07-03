#!/usr/bin/env bash
set -euo pipefail
trap 'echo "moscow autodeploy failed at line ${LINENO}" >&2' ERR

ROOT="${ITCH_GAMES_ROOT:-/itch_games}"
HOST="${ITCH_GAMES_PUBLIC_HOST:-moscow-io-games.mecharulez.com}"
PUBLIC_IP="${ITCH_GAMES_PUBLIC_IP:-5.42.121.207}"
UNSOCCER_PORT="${UNSOCCER_PORT:-8787}"
CHAT_PORT="${AI_CHAT_PORT:-8765}"
NGINX_SITE="itch-games-io-games-moscow.conf"
CERT_DIR="/etc/letsencrypt/live/${HOST}"
ACME_ROOT="/var/www/letsencrypt"

stage() {
  echo "== $1 =="
}

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo -n "$@"
  fi
}

write_nginx_config() {
  local mode="$1"
  local tmp
  tmp="$(mktemp)"
  if [ "$mode" = "ssl" ]; then
    cat >"$tmp" <<EOF
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${HOST};

    root ${ROOT};
    index index.html;
    charset utf-8;
    client_max_body_size 80m;

    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    add_header X-IO-Games-Origin "moscow" always;
    add_header X-IO-Games-Region "moscow" always;

    location = /health {
        access_log off;
        add_header Content-Type text/plain;
        return 200 "ok\\n";
    }

    location ~ /\\.(?!well-known) {
        deny all;
    }

    location = /ai_chat {
        return 301 /ai_chat/;
    }

    location /ai_chat/ {
        proxy_pass http://127.0.0.1:${CHAT_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location = /unsoccer {
        return 301 /unsoccer/;
    }

    location /unsoccer/api/ {
        proxy_pass http://127.0.0.1:${UNSOCCER_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /unsoccer/socket/ {
        proxy_pass http://127.0.0.1:${UNSOCCER_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /unsoccer/assets/ {
        alias ${ROOT}/unsoccer/client/dist/assets/;
        try_files \$uri =404;
        access_log off;
        expires 1h;
    }

    location /unsoccer/ {
        alias ${ROOT}/unsoccer/client/dist/;
        try_files \$uri \$uri/ /unsoccer/index.html;
        add_header Cache-Control "no-store";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name ${HOST};

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        default_type "text/plain";
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF
  else
    cat >"$tmp" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${HOST};

    root ${ROOT};
    index index.html;
    charset utf-8;
    client_max_body_size 80m;

    add_header X-IO-Games-Origin "moscow" always;
    add_header X-IO-Games-Region "moscow" always;

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        default_type "text/plain";
    }

    location = /health {
        access_log off;
        add_header Content-Type text/plain;
        return 200 "ok\\n";
    }

    location ~ /\\.(?!well-known) {
        deny all;
    }

    location = /ai_chat {
        return 301 /ai_chat/;
    }

    location /ai_chat/ {
        proxy_pass http://127.0.0.1:${CHAT_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location = /unsoccer {
        return 301 /unsoccer/;
    }

    location /unsoccer/api/ {
        proxy_pass http://127.0.0.1:${UNSOCCER_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /unsoccer/socket/ {
        proxy_pass http://127.0.0.1:${UNSOCCER_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /unsoccer/assets/ {
        alias ${ROOT}/unsoccer/client/dist/assets/;
        try_files \$uri =404;
        access_log off;
        expires 1h;
    }

    location /unsoccer/ {
        alias ${ROOT}/unsoccer/client/dist/;
        try_files \$uri \$uri/ /unsoccer/index.html;
        add_header Cache-Control "no-store";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
  fi
  as_root install -m 0644 "$tmp" "/etc/nginx/sites-available/${NGINX_SITE}"
  rm -f "$tmp"
  as_root ln -sfn "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
}

write_systemd_units() {
  local chat_tmp unsoccer_tmp
  chat_tmp="$(mktemp)"
  unsoccer_tmp="$(mktemp)"
  cat >"$chat_tmp" <<EOF
[Unit]
Description=IO Games AI development chat on Moscow mirror
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${ROOT}
Environment=AI_CHAT_HOST=127.0.0.1
Environment=AI_CHAT_PORT=${CHAT_PORT}
Environment=AI_CHAT_DATA_DIR=${ROOT}/ai_chat/data
EnvironmentFile=-/etc/itch-games-ai-chat.env
Environment=AI_CHAT_DEPLOY_SCRIPT=/usr/local/bin/itch-games-autodeploy-moscow.sh
Environment=AI_CHAT_PUBLIC_URL=https://${HOST}
Environment=AI_CHAT_OPEN_BUILD_URL=https://${HOST}/unsoccer/
Environment=AI_CHAT_DEPLOY_RELAY_ALLOW_IPS=145.239.0.57
Environment=UNSOCCER_AUTOSTART=0
Environment=UNSOCCER_PORT=${UNSOCCER_PORT}
ExecStart=/usr/bin/node ${ROOT}/ai_chat/server_node.js
Restart=always
RestartSec=3
User=root
Group=root

[Install]
WantedBy=multi-user.target
EOF
  cat >"$unsoccer_tmp" <<EOF
[Unit]
Description=UnSoccer authoritative server on Moscow mirror
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${ROOT}
Environment=NODE_ENV=production
Environment=UNSOCCER_PORT=${UNSOCCER_PORT}
ExecStart=/usr/bin/node ${ROOT}/unsoccer/server/dist/index.js
Restart=always
RestartSec=3
User=root
Group=root

[Install]
WantedBy=multi-user.target
EOF
  as_root install -m 0644 "$chat_tmp" /etc/systemd/system/itch-games-ai-chat.service
  as_root install -m 0644 "$unsoccer_tmp" /etc/systemd/system/itch-games-unsoccer-server.service
  rm -f "$chat_tmp" "$unsoccer_tmp"
}

ensure_packages() {
  local missing=()
  command -v git >/dev/null 2>&1 || missing+=(git)
  command -v node >/dev/null 2>&1 || missing+=(nodejs)
  command -v npm >/dev/null 2>&1 || missing+=(npm)
  command -v nginx >/dev/null 2>&1 || missing+=(nginx)
  command -v certbot >/dev/null 2>&1 || missing+=(certbot)
  if [ "${#missing[@]}" -gt 0 ]; then
    stage "apt packages: ${missing[*]}"
    export DEBIAN_FRONTEND=noninteractive
    as_root apt-get update
    as_root apt-get install -y "${missing[@]}"
  fi
}

ensure_webhook_secret() {
  local env_file="/etc/itch-games-ai-chat.env"
  as_root touch "$env_file"
  as_root chmod 600 "$env_file"
  if ! as_root grep -q '^AI_CHAT_WEBHOOK_SECRET=' "$env_file"; then
    local secret
    secret="$(openssl rand -hex 32)"
    printf 'AI_CHAT_WEBHOOK_SECRET=%s\n' "$secret" | as_root tee -a "$env_file" >/dev/null
  fi
}

wait_for_dns() {
  stage "dns wait"
  local current=""
  for _ in $(seq 1 60); do
    current="$(getent ahostsv4 "$HOST" | awk '{print $1; exit}' || true)"
    if [ "$current" = "$PUBLIC_IP" ]; then
      echo "${HOST} resolves to ${current}"
      return 0
    fi
    echo "${HOST} resolves to ${current:-none}; waiting for ${PUBLIC_IP}"
    sleep 5
  done
  echo "${HOST} did not resolve to ${PUBLIC_IP}" >&2
  return 1
}

ensure_certificate() {
  as_root mkdir -p "$ACME_ROOT"
  if [ -s "${CERT_DIR}/fullchain.pem" ] && [ -s "${CERT_DIR}/privkey.pem" ]; then
    echo "certificate already exists for ${HOST}"
    return 0
  fi
  wait_for_dns
  stage "temporary http nginx"
  write_nginx_config http
  as_root nginx -t
  as_root systemctl reload nginx
  stage "certbot"
  as_root certbot certonly --webroot -w "$ACME_ROOT" -d "$HOST" --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
}

cd "$ROOT"
if [ "${ITCH_GAMES_DEPLOY_DETACHED:-0}" != "1" ]; then
  log="/tmp/itch-games-moscow-autodeploy-$(date -u +%Y%m%dT%H%M%SZ).log"
  nohup env ITCH_GAMES_DEPLOY_DETACHED=1 "$0" >"$log" 2>&1 &
  echo "detached moscow autodeploy started; log=${log}"
  exit 0
fi

exec 9>/tmp/itch-games-moscow-autodeploy.lock
if ! flock -n 9; then
  echo "another detached moscow autodeploy is already running"
  exit 0
fi

ensure_packages
ensure_webhook_secret

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

dist_ready=0
if [ -s "unsoccer/client/dist/index.html" ] && [ -s "unsoccer/server/dist/index.js" ] && [ -s "unsoccer/shared/dist/index.js" ]; then
  if grep -q "$expected_version" "unsoccer/client/dist/index.html" \
    && grep -q "$expected_weight" "unsoccer/client/dist/index.html" \
    && grep -q "GAME_VERSION" "unsoccer/server/dist/index.js" \
    && grep -q "$expected_version" "unsoccer/shared/dist/index.js"; then
    dist_ready=1
  fi
fi

package_changed=1
if [ -n "$previous_head" ] && git diff --quiet "$previous_head" HEAD -- package.json package-lock.json unsoccer/shared/package.json unsoccer/server/package.json unsoccer/client/package.json; then
  package_changed=0
fi

if [ ! -d node_modules ] || [ "$package_changed" -eq 1 ]; then
  stage "npm dependencies"
  rm -rf node_modules/@geckos.io node_modules/node-datachannel node_modules/ws node_modules/@types/ws
  NODE_ENV=development npm ci --include=dev
fi

stage "dependency check"
node --input-type=module -e "await import('@dimforge/rapier3d-compat'); await import('@itch-games/unsoccer-shared'); console.log('unsoccer required dependencies ok')"

if [ "$dist_ready" -eq 1 ] && [ "$source_changed_without_dist" -eq 0 ]; then
  stage "committed dist ready"
  echo "using committed UnSoccer dist for ${expected_version}"
else
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
const refs = Array.from(html.matchAll(/(?:src|href)="\.\/assets\/([^"]+)"/g)).map((match) => match[1]);
if (!refs.length) throw new Error("dist html has no asset references");
if (!refs.some((name) => name.endsWith(".js"))) throw new Error("dist html has no js asset reference");
for (const name of refs) {
  const target = path.join(assetsDir, name);
  if (!fs.existsSync(target)) throw new Error(`missing dist asset referenced by html: ${name}`);
}
console.log(`dist html references ok: ${refs.join(", ")}`);
NODE
grep -R -q "$expected_weight" "$dist_assets"
! grep -Eq 'geckos|node-datachannel|@geckos.io|from ["'\'']ws["'\'']|import\(["'\'']ws["'\'']\)' unsoccer/server/dist/index.js

stage "install service references"
if [ -f "ai_chat/deploy/itch-games-autodeploy-moscow.sh" ]; then
  as_root install -m 0755 ai_chat/deploy/itch-games-autodeploy-moscow.sh /usr/local/bin/itch-games-autodeploy-moscow.sh
elif [ "$(readlink -f "$0")" != "/usr/local/bin/itch-games-autodeploy-moscow.sh" ]; then
  as_root install -m 0755 "$0" /usr/local/bin/itch-games-autodeploy-moscow.sh
fi
write_systemd_units
ensure_certificate
write_nginx_config ssl
as_root nginx -t
as_root systemctl daemon-reload
as_root systemctl enable --now nginx

stage "restart unsoccer"
as_root systemctl enable itch-games-unsoccer-server.service
as_root systemctl stop itch-games-unsoccer-server.service || true
as_root pkill -f "${ROOT}/unsoccer/server/dist/index.js" || true
as_root systemctl start itch-games-unsoccer-server.service
sleep 2
api_health="$(curl -fsS "http://127.0.0.1:${UNSOCCER_PORT}/api/health" || true)"
if ! grep -q "\"version\":\"${expected_version}\"" <<< "$api_health"; then
  as_root systemctl restart itch-games-unsoccer-server.service
  sleep 3
  api_health="$(curl -fsS "http://127.0.0.1:${UNSOCCER_PORT}/api/health")"
fi
printf '%s\n' "$api_health"
grep -q "\"version\":\"${expected_version}\"" <<< "$api_health"

stage "restart chat and reload nginx"
as_root systemctl enable --now itch-games-ai-chat.service
if ! curl -fsS "http://127.0.0.1:${CHAT_PORT}/api/health"; then
  as_root systemctl restart itch-games-ai-chat.service
  sleep 3
fi
curl -fsS "http://127.0.0.1:${CHAT_PORT}/api/health"
as_root systemctl reload nginx

stage "public unsoccer smoke"
public_html="$(curl -fsS "https://${HOST}/unsoccer/")"
grep -q "$expected_version" <<< "$public_html"
grep -q "$expected_weight" <<< "$public_html"
api_health="$(curl -fsS "https://${HOST}/unsoccer/api/health")"
grep -q "\"version\":\"${expected_version}\"" <<< "$api_health"

stage "delayed chat restart"
(sleep 12; as_root systemctl restart itch-games-ai-chat.service) >/dev/null 2>&1 &
echo "moscow deploy complete for ${expected_version} on https://${HOST}/unsoccer/"
