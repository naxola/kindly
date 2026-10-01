import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Migrations run against the direct connection when one is available
// (Neon's pooled URL goes through PgBouncer in transaction mode, which
// drizzle-kit's migration locking doesn't reliably support — see
// docs/DECISIONS.md). Local Docker Postgres never sets
// DATABASE_URL_UNPOOLED, so this falls back to DATABASE_URL unchanged.
const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
