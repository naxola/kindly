// Tasks (Kindly CRM): things to do, optionally about a contact and assigned to a member.
export { TaskInput, UpdateTaskInput } from './schemas.ts'
export { isTaskPending } from './domain.ts'
export { taskVisibilityWhere } from './visibility.ts'
export {
  listTasks,
  getTask,
  createTask,
  updateTask,
  setTaskCompleted,
  listTaskActivity,
} from './service.ts'
export type { TaskView, TaskActivityView } from './service.ts'
