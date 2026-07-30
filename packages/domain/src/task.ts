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

export const allowedTaskTransitions: Readonly<Record<TaskStatus, ReadonlySet<TaskStatus>>> = {
  INBOX: new Set(["READY", "WAITING", "CANCELED"]),
  READY: new Set(["DOING", "WAITING", "COMPLETED", "CANCELED"]),
  DOING: new Set(["READY", "WAITING", "COMPLETED", "CANCELED"]),
  WAITING: new Set(["READY", "DOING", "COMPLETED", "CANCELED"]),
  COMPLETED: new Set(["READY"]),
  CANCELED: new Set(["READY"]),
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || allowedTaskTransitions[from].has(to);
}

export class InvalidTaskTransitionError extends Error {
  constructor(
    public readonly from: TaskStatus,
    public readonly to: TaskStatus,
  ) {
    super(`Task cannot transition from ${from} to ${to}`);
    this.name = "InvalidTaskTransitionError";
  }
}

export type EnergyLevel = "LOW" | "MEDIUM" | "HIGH";
export type TaskKind = "ACTION" | "WORK_PACKAGE";

export interface Task {
  id: string;
  userId: string;
  areaId?: string;
  projectId?: string;
  parentTaskId?: string;
  kind?: TaskKind;
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
  energyLevel?: EnergyLevel;
  sortKey: string;
  completedAt?: string;
  canceledAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  revision: number;
}

export interface CreateTaskInput {
  id: string;
  userId: string;
  title: string;
  now: string;
  note?: string;
  areaId?: string;
  projectId?: string;
  parentTaskId?: string;
  kind?: TaskKind;
  deadlineAt?: string;
  reviewAt?: string;
  estimateMinutes?: number;
  energyLevel?: EnergyLevel;
}

export function createInboxTask(input: CreateTaskInput): Task {
  const title = input.title.trim();

  if (title.length === 0) {
    throw new Error("Task title is required");
  }

  return {
    id: input.id,
    userId: input.userId,
    title,
    kind: input.kind ?? "ACTION",
    status: "INBOX",
    visibility: "ACTIVE",
    sortKey: input.now,
    createdAt: input.now,
    updatedAt: input.now,
    revision: 1,
    ...(input.note === undefined || input.note.trim().length === 0
      ? {}
      : { note: input.note.trim() }),
    ...(input.areaId === undefined ? {} : { areaId: input.areaId }),
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    ...(input.parentTaskId === undefined ? {} : { parentTaskId: input.parentTaskId }),
    ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt }),
    ...(input.reviewAt === undefined ? {} : { reviewAt: input.reviewAt }),
    ...(input.estimateMinutes === undefined ? {} : { estimateMinutes: input.estimateMinutes }),
    ...(input.energyLevel === undefined ? {} : { energyLevel: input.energyLevel }),
  };
}

export function transitionTask(task: Task, to: TaskStatus, now: string): Task {
  if (!canTransitionTask(task.status, to)) {
    throw new InvalidTaskTransitionError(task.status, to);
  }

  if (task.status === to) {
    return task;
  }

  const {
    waitingSince: _waitingSince,
    completedAt: _completedAt,
    canceledAt: _canceledAt,
    ...taskWithoutStatusTimestamps
  } = task;
  const {
    waitingFor: _waitingFor,
    reviewAt: _waitingReviewAt,
    ...taskWithoutWaitingContext
  } = taskWithoutStatusTimestamps;
  const taskWithoutPreviousState =
    task.status === "WAITING" ? taskWithoutWaitingContext : taskWithoutStatusTimestamps;

  return {
    ...taskWithoutPreviousState,
    status: to,
    updatedAt: now,
    revision: task.revision + 1,
    ...(to === "WAITING" ? { waitingSince: now } : {}),
    ...(to === "COMPLETED" ? { completedAt: now } : {}),
    ...(to === "CANCELED" ? { canceledAt: now } : {}),
  };
}
