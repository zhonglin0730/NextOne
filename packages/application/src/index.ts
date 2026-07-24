import {
  createInboxTask,
  eventTypeForStatusTransition,
  transitionTask,
  type EnergyLevel,
  type Task,
  type TaskEvent,
  type TaskStatus,
} from "@nextone/domain";
import type { LocalDatabase, OutboxMutation, StorageTransaction } from "@nextone/storage-contracts";

export interface CaptureTaskInput {
  title: string;
  note?: string;
  areaId?: string;
  projectId?: string;
  deadlineAt?: string;
  reviewAt?: string;
  estimateMinutes?: number;
  energyLevel?: EnergyLevel;
}

export interface UpdateTaskDetailsInput {
  title: string;
  note: string | null;
  deadlineAt: string | null;
  reviewAt: string | null;
  estimateMinutes: number | null;
  energyLevel: EnergyLevel | null;
  waitingFor: string | null;
}

export interface TaskApplicationDependencies {
  database: LocalDatabase;
  userId: string;
  generateId: () => string;
  now: () => string;
}

function createOutboxMutation(
  task: Task,
  occurredAt: string,
  generateId: () => string,
): OutboxMutation {
  return {
    id: generateId(),
    userId: task.userId,
    entityType: "TASK",
    entityId: task.id,
    operation: "UPSERT",
    payload: task,
    createdAt: occurredAt,
    attempts: 0,
  };
}

async function persistTaskMutation(
  transaction: StorageTransaction,
  task: Task,
  event: TaskEvent | undefined,
  occurredAt: string,
  generateId: () => string,
): Promise<void> {
  await transaction.tasks.save(task);

  if (event !== undefined) {
    await transaction.taskEvents.append(event);
  }

  await transaction.outbox.append(createOutboxMutation(task, occurredAt, generateId));
}

function compactTaskDetails(task: Task, input: UpdateTaskDetailsInput, now: string): Task {
  const {
    note: _note,
    deadlineAt: _deadlineAt,
    reviewAt: _reviewAt,
    estimateMinutes: _estimateMinutes,
    energyLevel: _energyLevel,
    waitingFor: _waitingFor,
    ...baseTask
  } = task;
  const title = input.title.trim();

  if (title.length === 0) {
    throw new Error("Task title is required");
  }

  return {
    ...baseTask,
    title,
    updatedAt: now,
    revision: task.revision + 1,
    ...(input.note === null || input.note.trim().length === 0 ? {} : { note: input.note.trim() }),
    ...(input.deadlineAt === null ? {} : { deadlineAt: input.deadlineAt }),
    ...(input.reviewAt === null ? {} : { reviewAt: input.reviewAt }),
    ...(input.estimateMinutes === null ? {} : { estimateMinutes: input.estimateMinutes }),
    ...(input.energyLevel === null ? {} : { energyLevel: input.energyLevel }),
    ...(input.waitingFor === null || input.waitingFor.trim().length === 0
      ? {}
      : { waitingFor: input.waitingFor.trim() }),
  };
}

export class TaskApplicationService {
  constructor(private readonly dependencies: TaskApplicationDependencies) {}

  async capture(input: CaptureTaskInput): Promise<Task> {
    const occurredAt = this.dependencies.now();
    const task = createInboxTask({
      id: this.dependencies.generateId(),
      userId: this.dependencies.userId,
      title: input.title,
      now: occurredAt,
      ...(input.note === undefined ? {} : { note: input.note }),
      ...(input.areaId === undefined ? {} : { areaId: input.areaId }),
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt }),
      ...(input.reviewAt === undefined ? {} : { reviewAt: input.reviewAt }),
      ...(input.estimateMinutes === undefined ? {} : { estimateMinutes: input.estimateMinutes }),
      ...(input.energyLevel === undefined ? {} : { energyLevel: input.energyLevel }),
    });
    const event: TaskEvent = {
      id: this.dependencies.generateId(),
      userId: task.userId,
      taskId: task.id,
      type: "CREATED",
      occurredAt,
      metadata: {},
    };

    await this.dependencies.database.transaction(async (transaction) => {
      await persistTaskMutation(transaction, task, event, occurredAt, this.dependencies.generateId);
    });

    return task;
  }

  async listInbox(): Promise<readonly Task[]> {
    return this.dependencies.database.transaction((transaction) =>
      transaction.tasks.list({ status: "INBOX" }),
    );
  }

  async findTask(id: string): Promise<Task | undefined> {
    return this.dependencies.database.transaction((transaction) => transaction.tasks.findById(id));
  }

  async listTaskEvents(taskId: string): Promise<readonly TaskEvent[]> {
    return this.dependencies.database.transaction((transaction) =>
      transaction.taskEvents.listByTaskId(taskId),
    );
  }

  async updateDetails(taskId: string, input: UpdateTaskDetailsInput): Promise<Task> {
    return this.dependencies.database.transaction(async (transaction) => {
      const current = await transaction.tasks.findById(taskId);

      if (current === undefined) {
        throw new Error("Task not found");
      }

      const occurredAt = this.dependencies.now();
      const task = compactTaskDetails(current, input, occurredAt);
      const changedFields = Object.keys(input).filter((key) => {
        const field = key as keyof UpdateTaskDetailsInput;
        return input[field] !== (current[field as keyof Task] ?? null);
      });
      const eventType =
        changedFields.length === 1 && changedFields[0] === "deadlineAt"
          ? "DEADLINE_CHANGED"
          : changedFields.length === 1 && changedFields[0] === "reviewAt"
            ? "REVIEW_AT_CHANGED"
            : undefined;
      const event: TaskEvent | undefined =
        eventType === undefined
          ? undefined
          : {
              id: this.dependencies.generateId(),
              userId: task.userId,
              taskId: task.id,
              type: eventType,
              occurredAt,
              metadata: { fieldNames: changedFields },
            };

      await persistTaskMutation(transaction, task, event, occurredAt, this.dependencies.generateId);
      return task;
    });
  }

  async transition(taskId: string, to: TaskStatus): Promise<Task> {
    return this.dependencies.database.transaction(async (transaction) => {
      const current = await transaction.tasks.findById(taskId);

      if (current === undefined) {
        throw new Error("Task not found");
      }

      const occurredAt = this.dependencies.now();
      const task = transitionTask(current, to, occurredAt);

      if (task === current) {
        return current;
      }

      const event: TaskEvent = {
        id: this.dependencies.generateId(),
        userId: task.userId,
        taskId: task.id,
        type: eventTypeForStatusTransition(current.status, to),
        occurredAt,
        metadata: {
          fromStatus: current.status,
          toStatus: to,
        },
      };

      await persistTaskMutation(transaction, task, event, occurredAt, this.dependencies.generateId);
      return task;
    });
  }
}
