# syntax=docker/dockerfile:1.7
# Images of the template (ADR 0006). One file, one target per process:
#   docker build --target web|site|worker|migrate|postgres .
# CI builds them once and staging pulls them (infra/staging/compose.yml).

ARG NODE_IMAGE=node:24.21.0-trixie-slim
ARG POSTGRES_IMAGE=postgres:18.6-trixie

# ---------------------------------------------------------------- build (shared)
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_HOME=/corepack \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=true
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate && chmod -R a+rX /corepack
WORKDIR /app

FROM base AS build
# Dependencies first (cached while the lockfile does not change).
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
# prisma.config.ts requires the migrator URL even to generate the client (it does not connect).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline \
    && DATABASE_MIGRATOR_URL=postgresql://build@localhost:5432/build pnpm db:generate

FROM build AS build-web
# The typed API client is generated from the routes, then the standalone server is built.
# No runtime variable is needed (nor present) at build time.
RUN pnpm api:generate && pnpm --filter @saas/web build

FROM build AS build-site
# The public site is prerendered: its URLs are fixed at build time (one image per environment).
ARG SITE_URL
ARG APP_URL
ARG PLAUSIBLE_DOMAIN
ARG FACEBOOK_DOMAIN_VERIFICATION
RUN test -n "$SITE_URL" && test -n "$APP_URL" || (echo "SITE_URL and APP_URL build args are required" && exit 1)
RUN SITE_URL="$SITE_URL" APP_URL="$APP_URL" PLAUSIBLE_DOMAIN="$PLAUSIBLE_DOMAIN" FACEBOOK_DOMAIN_VERIFICATION="$FACEBOOK_DOMAIN_VERIFICATION" \
    pnpm --filter @saas/site build

FROM build AS build-worker
# Production dependencies of the worker, from the lockfile, in a flat node_modules
# (the bundle in dist/ already contains the workspace packages).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @saas/worker build \
    && mkdir /out && cp pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json /out/ \
    && find apps packages -maxdepth 2 -name package.json -exec cp --parents {} /out/ \; \
    && cd /out && pnpm install --prod --frozen-lockfile --offline --filter "@saas/worker..." \
       --config.node-linker=hoisted --ignore-scripts \
    && cp -r /app/apps/worker/dist /out/apps/worker/dist

# ---------------------------------------------------------------- runtime images
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM runtime AS web
COPY --from=build-web --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build-web --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]

FROM runtime AS site
COPY --from=build-site --chown=node:node /app/apps/site/.next/standalone ./
COPY --from=build-site --chown=node:node /app/apps/site/.next/static ./apps/site/.next/static
USER node
ENV PORT=3001 HOSTNAME=0.0.0.0
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/es').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/site/server.js"]

FROM runtime AS worker
COPY --from=build-worker --chown=node:node /out ./
WORKDIR /app/apps/worker
USER node
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.WORKER_HEALTH_PORT||3002)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]

# One-shot job of every deployment: migrations (role app_migrator) + pg-boss tables
# (role app_user). It carries the build tooling, so it is larger; it never serves traffic.
FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["sh", "infra/docker/migrate.sh"]

# Postgres with the application roles created on first start (ADR 0002) and pgvector
# (Kindly, docs/DECISIONS.md "pgvector"). The package comes from the PGDG repository that the
# official image already configures; its version is the one PGDG publishes for this Postgres.
FROM ${POSTGRES_IMAGE} AS postgres
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-${PG_MAJOR}-pgvector \
    && rm -rf /var/lib/apt/lists/*
COPY infra/postgres/init/ /docker-entrypoint-initdb.d/
