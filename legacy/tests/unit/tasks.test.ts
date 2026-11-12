import { describe, expect, it } from "vitest";
import { isTaskPending } from "@/modules/tasks/domain";

describe("tasks (unit, no database)", () => {
  it("treats a task without completedAt as pending", () => {
    expect(isTaskPending({ completedAt: null })).toBe(true);
  });

  it("treats a task with completedAt as done", () => {
    expect(isTaskPending({ completedAt: new Date() })).toBe(false);
  });
});
