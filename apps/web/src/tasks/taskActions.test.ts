import { WipLimitExceededError } from "@nextone/application";
import type { Task } from "@nextone/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../today/date", () => ({
  getLocalDate: () => "2026-08-10",
  getTimeZone: () => "Asia/Shanghai",
}));

vi.mock("./taskService", () => ({
  notifyTasksChanged: vi.fn(),
  taskApplicationService: {
    addToToday: vi.fn(),
    removeFromToday: vi.fn(),
    startTaskForToday: vi.fn(),
    transition: vi.fn(),
  },
}));

import { notifyTasksChanged, taskApplicationService } from "./taskService";
import { transitionWithWipConfirmation } from "./taskActions";

const task: Task = {
  id: "task-1",
  userId: "local-user",
  title: "验证开始流程",
  status: "READY",
  visibility: "ACTIVE",
  sortKey: "2026-08-10T08:00:00.000Z",
  createdAt: "2026-08-10T08:00:00.000Z",
  updatedAt: "2026-08-10T08:00:00.000Z",
  revision: 1,
};

describe("task transition side effects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(taskApplicationService.transition).mockImplementation(async (_taskId, status) => ({
      ...task,
      status,
    }));
    vi.mocked(taskApplicationService.startTaskForToday).mockResolvedValue({
      ...task,
      status: "DOING",
    });
  });

  it("adds a task to today whenever it starts", async () => {
    await transitionWithWipConfirmation(task.id, "DOING", () => false);

    expect(taskApplicationService.startTaskForToday).toHaveBeenCalledWith(
      task.id,
      "2026-08-10",
      "Asia/Shanghai",
      {},
    );
    expect(taskApplicationService.transition).not.toHaveBeenCalled();
    expect(taskApplicationService.removeFromToday).not.toHaveBeenCalled();
    expect(notifyTasksChanged).toHaveBeenCalledOnce();
  });

  it("removes a task from today when it starts waiting", async () => {
    await transitionWithWipConfirmation(task.id, "WAITING", () => false);

    expect(taskApplicationService.removeFromToday).toHaveBeenCalledWith(task.id, "2026-08-10");
    expect(taskApplicationService.addToToday).not.toHaveBeenCalled();
    expect(notifyTasksChanged).toHaveBeenCalledOnce();
  });

  it("retries the atomic start with an explicit WIP override", async () => {
    vi.mocked(taskApplicationService.startTaskForToday)
      .mockRejectedValueOnce(new WipLimitExceededError(3, 3))
      .mockResolvedValueOnce({ ...task, status: "DOING" });

    await transitionWithWipConfirmation(task.id, "DOING", () => true);

    expect(taskApplicationService.startTaskForToday).toHaveBeenNthCalledWith(
      1,
      task.id,
      "2026-08-10",
      "Asia/Shanghai",
      {},
    );
    expect(taskApplicationService.startTaskForToday).toHaveBeenNthCalledWith(
      2,
      task.id,
      "2026-08-10",
      "Asia/Shanghai",
      { allowWipOverride: true },
    );
    expect(notifyTasksChanged).toHaveBeenCalledOnce();
  });
});
