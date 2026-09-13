#!/usr/bin/env bash
set -euo pipefail
release="${1:?release required}"
[[ "$release" =~ ^[0-9]{8}-[0-9]{6}$ ]] || exit 1
base=/opt/linkora
app="$base/releases/$release"
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Another deployment is in progress'; exit 1; }
test -f "$app/.next/BUILD_ID"

if [ ! -x "$base/node/bin/node" ]; then
  cd "$base/incoming"
  curl -fsSL --retry 3 https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o SHASUMS256.txt
  filename=$(awk '$2 ~ /^node-v24\..*-linux-x64.tar.xz$/ {print $2}' SHASUMS256.txt)
  test -n "$filename"
  curl -fsSL --retry 3 "https://nodejs.org/dist/latest-v24.x/$filename" -o "$filename"
  grep "  $filename\$" SHASUMS256.txt | sha256sum -c -
  mkdir -p "$base/node"
  tar -xJf "$filename" --strip-components=1 -C "$base/node"
fi
export PATH="$base/node/bin:$PATH"
node --version
cd "$app"
npm ci --no-audit --no-fund

id linkora >/dev/null 2>&1 || sudo useradd --system --home-dir "$base" --shell /usr/sbin/nologin linkora
sudo chown root:linkora "$base/shared"
sudo chmod 750 "$base/shared"
sudo chown -R linkora:linkora "$base/shared/data"
ln -s "$base/shared/data" "$app/data"
mkdir -p "$app/.next/cache"
sudo chown -R linkora:linkora "$app/.next/cache"

sudo tee /etc/systemd/system/linkora.service >/dev/null <<'SERVICE'
[Unit]
Description=Linkora website
After=network.target

[Service]
Type=simple
User=linkora
Group=linkora
WorkingDirectory=/opt/linkora/current
EnvironmentFile=/opt/linkora/shared/app.env
Environment=PATH=/opt/linkora/node/bin:/usr/bin:/bin
ExecStart=/opt/linkora/node/bin/node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 18082
Restart=on-failure
RestartSec=3
TimeoutStopSec=30
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
SERVICE

# Dedicated listener; existing websites on 80/443/8080/8081 are not modified.
sudo tee /etc/nginx/sites-available/linkora >/dev/null <<'NGINX'
server {
    listen 8082;
    listen [::]:8082;
    server_name _;
    client_max_body_size 32m;
    gzip on;
    gzip_vary on;
    gzip_comp_level 5;
    gzip_types text/css application/javascript application/json image/svg+xml font/ttf font/otf application/x-font-ttf;
    location / {
        proxy_pass http://127.0.0.1:18082;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Host $http_host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_buffering off;
    }
}
NGINX
sudo ln -sfn /etc/nginx/sites-available/linkora /etc/nginx/sites-enabled/linkora
sudo nginx -t
previous=$(readlink -f "$base/current" || true)
# Consistent online database backup before activating the release.
sudo python3 - "$base/shared/data/linkora.sqlite" "$base/backups/$release.sqlite" <<'PY'
import sqlite3,sys,os
with sqlite3.connect(sys.argv[1]) as source, sqlite3.connect(sys.argv[2]) as dest:
    source.backup(dest)
os.chmod(sys.argv[2],0o600)
PY
ln -s "$app" "$base/current-next"
mv -Tf "$base/current-next" "$base/current"
sudo systemctl daemon-reload
sudo systemctl enable linkora
sudo systemctl restart linkora
healthy=false
for i in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:18082/api/templates > /dev/null; then
    healthy=true
    break
  fi
  sleep 1
done
if [ "$healthy" != true ]; then
  sudo journalctl -u linkora -n 40 --no-pager
  if [ -n "$previous" ] && [ "$previous" != "$app" ]; then
    ln -s "$previous" "$base/current-rollback"
    mv -Tf "$base/current-rollback" "$base/current"
    sudo systemctl restart linkora
    echo 'Restored previous application release; shared data preserved.'
  fi
  exit 1
fi
sudo systemctl reload nginx
curl -fsS http://127.0.0.1:8082/api/templates > /dev/null
echo "Linkora release $release is healthy on port 8082"
