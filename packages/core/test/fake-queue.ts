import type { EnqueueOptions, JobDefinition, JobQueue } from '../src/index.ts'

export interface Enqueued {
  job: string
  payload: unknown
  options: EnqueueOptions
}

/** Records what use cases enqueue. Real pg-boss is covered in packages/adapters. */
export class RecordingQueue implements JobQueue {
  readonly jobs: Enqueued[] = []

  enqueue(_tx: unknown, job: JobDefinition, payload: unknown, options: EnqueueOptions) {
    this.jobs.push({ job: job.name, payload: job.schema.parse(payload), options })
    return Promise.resolve({ id: `${job.name}:${options.idempotencyKey}`, created: true })
  }

  of(name: string) {
    return this.jobs.filter((j) => j.job === name)
  }
}
