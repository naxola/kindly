#!/usr/bin/env bash
# Creates the application roles and databases (ADR 0002), with the pgvector extension.
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
-- The extensions schema (pgvector) is resolved without qualifying its types and operators.
ALTER ROLE app_migrator SET search_path = public, extensions;
ALTER ROLE app_user SET search_path = public, extensions;
ALTER ROLE app_platform SET search_path = public, extensions;
SQL

for db in ${APP_DATABASES}; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -c "CREATE DATABASE ${db} OWNER app_migrator"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${db}" <<SQL
REVOKE ALL ON DATABASE ${db} FROM PUBLIC;
GRANT CONNECT ON DATABASE ${db} TO app_user, app_platform;
-- pgvector (Kindly's knowledge search). Only a superuser can create it, so it is created here,
-- in its own schema: Prisma resets the public schema (shadow database, migrate dev) and would
-- drop it there. The migration only checks that it exists.
CREATE SCHEMA extensions AUTHORIZATION app_migrator;
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO app_user, app_platform;
ALTER SCHEMA public OWNER TO app_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
done
