/** A task is pending exactly when it has no `completedAt`: no status enum is invented. */
export const isTaskPending = (task: { completedAt: Date | null }): boolean =>
  task.completedAt === null
