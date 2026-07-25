import { ProjectApplicationService, TaskApplicationService } from "@nextone/application";

import { nextOneDatabase } from "../storage/indexedDb";

export const tasksChangedEvent = "nextone:tasks-changed";

const applicationDependencies = {
  database: nextOneDatabase,
  userId: "local-user",
  generateId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
  wipLimit: 3,
};

export const taskApplicationService = new TaskApplicationService(applicationDependencies);
export const projectApplicationService = new ProjectApplicationService(applicationDependencies);

export function notifyTasksChanged(): void {
  window.dispatchEvent(new Event(tasksChangedEvent));
}
