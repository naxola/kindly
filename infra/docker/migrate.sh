#!/bin/sh
# Deployment step (migrate image): schema migrations, then the queue tables.
# Both are idempotent; the web and the worker start only after this succeeds.
set -eu
: "${DATABASE_MIGRATOR_URL:?}" "${DATABASE_URL:?}"
echo "→ migrations"
(cd packages/database && pnpm exec prisma migrate deploy)
echo "→ queue tables"
pnpm exec tsx scripts/install-queue.ts
echo "✔ database ready"
