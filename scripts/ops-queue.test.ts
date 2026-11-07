import { describe, expect, it } from 'vitest'
import { formatSnapshot } from './ops-queue.ts'

describe('ops:queue', () => {
  it('prints counts, the oldest wait and how to retry failures', () => {
    const out = formatSnapshot({
      queues: [
        {
          name: 'identity.invitation-email',
          counts: { created: 2, retry: 1, failed: 1, completed: 5 },
          oldestWaitingSeconds: 1200,
        },
      ],
      recentFailures: [
        {
          name: 'identity.invitation-email',
          id: 'job-1',
          failedAt: new Date('2026-11-07T10:00:00Z'),
          attempts: 3,
          correlationId: 'corr-1',
          message: 'SMTP down',
        },
      ],
    })
    expect(out).toMatch(/identity\.invitation-email\s+3\s+0\s+1\s+5\s+20 min/)
    expect(out).toContain('pnpm ops:queue retry <queue> <id>')
    expect(out).toContain('job-1  attempts=3  correlationId=corr-1')
    expect(out).toContain('SMTP down')
  })

  it('says so when there are no jobs', () => {
    expect(formatSnapshot({ queues: [], recentFailures: [] })).toContain('(no jobs)')
  })
})
