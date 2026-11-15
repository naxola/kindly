import { createHmac } from 'node:crypto'

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) for tests: what an authenticator app would show. */
export function totp(base32Secret: string, at = new Date()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of base32Secret.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0')
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at.getTime() / 1000 / 30)))
  const hmac = createHmac('sha1', key).update(counter).digest()
  const offset = hmac[hmac.length - 1]! & 0xf
  const code =
    (((hmac[offset]! & 0x7f) << 24) |
      (hmac[offset + 1]! << 16) |
      (hmac[offset + 2]! << 8) |
      hmac[offset + 3]!) %
    1_000_000
  return String(code).padStart(6, '0')
}

/** The base32 secret inside an `otpauth://` URI. */
export const secretOf = (totpURI: string) => new URL(totpURI).searchParams.get('secret')!
