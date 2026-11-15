import { createHash } from 'node:crypto'

/**
 * Passwords found in known breaches are refused (ADR 0016). Have I Been Pwned's range API with
 * k-anonymity: only the first 5 characters of the SHA-1 leave the server, never the password and
 * never the whole hash; the comparison happens here. If the service does not answer in time the
 * password is ACCEPTED and `onUnavailable` is told (an external outage must not stop sign-ups).
 */
export type PasswordBreachCheck = (password: string) => Promise<boolean>

export function createPasswordBreachCheck({
  enabled,
  fetchImpl = fetch,
  timeoutMs = 3000,
  onUnavailable,
}: {
  enabled: boolean
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Gets the reason, never the password. */
  onUnavailable?: (reason: string) => void
}): PasswordBreachCheck {
  return async (password) => {
    if (!enabled) return false
    const hash = createHash('sha1').update(password).digest('hex').toUpperCase()
    const prefix = hash.slice(0, 5)
    const suffix = hash.slice(5)
    try {
      const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
        // Padding hides how many real matches a prefix has.
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.text()
      return body.split(/\r?\n/).some((line) => {
        const [candidate, count] = line.split(':')
        return candidate === suffix && Number(count) > 0
      })
    } catch (err) {
      onUnavailable?.(err instanceof Error ? err.message : 'unknown error')
      return false
    }
  }
}
