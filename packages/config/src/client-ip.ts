import { isIP } from 'node:net'

/** Anything with a header lookup: `Headers`, or a Hono/Next request's `headers`. */
export interface HeaderReader {
  get(name: string): string | null | undefined
}

/**
 * Client IP taken only from the one header the platform in front of the app controls
 * (`TRUSTED_IP_HEADER`, e.g. `cf-connecting-ip` behind Cloudflare). `x-forwarded-for` is
 * written by the client, so it is never read. Without a trusted header, or when its value is
 * not an IP address, the IP is unknown (`null`).
 */
export function clientIp(headers: HeaderReader, trustedHeader: string | undefined): string | null {
  if (!trustedHeader) return null
  const value = headers.get(trustedHeader)?.split(',')[0]?.trim()
  return value && isIP(value) ? value : null
}

/** Rate-limit key of a client: its IP, or one shared bucket when the IP is unknown. */
export const clientKey = (ip: string | null) => ip ?? 'unknown-ip'
