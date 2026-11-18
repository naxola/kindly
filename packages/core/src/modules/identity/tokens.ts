import { createHash, randomBytes } from 'node:crypto'

/** Random URL-safe token (256 bits). Only its hash is stored. */
export const newToken = (): string => randomBytes(32).toString('base64url')

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')
