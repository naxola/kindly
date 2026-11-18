-- pgvector (Kindly's knowledge search; docs/DECISIONS.md, "pgvector").
-- Only a superuser can create the extension, so infra/postgres/init/00-roles.sh creates it when
-- the database is created, in the `extensions` schema (Prisma resets `public`, not this one).
-- This statement is a no-op where it is installed and fails with a clear error where it is
-- not: on a database that already existed, run once as a superuser:
--   CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION app_migrator;
--   CREATE EXTENSION vector SCHEMA extensions;
--   GRANT USAGE ON SCHEMA extensions TO app_user, app_platform;
--   ALTER ROLE app_migrator|app_user|app_platform SET search_path = public, extensions;
CREATE EXTENSION IF NOT EXISTS vector;
