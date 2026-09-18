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
 * Next.js reloads modules on every change in dev mode, which would open a
 * new PostgreSQL connection pool each time without this cache. Standard
 * pattern for `postgres.js` + Next.js.
 */
declare global {
  var __kindlyPostgresClient: ReturnType<typeof postgres> | undefined;
}

const client =
  global.__kindlyPostgresClient ??
  postgres(databaseUrl, {
    // Keep the local dev pool small; tune per-environment later if needed.
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  global.__kindlyPostgresClient = client;
}

export const db = drizzle(client, { schema });
