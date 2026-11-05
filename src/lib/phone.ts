export type OptionalPhoneResult = { ok: true; value: string | null } | { ok: false };

/**
 * Normalizes a user-typed phone to E.164 (`+34600111222`). Separators
 * (spaces, dots, dashes, parentheses) are stripped; the country prefix is
 * required — guessing one would silently store the wrong number. An empty
 * value is valid and means "no phone".
 */
export function parseOptionalPhoneE164(input: string | null | undefined): OptionalPhoneResult {
  const compact = (input ?? "").replace(/[\s().-]/g, "");
  if (!compact) {
    return { ok: true, value: null };
  }
  return /^\+[1-9]\d{6,14}$/.test(compact) ? { ok: true, value: compact } : { ok: false };
}
