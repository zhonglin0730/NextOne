import { WipLimitExceededError } from "@nextone/application";
import type { Task, TaskStatus } from "@nextone/domain";

import { getLocalDate, getTimeZone } from "../today/date";
import { notifyTasksChanged, taskApplicationService } from "./taskService";

export async function transitionWithWipConfirmation(
  taskId: string,
  status: TaskStatus,
  confirmOverride: (limit: number) => boolean,
  notify = true,
): Promise<Task | undefined> {
  const finishTransition = async (task: Task): Promise<Task> => {
    if (status === "WAITING") {
      await taskApplicationService.removeFromToday(taskId, getLocalDate());
    }
    if (notify) {
      notifyTasksChanged();
    }
    return task;
  };

  const runTransition = (allowWipOverride = false) =>
    status === "DOING"
      ? taskApplicationService.startTaskForToday(taskId, getLocalDate(), getTimeZone(), {
          ...(allowWipOverride ? { allowWipOverride: true } : {}),
        })
      : taskApplicationService.transition(taskId, status, {
          ...(allowWipOverride ? { allowWipOverride: true } : {}),
        });

  try {
    const task = await runTransition();
    return finishTransition(task);
  } catch (error) {
    if (!(error instanceof WipLimitExceededError)) {
      throw error;
    }

    if (!confirmOverride(error.limit)) {
      return undefined;
    }

    const task = await runTransition(true);
    return finishTransition(task);
  }
}
