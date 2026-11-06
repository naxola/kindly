#!/usr/bin/env bash
# Creates the application roles and databases (ADR 0002).
# Runs once, when the Postgres volume is initialized. Grants on schemas and tables
# are managed by the migrations (packages/database/prisma/migrations).
#   app_migrator: owns the databases and the schema; runs the migrations.
#   app_user:     application and worker; no BYPASSRLS, owns no tables.
#   app_platform: platform operations; BYPASSRLS; exceptional and audited use.
set -euo pipefail

: "${APP_MIGRATOR_PASSWORD:?}" "${APP_USER_PASSWORD:?}" "${APP_PLATFORM_PASSWORD:?}" "${APP_DATABASES:?}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE app_migrator LOGIN PASSWORD '${APP_MIGRATOR_PASSWORD}' NOSUPERUSER NOCREATEROLE NOBYPASSRLS;
CREATE ROLE app_user     LOGIN PASSWORD '${APP_USER_PASSWORD}'     NOSUPERUSER NOCREATEROLE NOBYPASSRLS;
CREATE ROLE app_platform LOGIN PASSWORD '${APP_PLATFORM_PASSWORD}' NOSUPERUSER NOCREATEROLE BYPASSRLS;
SQL

for db in ${APP_DATABASES}; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -c "CREATE DATABASE ${db} OWNER app_migrator"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${db}" <<SQL
REVOKE ALL ON DATABASE ${db} FROM PUBLIC;
GRANT CONNECT ON DATABASE ${db} TO app_user, app_platform;
ALTER SCHEMA public OWNER TO app_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
done
