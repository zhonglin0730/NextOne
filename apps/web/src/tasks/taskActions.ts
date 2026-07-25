import { WipLimitExceededError } from "@nextone/application";
import type { Task, TaskStatus } from "@nextone/domain";

import { notifyTasksChanged, taskApplicationService } from "./taskService";

export async function transitionWithWipConfirmation(
  taskId: string,
  status: TaskStatus,
  confirmOverride: (limit: number) => boolean,
): Promise<Task | undefined> {
  try {
    const task = await taskApplicationService.transition(taskId, status);
    notifyTasksChanged();
    return task;
  } catch (error) {
    if (!(error instanceof WipLimitExceededError)) {
      throw error;
    }

    if (!confirmOverride(error.limit)) {
      return undefined;
    }

    const task = await taskApplicationService.transition(taskId, status, {
      allowWipOverride: true,
    });
    notifyTasksChanged();
    return task;
  }
}
