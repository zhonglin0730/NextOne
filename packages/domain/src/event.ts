import type { TaskStatus, TaskVisibility } from "./task";

export const taskEventTypes = [
  "CREATED",
  "CLARIFIED",
  "STATUS_CHANGED",
  "VISIBILITY_CHANGED",
  "ADDED_TO_DAILY_PLAN",
  "REMOVED_FROM_DAILY_PLAN",
  "DEADLINE_CHANGED",
  "REVIEW_AT_CHANGED",
  "WAITING_STARTED",
  "WAITING_ENDED",
  "COMPLETED",
  "CANCELED",
  "REOPENED",
  "WIP_LIMIT_OVERRIDDEN",
] as const;

export type TaskEventType = (typeof taskEventTypes)[number];

export interface TaskEventMetadata {
  fromStatus?: TaskStatus;
  toStatus?: TaskStatus;
  fromVisibility?: TaskVisibility;
  toVisibility?: TaskVisibility;
  fieldNames?: readonly string[];
}

export interface TaskEvent {
  id: string;
  userId: string;
  taskId: string;
  type: TaskEventType;
  occurredAt: string;
  metadata: TaskEventMetadata;
}

export function eventTypeForStatusTransition(from: TaskStatus, to: TaskStatus): TaskEventType {
  if (to === "COMPLETED") {
    return "COMPLETED";
  }

  if (to === "CANCELED") {
    return "CANCELED";
  }

  if (from === "COMPLETED" || from === "CANCELED") {
    return "REOPENED";
  }

  if (to === "WAITING") {
    return "WAITING_STARTED";
  }

  if (from === "WAITING") {
    return "WAITING_ENDED";
  }

  if (from === "INBOX" && to === "READY") {
    return "CLARIFIED";
  }

  return "STATUS_CHANGED";
}
