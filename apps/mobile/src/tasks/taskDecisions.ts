import { canTransitionTask, type TaskStatus } from "@nextone/domain";

const preferredDecisions: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  INBOX: ["READY", "WAITING", "CANCELED"],
  READY: ["DOING", "WAITING", "COMPLETED", "CANCELED"],
  DOING: ["COMPLETED", "WAITING", "READY", "CANCELED"],
  WAITING: ["READY", "DOING", "COMPLETED", "CANCELED"],
  COMPLETED: ["READY"],
  CANCELED: ["READY"],
};

export function taskDecisionsFor(status: TaskStatus): readonly TaskStatus[] {
  return preferredDecisions[status].filter((next) => canTransitionTask(status, next));
}
