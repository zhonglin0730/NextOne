import {
  ProjectApplicationService,
  ReviewApplicationService,
  TaskApplicationService,
} from "@nextone/application";

import { nextOneDatabase } from "../storage/indexedDb";
import { loadActionRules } from "../settings/preferences";

export const tasksChangedEvent = "nextone:tasks-changed";

const applicationDependencies = {
  database: nextOneDatabase,
  userId: "local-user",
  generateId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
  wipLimit: 3,
  loadRules: loadActionRules,
};

export const taskApplicationService = new TaskApplicationService(applicationDependencies);
export const projectApplicationService = new ProjectApplicationService(applicationDependencies);
export const reviewApplicationService = new ReviewApplicationService(applicationDependencies);

export function notifyTasksChanged(): void {
  window.dispatchEvent(new Event(tasksChangedEvent));
}
