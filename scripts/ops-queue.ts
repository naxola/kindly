/**
 * Queue panel for the operator (ADR 0008), from a terminal with access to the database:
 *   pnpm ops:queue                    state of every queue and the latest final failures
 *   pnpm ops:queue retry <queue> <id> puts a failed job back in its queue
 * It uses the application role (DATABASE_URL), the owner of the pg-boss tables.
 */
import { config } from 'dotenv'
import { createBoss, queueSnapshot, type QueueSnapshot } from '@saas/adapters/queue'

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
    const [command, name, id] = process.argv.slice(2)
    if (command === 'retry') {
      if (!name || !id) throw new Error('Usage: pnpm ops:queue retry <queue> <id>')
      await boss.retry(name, id)
      console.log(`✔ ${name} ${id} queued again`)
    } else {
      console.log(formatSnapshot(await queueSnapshot(boss)))
    }
  } finally {
    await boss.stop({ graceful: false })
  }
}
