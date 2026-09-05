#!/usr/bin/env bash
# Interactive, Studio Balance only. Run on docker.home.cz as the deployment owner.
set -euo pipefail
task_root=/home/voldzi/deployments/studio-balance
[[ -f "$task_root/.env.production" ]] || { echo 'Spusťte skript na docker.home.cz.' >&2; exit 1; }
exec 9>"$task_root/.production-operation.lock"
flock -n 9 || { echo 'Právě probíhá nasazení. Spusťte skript po jeho dokončení.' >&2; exit 1; }
current_image="$(docker inspect --format '{{.Config.Image}}' studio-balance-production-api-1)"
version="${current_image##*:}"
[[ "$version" =~ ^[0-9a-f]{7,40}$ ]] || exit 1
release="$task_root/releases/$version"
[[ -f "$release/infra/postgres/migrations/0018_studio_opening.sql" ]] || { echo 'Nejprve musí být nasazená verze s přepínačem otevření.' >&2; exit 1; }
backup_file="$task_root/.env.production.before-registration-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$task_root/.env.production" "$backup_file"
chmod 600 "$backup_file"
cd "$task_root"
python3 "$task_root/provision-registration-control.py" --production
export APP_VERSION="$version"
compose=(docker compose --env-file "$task_root/.env.production" -f "$release/docker-compose.production.yml")
rollback() {
  cp -p "$backup_file" "$task_root/.env.production"
  "${compose[@]}" up -d --no-deps --no-build api
  echo 'Předchozí konfigurace aplikace obnovena. Registrace v Keycloaku zůstávají vypnuté; spusťte skript znovu.' >&2
}
if ! "${compose[@]}" up -d --no-deps --no-build api; then rollback; exit 1; fi
for _ in {1..30}; do
  if curl --fail --silent --max-time 5 http://127.0.0.1:4281/ready >/dev/null; then
    # Reconcile the already persisted closed state using only the dedicated account.
    if docker exec studio-balance-production-api-1 node --input-type=module -e '
      import "reflect-metadata";
      import { DatabaseService } from "./dist/database/database.service.js";
      import { RuntimeConfigService } from "./dist/config/runtime-config.js";
      import { RegistrationControl, StudioStatusService } from "./dist/studio/studio-status.service.js";
      const config=new RuntimeConfigService(), db=new DatabaseService(config);
      const service=new StudioStatusService(db,new RegistrationControl(config));
      try {
        const status=await service.update(false,"registration-setup","registration-setup");
        if(status.open || !status.registrationSynced) process.exitCode=1;
        else console.log("Hotovo: studio je zavřené, registrace a rezervace jsou vypnuté. Odblokování funguje v Administrace → Přehled → Otevření studia.");
      } catch { console.error("Synchronizace registrací nebyla potvrzena. Spusťte skript znovu."); process.exitCode=1; }
      finally { await db.onModuleDestroy(); }
    '; then exit 0; fi
    exit 1
  fi
  sleep 2
done
rollback
exit 1
