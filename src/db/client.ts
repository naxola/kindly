import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and point it at your " +
      "local PostgreSQL instance (see docker-compose.yml).",
  );
}

/**
 * Cached on `globalThis` in every environment, not just dev. The original
 * comment here only worried about Next.js dev-mode HMR re-evaluating this
 * module — true, but PKG-004 found a second, more important reason: under
 * Turbopack, a real `next start` production server gives different
 * route/page/server-action chunks their *own* separate instantiation of
 * this module (confirmed empirically while debugging src/instrumentation.ts
 * — see docs/DECISIONS.md, bloque "PKG-004"). Guarding the cache to
 * non-production meant every chunk that touched the database opened its
 * *own* separate `max: 10` connection pool, and enough of them opening at
 * once against a freshly booted server intermittently starved real
 * requests of a connection — the actual cause of the E2E flakiness this
 * package tracked down (register → self-heal Organization bootstrap
 * occasionally finding nothing, even though nothing about the bootstrap
 * logic itself was wrong). `globalThis` is what every chunk in the same
 * Node process actually shares, in dev and in production alike.
 */
declare global {
  var __kindlyPostgresClient: ReturnType<typeof postgres> | undefined;
}

global.__kindlyPostgresClient ??= postgres(databaseUrl, {
  // Keep the local dev pool small; tune per-environment later if needed.
  max: 10,
});

export const db = drizzle(global.__kindlyPostgresClient, { schema });
