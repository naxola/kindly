/**
 * Pure domain logic for Task, with no I/O and no `server-only` guard on
 * purpose — this needs to be importable from plain unit tests
 * (tests/unit/tasks.test.ts) without pulling in the database client.
 */

/** A task is pending exactly when it has no `completedAt`. */
export function isTaskPending(task: { completedAt: Date | null }): boolean {
  return task.completedAt === null;
}
