#!/usr/bin/env bash
set -euo pipefail

primary_domain="studio-balance.cz"
www_domain="www.studio-balance.cz"
login_domain="login.studio-balance.cz"
config_name="studio-balance.cz.conf"
activate_preview=false
activate_production=false
http_only=false
email=""
expected_version=""

usage() {
  cat <<'USAGE'
Usage:
  sudo bash install-studiobalance.sh --activate-preview [--email EMAIL]
       [--expected-version GIT_SHA] [--http-only]
  sudo bash install-studiobalance.sh --activate-production [--email EMAIL]
       --expected-version GIT_SHA [--http-only]

Publishes Studio Balance at https://studio-balance.cz, redirects the www host
and exposes the dedicated realm at https://login.studio-balance.cz. The script
verifies upstreams, backs up Nginx, obtains TLS and restores the previous site
on error. No zeleznalady.cz hostname is created or required.
USAGE
}

while (($#)); do
  case "$1" in
    --activate-preview) activate_preview=true ;;
    --activate-production) activate_production=true ;;
    --expected-version) shift; expected_version="${1:-}" ;;
    --email) shift; email="${1:-}" ;;
    --http-only) http_only=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [[ "$activate_preview" == "$activate_production" ]]; then
  echo "Select exactly one of --activate-preview or --activate-production." >&2
  exit 2
fi
if [[ -n "$expected_version" && ! "$expected_version" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Expected version must be a 7-40 character lowercase Git SHA." >&2
  exit 2
fi

if [[ "$activate_production" == true ]]; then
  [[ -n "$expected_version" ]] || { echo "Production activation requires --expected-version." >&2; exit 2; }
  web_upstream="docker.home.cz:3281"
  api_upstream="docker.home.cz:4281"
  deployment_mode="production"
else
  web_upstream="docker.home.cz:3280"
  api_upstream="docker.home.cz:4280"
  deployment_mode="preview"
fi
keycloak_upstream="docker.home.cz:8081"

((EUID == 0)) || { echo "Run this script with sudo." >&2; exit 1; }
for command in nginx curl getent install ln cp rm date mktemp systemctl cat grep; do
  command -v "$command" >/dev/null || { echo "Required command is missing: $command" >&2; exit 1; }
done
for host in "$primary_domain" "$www_domain" "$login_domain"; do
  getent ahostsv4 "$host" >/dev/null || { echo "DNS A record for $host does not resolve from this host." >&2; exit 1; }
done

echo "Checking Studio Balance upstreams..."
curl --fail --silent --show-error --head --connect-timeout 5 "http://$web_upstream/" >/dev/null
ready_payload="$(curl --fail --silent --show-error --connect-timeout 5 "http://$api_upstream/ready")"
[[ "$ready_payload" == *'"status":"ok"'* ]] || { echo "API readiness response is not healthy." >&2; exit 1; }
if [[ -n "$expected_version" && "$ready_payload" != *'"version":"'"$expected_version"'"'* ]]; then
  echo "API readiness response does not match expected version $expected_version." >&2
  exit 1
fi
curl --fail --silent --show-error --head --connect-timeout 5 "http://$keycloak_upstream/realms/studio-balance" >/dev/null

if [[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]]; then
  config_path="/etc/nginx/sites-available/$config_name"
  enabled_path="/etc/nginx/sites-enabled/$config_name"
else
  config_path="/etc/nginx/conf.d/$config_name"
  enabled_path="$config_path"
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="${config_path}.backup.${timestamp}"
temporary="$(mktemp /tmp/studiobalance-nginx.XXXXXX)"
had_config=false
installed=false

cleanup() { rm -f "$temporary"; }
rollback() {
  local exit_code=$?
  cleanup
  if [[ "$installed" == true ]]; then
    if [[ "$had_config" == true && -f "$backup_path" ]]; then cp -a "$backup_path" "$config_path";
    else rm -f "$config_path"; [[ "$enabled_path" == "$config_path" ]] || rm -f "$enabled_path"; fi
    nginx -t >/dev/null 2>&1 && systemctl reload nginx || true
  fi
  echo "Installation failed; the previous Nginx site was restored." >&2
  exit "$exit_code"
}
trap cleanup EXIT
trap rollback ERR

if [[ -f "$config_path" ]]; then cp -a "$config_path" "$backup_path"; had_config=true; fi
if [[ "$enabled_path" != "$config_path" && -e "$enabled_path" && ! -L "$enabled_path" ]]; then
  echo "Refusing to replace non-symlink Nginx site: $enabled_path" >&2
  exit 1
fi

append_app_proxy() {
  cat >>"$temporary" <<EOF
    access_log /var/log/nginx/studiobalance.access.log;
    error_log /var/log/nginx/studiobalance.error.log warn;
    location = /health { return 404; }
    location = /ready { return 404; }
    location /api/ {
        proxy_pass http://$api_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Request-ID \$request_id;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
    location / {
        proxy_pass http://$web_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Request-ID \$request_id;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
EOF
}

append_keycloak_proxy() {
  cat >>"$temporary" <<EOF
    client_max_body_size 20m;
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    send_timeout 60s;
    location ^~ /realms/ {
        proxy_pass http://$keycloak_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port 443;
    }
    location ^~ /resources/ {
        proxy_pass http://$keycloak_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port 443;
    }
    location ^~ /admin/ { return 404; }
    location = / { return 302 /realms/studio-balance/account; }
    location / {
        proxy_pass http://$keycloak_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port 443;
    }
EOF
}

render_http_config() {
  : >"$temporary"
  cat >>"$temporary" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $primary_domain $www_domain;
EOF
  append_app_proxy
  echo '}' >>"$temporary"
  cat >>"$temporary" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $login_domain;
EOF
  append_keycloak_proxy
  echo '}' >>"$temporary"
}

render_tls_config() {
  : >"$temporary"
  cat >>"$temporary" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $primary_domain $www_domain $login_domain;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $www_domain;
    ssl_certificate /etc/letsencrypt/live/$primary_domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$primary_domain/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    return 301 https://$primary_domain\$request_uri;
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $primary_domain;
    ssl_certificate /etc/letsencrypt/live/$primary_domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$primary_domain/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
EOF
  append_app_proxy
  echo '}' >>"$temporary"
  cat >>"$temporary" <<EOF
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $login_domain;
    ssl_certificate /etc/letsencrypt/live/$primary_domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$primary_domain/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
EOF
  append_keycloak_proxy
  echo '}' >>"$temporary"
}

certificate_dir="/etc/letsencrypt/live/$primary_domain"
if [[ -s "$certificate_dir/fullchain.pem" && -s "$certificate_dir/privkey.pem" ]]; then render_tls_config; else render_http_config; fi
install -o root -g root -m 0644 "$temporary" "$config_path"
[[ "$enabled_path" == "$config_path" ]] || ln -sfn "$config_path" "$enabled_path"
installed=true
nginx -t
systemctl reload nginx

if [[ "$http_only" == true ]]; then trap - ERR; echo "HTTP sites installed. TLS was intentionally skipped."; exit 0; fi

if [[ ! -s "$certificate_dir/fullchain.pem" || ! -s "$certificate_dir/privkey.pem" ]]; then
  if [[ -z "$email" && -t 0 ]]; then read -r -p "Let's Encrypt contact email: " email; fi
  [[ -n "$email" && "$email" == *@*.* ]] || { echo "A valid --email address is required for the first certificate." >&2; exit 1; }
  if ! command -v certbot >/dev/null; then
    command -v apt-get >/dev/null || { echo "certbot is missing and this host does not use apt-get." >&2; exit 1; }
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx
  fi
  certbot certonly --nginx --non-interactive --agree-tos --expand \
    --cert-name "$primary_domain" --email "$email" \
    --domain "$primary_domain" --domain "$www_domain" --domain "$login_domain"
fi

render_tls_config
install -o root -g root -m 0644 "$temporary" "$config_path"
nginx -t
systemctl reload nginx
for host in "$primary_domain" "$www_domain" "$login_domain"; do
  nginx -T 2>/dev/null | grep -Fq "server_name $host" || { echo "Nginx did not load $host." >&2; exit 1; }
done

trap - ERR
echo "Studio Balance $deployment_mode is published at https://$primary_domain"
echo "Login is published at https://$login_domain"
echo "Backup, if an older site existed: $backup_path"
