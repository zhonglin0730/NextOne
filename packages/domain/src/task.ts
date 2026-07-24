export const taskStatuses = [
  "INBOX",
  "READY",
  "DOING",
  "WAITING",
  "COMPLETED",
  "CANCELED",
] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export const taskVisibilities = ["ACTIVE", "SNOOZED", "SOMEDAY"] as const;

export type TaskVisibility = (typeof taskVisibilities)[number];

export const terminalTaskStatuses = new Set<TaskStatus>(["COMPLETED", "CANCELED"]);

const allowedTransitions: Readonly<Record<TaskStatus, ReadonlySet<TaskStatus>>> = {
  INBOX: new Set(["READY", "WAITING", "CANCELED"]),
  READY: new Set(["DOING", "WAITING", "COMPLETED", "CANCELED"]),
  DOING: new Set(["READY", "WAITING", "COMPLETED", "CANCELED"]),
  WAITING: new Set(["READY", "DOING", "COMPLETED", "CANCELED"]),
  COMPLETED: new Set(["READY"]),
  CANCELED: new Set(["READY"]),
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || allowedTransitions[from].has(to);
}

export interface Task {
  id: string;
  userId: string;
  areaId?: string;
  projectId?: string;
  title: string;
  note?: string;
  status: TaskStatus;
  visibility: TaskVisibility;
  deadlineAt?: string;
  reviewAt?: string;
  reviewedAt?: string;
  waitingFor?: string;
  waitingSince?: string;
  estimateMinutes?: number;
  energyLevel?: "LOW" | "MEDIUM" | "HIGH";
  sortKey: string;
  completedAt?: string;
  canceledAt?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
