/**
 * Recognizes "the database is behind the code" errors: Postgres `42P01`
 * (relation does not exist) and `42703` (column does not exist). This project
 * does not migrate on deploy (`docs/DECISIONS.md`), so a deploy that ships a
 * new migration runs against an old database until someone applies it by
 * hand. Such a page should say so instead of answering a generic 500.
 * Pure: drizzle wraps the driver error, so the code can sit on `cause`.
 */
const SCHEMA_BEHIND_CODES = new Set(["42P01", "42703"]);

export function isSchemaBehindError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && SCHEMA_BEHIND_CODES.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
