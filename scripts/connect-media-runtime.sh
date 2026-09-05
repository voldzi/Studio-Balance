#!/usr/bin/env bash
# Run on docker.home.cz after provisioning and transferring only Studio Balance keys.
set -euo pipefail
task_root=/home/voldzi/deployments/studio-balance
exec 9>"$task_root/.production-operation.lock"
flock -n 9 || { echo 'Another production operation is running' >&2; exit 1; }
current_image="$(docker inspect --format '{{.Config.Image}}' studio-balance-production-api-1)"
version="${current_image##*:}"
[[ "$version" =~ ^[0-9a-f]{7,40}$ ]] || exit 1
backup_file="$task_root/.env.production.before-media-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$task_root/.env.production" "$backup_file"
chmod 600 "$backup_file"
python3 - <<'PY'
from pathlib import Path
import os
root = Path('/home/voldzi/deployments/studio-balance')
incoming = dict(line.split('=', 1) for line in (root / '.env.media-incoming').read_text().splitlines() if line)
allowed = {'S3_ENDPOINT','S3_BUCKET','S3_REGION','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_FORCE_PATH_STYLE'}
assert set(incoming) == allowed and all(incoming.values()), 'Incomplete dedicated media configuration'
assert incoming['S3_BUCKET'] == 'studio-balance-media'
assert incoming['S3_ENDPOINT'] == 'http://storage.home.cz:8333'
target = root / '.env.production'
lines = [line for line in target.read_text().splitlines() if line.split('=', 1)[0] not in allowed]
temporary = root / '.env.production.media-new'
with open(temporary, 'w') as out:
    os.chmod(temporary, 0o600)
    out.write('\n'.join(lines + [key+'='+value for key,value in incoming.items()])+'\n')
    out.flush()
    os.fsync(out.fileno())
os.replace(temporary, target)
PY
export APP_VERSION="$version"
compose=(docker compose --env-file "$task_root/.env.production" -f "$task_root/releases/$version/docker-compose.production.yml")
rollback() {
  cp -p "$backup_file" "$task_root/.env.production"
  "${compose[@]}" up -d --no-deps --no-build api
  echo 'Previous runtime configuration restored' >&2
}
if ! "${compose[@]}" up -d --no-deps --no-build api; then rollback; exit 1; fi
for _ in {1..30}; do
  if curl --fail --silent --max-time 5 http://127.0.0.1:4281/ready >/dev/null; then
    echo 'API is ready with the dedicated media configuration'
    exit 0
  fi
  sleep 2
done
rollback
exit 1
