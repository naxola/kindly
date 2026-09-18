const POSTGRES_UNIQUE_VIOLATION = "23505";

/**
 * `postgres`'s own error has `.code`, but Drizzle wraps every driver error
 * in a `DrizzleQueryError` whose `.cause` is that original error — so the
 * code we care about is one level down, not on the error we actually catch.
 * Checked at both levels to be robust to either shape. Extracted from
 * src/modules/organizations/bootstrap.ts (docs/DECISIONS.md, "Fix: login
 * silencioso...") because PKG-003's conversation/message idempotency race
 * needs the exact same check.
 */
export function isPostgresUniqueViolation(error: unknown): boolean {
  return hasUniqueViolationCode(error) || hasUniqueViolationCode(getCause(error));
}

function hasUniqueViolationCode(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

function getCause(error: unknown): unknown {
  return typeof error === "object" && error !== null && "cause" in error
    ? (error as { cause?: unknown }).cause
    : undefined;
}
