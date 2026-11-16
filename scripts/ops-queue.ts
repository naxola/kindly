/**
 * Queue panel for the operator (ADR 0008), from a terminal with access to the database:
 *   pnpm ops:queue                    state of every queue and the latest final failures
 *   pnpm ops:queue retry <queue> <id> [--force]
 *                                     puts a failed job back in its queue. A charge left in
 *                                     CHARGING is refused unless --force (check the payment
 *                                     provider first: see docs/operations.md)
 * It uses the application role (DATABASE_URL), the owner of the pg-boss tables.
 */
import { config } from 'dotenv'
import { createBoss, queueSnapshot, type QueueSnapshot } from '@saas/adapters/queue'
import { createDb, withTenant } from '@saas/database'

export const CHARGE_JOB = 'billing.charge-period'

/**
 * What to do when retrying a charge job (ADR 0014). CHARGING means the provider may already
 * have charged: refuse unless the operator checked it and passes `--force`, which puts the
 * period back to PENDING_CHARGE so the job can charge it.
 */
export function chargeRetryDecision(status: string, force: boolean) {
  if (status !== 'CHARGING') return 'retry' as const
  return force ? ('reset-and-retry' as const) : ('refuse' as const)
}

export function formatSnapshot(s: QueueSnapshot): string {
  const lines = ['Queue                               waiting  active  failed  done   oldest wait']
  for (const q of s.queues) {
    const c = q.counts
    const waiting = (c.created ?? 0) + (c.retry ?? 0)
    const oldest =
      q.oldestWaitingSeconds === null ? '-' : `${Math.round(q.oldestWaitingSeconds / 60)} min`
    lines.push(
      `${q.name.padEnd(36)}${String(waiting).padStart(7)}${String(c.active ?? 0).padStart(8)}${String(c.failed ?? 0).padStart(8)}${String(c.completed ?? 0).padStart(6)}   ${oldest}`,
    )
  }
  if (s.queues.length === 0) lines.push('(no jobs)')
  if (s.recentFailures.length > 0) {
    lines.push('', 'Latest final failures (retry with: pnpm ops:queue retry <queue> <id>)')
    for (const f of s.recentFailures) {
      lines.push(
        `- ${f.failedAt?.toISOString() ?? '?'}  ${f.name}  ${f.id}  attempts=${f.attempts}  correlationId=${f.correlationId ?? '-'}`,
        `    ${f.message ?? '(no message)'}`,
      )
    }
  }
  return lines.join('\n')
}

if (import.meta.main) {
  config({ path: new URL('../.env', import.meta.url).pathname, quiet: true })
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  const boss = createBoss({ connectionString: url, role: 'producer' })
  await boss.start()
  try {
    const args = process.argv.slice(2)
    const force = args.includes('--force')
    const [command, name, id] = args.filter((a) => a !== '--force')
    if (command === 'retry') {
      if (!name || !id) throw new Error('Usage: pnpm ops:queue retry <queue> <id> [--force]')
      if (name === CHARGE_JOB) {
        const job = await boss.getJobById(name, id)
        const p = (job?.data as { payload?: { organizationId?: string; periodId?: string } })
          ?.payload
        if (!p?.organizationId || !p.periodId) throw new Error('Charge job not found')
        const db = createDb({ connectionString: url })
        try {
          const period = await withTenant(db, p.organizationId, (tx) =>
            tx.billingPeriod.findUnique({ where: { id: p.periodId } }),
          )
          const decision = chargeRetryDecision(period?.status ?? 'MISSING', force)
          if (decision === 'refuse') {
            throw new Error(
              `Period ${p.periodId} is CHARGING: the provider may already have charged it. ` +
                'Check the provider; if it did NOT charge, retry with --force; if it did, ' +
                'record it by hand (docs/operations.md).',
            )
          }
          if (decision === 'reset-and-retry') {
            await withTenant(db, p.organizationId, (tx) =>
              tx.billingPeriod.update({
                where: { id: p.periodId! },
                data: { status: 'PENDING_CHARGE' },
              }),
            )
          }
        } finally {
          await db.$disconnect()
        }
      }
      await boss.retry(name, id)
      console.log(`✔ ${name} ${id} queued again`)
    } else {
      console.log(formatSnapshot(await queueSnapshot(boss)))
    }
  } finally {
    await boss.stop({ graceful: false })
  }
}
