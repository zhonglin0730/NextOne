import { describe, expect, it } from "vitest";

import {
  canTransitionTask,
  createInboxTask,
  InvalidTaskTransitionError,
  transitionTask,
} from "../src/task";

describe("task state transitions", () => {
  it("allows a ready task to start", () => {
    expect(canTransitionTask("READY", "DOING")).toBe(true);
  });

  it("allows an active task to move to waiting", () => {
    expect(canTransitionTask("DOING", "WAITING")).toBe(true);
  });

  it("requires an explicit reopen path for completed tasks", () => {
    expect(canTransitionTask("COMPLETED", "DOING")).toBe(false);
    expect(canTransitionTask("COMPLETED", "READY")).toBe(true);
  });

  it("creates a trimmed inbox task from only a title", () => {
    const task = createInboxTask({
      id: "task-1",
      userId: "local-user",
      title: "  整理收件箱  ",
      now: "2026-07-24T10:00:00.000Z",
    });

    expect(task.title).toBe("整理收件箱");
    expect(task.status).toBe("INBOX");
    expect(task.visibility).toBe("ACTIVE");
    expect(task.revision).toBe(1);
  });

  it("records terminal timestamps without physically deleting the task", () => {
    const task = createInboxTask({
      id: "task-1",
      userId: "local-user",
      title: "不再继续的事项",
      now: "2026-07-24T10:00:00.000Z",
    });

    const canceled = transitionTask(task, "CANCELED", "2026-07-24T11:00:00.000Z");

    expect(canceled.status).toBe("CANCELED");
    expect(canceled.canceledAt).toBe("2026-07-24T11:00:00.000Z");
    expect(canceled.deletedAt).toBeUndefined();
    expect(canceled.revision).toBe(2);
  });

  it("clears waiting context when external work resumes", () => {
    const ready = transitionTask(
      createInboxTask({
        id: "task-1",
        userId: "local-user",
        title: "等待客户确认",
        now: "2026-07-24T10:00:00.000Z",
      }),
      "READY",
      "2026-07-24T10:05:00.000Z",
    );
    const waiting = {
      ...transitionTask(ready, "WAITING", "2026-07-24T10:10:00.000Z"),
      waitingFor: "客户确认报价",
      reviewAt: "2026-07-25",
    };

    const resumed = transitionTask(waiting, "DOING", "2026-07-24T11:00:00.000Z");

    expect(resumed.waitingSince).toBeUndefined();
    expect(resumed.waitingFor).toBeUndefined();
    expect(resumed.reviewAt).toBeUndefined();
  });

  it("rejects illegal transitions", () => {
    const task = {
      ...createInboxTask({
        id: "task-1",
        userId: "local-user",
        title: "已完成事项",
        now: "2026-07-24T10:00:00.000Z",
      }),
      status: "COMPLETED" as const,
    };

    expect(() => transitionTask(task, "DOING", "2026-07-24T11:00:00.000Z")).toThrow(
      InvalidTaskTransitionError,
    );
  });
});
