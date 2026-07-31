import {
  ProjectApplicationService,
  ReviewApplicationService,
  TaskApplicationService,
  WorkPackageApplicationService,
} from "@nextone/application";

import { nextOneDatabase } from "../storage/indexedDb";
import { loadActionRules } from "../settings/preferences";
import { announceLocalDataChanged, tasksChangedEvent } from "../sync/dataChangeEvents";

export { tasksChangedEvent };

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
export const workPackageApplicationService = new WorkPackageApplicationService(
  applicationDependencies,
);
export const reviewApplicationService = new ReviewApplicationService(applicationDependencies);

export function notifyTasksChanged(): void {
  announceLocalDataChanged();
}
