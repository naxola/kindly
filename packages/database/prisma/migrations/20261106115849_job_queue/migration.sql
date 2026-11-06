-- pg-boss schema (ADR 0004). pg-boss creates its own tables as app_user when the worker
-- starts (role `worker`: migrate). The schema is outside `public`, so it has no tenant RLS:
-- the worker is trusted and rebuilds the tenant context from each job's organizationId.
CREATE SCHEMA IF NOT EXISTS pgboss;
GRANT USAGE, CREATE ON SCHEMA pgboss TO app_user;
GRANT USAGE ON SCHEMA pgboss TO app_platform;
