"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { createTask, updateTask, getTask } from "@/modules/tasks/service";

function readTaskFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    throw new Error("Title is required.");
  }
  const dueDateRaw = (formData.get("dueDate") as string | null)?.trim();

  return {
    title,
    description: (formData.get("description") as string | null)?.trim() || null,
    contactId: (formData.get("contactId") as string | null) || null,
    caseId: (formData.get("caseId") as string | null) || null,
    assignedTo: (formData.get("assignedTo") as string | null) || null,
    dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
  };
}

export async function createTaskAction(formData: FormData) {
  const member = await requireCurrentOrganizationMember();
  const fields = readTaskFields(formData);

  await createTask({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    ...fields,
  });

  revalidatePath("/tasks");
}

export async function updateTaskAction(taskId: string, formData: FormData) {
  const member = await requireCurrentOrganizationMember();
  const fields = readTaskFields(formData);
  const completed = formData.get("completed") === "on";

  const updated = await updateTask({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    taskId,
    completed,
    ...fields,
  });

  if (!updated) {
    throw new Error("Task not found.");
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

/** Used by the one-click "mark complete" button in the task list. */
export async function toggleTaskCompletedAction(taskId: string) {
  const member = await requireCurrentOrganizationMember();
  const task = await getTask(member.organizationId, taskId);
  if (!task) {
    throw new Error("Task not found.");
  }

  await updateTask({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    taskId,
    title: task.title,
    description: task.description,
    contactId: task.contactId,
    caseId: task.caseId,
    assignedTo: task.assignedTo,
    dueDate: task.dueDate,
    completed: task.completedAt === null,
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}
