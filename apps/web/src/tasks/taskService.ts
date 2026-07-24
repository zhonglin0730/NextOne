import { TaskApplicationService } from "@nextone/application";

import { nextOneDatabase } from "../storage/indexedDb";

export const tasksChangedEvent = "nextone:tasks-changed";

export const taskApplicationService = new TaskApplicationService({
  database: nextOneDatabase,
  userId: "local-user",
  generateId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
});

export function notifyTasksChanged(): void {
  window.dispatchEvent(new Event(tasksChangedEvent));
}
