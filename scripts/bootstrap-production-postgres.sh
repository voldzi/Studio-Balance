#!/usr/bin/env bash
set -euo pipefail

host="haproxy.home.cz"
port="5000"
admin_user="postgres"
database="studio_balance"

command -v psql >/dev/null || { echo "Install PostgreSQL client (psql) first." >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required." >&2; exit 1; }

read -r -p "PostgreSQL admin user [$admin_user]: " entered_user
admin_user="${entered_user:-$admin_user}"
read -rs -p "Password for $admin_user@$host: " admin_password
printf '\n'

app_password="$(openssl rand -hex 32)"
migrator_password="$(openssl rand -hex 32)"
connection="host=$host port=$port dbname=postgres user=$admin_user sslmode=prefer"

export PGPASSWORD="$admin_password"
trap 'unset PGPASSWORD admin_password app_password migrator_password' EXIT

database_exists="$(psql "$connection" -Atv ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname = '$database'")"
psql "$connection" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'studio_balance_app') THEN
    CREATE ROLE studio_balance_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '$app_password';
  ELSE
    ALTER ROLE studio_balance_app LOGIN PASSWORD '$app_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'studio_balance_migrator') THEN
    CREATE ROLE studio_balance_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '$migrator_password';
  ELSE
    ALTER ROLE studio_balance_migrator LOGIN PASSWORD '$migrator_password';
  END IF;
END \$\$;
SQL

if [[ "$database_exists" != 1 ]]; then
  psql "$connection" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $database OWNER studio_balance_migrator"
fi

database_connection="host=$host port=$port dbname=$database user=$admin_user sslmode=prefer"
psql "$database_connection" -v ON_ERROR_STOP=1 <<'SQL'
REVOKE ALL ON DATABASE studio_balance FROM PUBLIC;
GRANT CONNECT ON DATABASE studio_balance TO studio_balance_app, studio_balance_migrator;
GRANT USAGE ON SCHEMA public TO studio_balance_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO studio_balance_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO studio_balance_app;
ALTER DEFAULT PRIVILEGES FOR ROLE studio_balance_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO studio_balance_app;
ALTER DEFAULT PRIVILEGES FOR ROLE studio_balance_migrator IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO studio_balance_app;
SQL

printf '\nStore these once in the production secret store; they are not written to disk.\n'
printf 'DATABASE_URL (application): postgresql://studio_balance_app:%s@%s:%s/%s?sslmode=prefer\n' "$app_password" "$host" "$port" "$database"
printf 'DATABASE_URL (migrator):    postgresql://studio_balance_migrator:%s@%s:%s/%s?sslmode=prefer\n' "$migrator_password" "$host" "$port" "$database"
echo "Created or updated production roles and database through HAProxy."
