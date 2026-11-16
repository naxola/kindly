/**
 * Suppression list of the email (ADR 0017). The table only stores hashes, so the address is given
 * here and hashed on the spot.
 *
 *   pnpm ops:email status <email>       why an address is suppressed (if it is)
 *   pnpm ops:email unsuppress <email>   lift its suppressions (it can be written to again)
 */
import { emailSuppressions, removeEmailSuppression } from '@saas/adapters/email'
import { createDb } from '@saas/database'
import { config } from 'dotenv'

config({ path: new URL('../.env', import.meta.url).pathname, quiet: true })

async function main() {
  const [command, email] = process.argv.slice(2)
  if ((command !== 'status' && command !== 'unsuppress') || !email?.includes('@')) {
    console.error('Usage: pnpm ops:email status|unsuppress <email>')
    process.exit(2)
  }
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  const db = createDb({ connectionString: url, max: 1 })
  try {
    if (command === 'status') {
      const reasons = await emailSuppressions(db, email)
      console.log(reasons.length ? `Suppressed: ${reasons.join(', ')}` : 'Not suppressed')
    } else {
      const removed = await removeEmailSuppression(db, email)
      console.log(removed ? `Removed ${removed} suppression(s)` : 'It was not suppressed')
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
