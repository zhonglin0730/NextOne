import {
  createInboxTask,
  eventTypeForStatusTransition,
  transitionTask,
  type DailyPlan,
  type DailyPlanItem,
  type DailyPlanSection,
  type EnergyLevel,
  type Task,
  type TaskEvent,
  type TaskStatus,
  type TaskVisibility,
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
  wipLimit?: number;
}

export interface TransitionTaskOptions {
  allowWipOverride?: boolean;
}

export type BoardColumn = "READY" | "DOING" | "WAITING" | "SOMEDAY";

export interface TodayTask {
  item: DailyPlanItem;
  task: Task;
}

export interface TodayView {
  plan: DailyPlan | undefined;
  focus: readonly TodayTask[];
  later: readonly TodayTask[];
  doing: readonly Task[];
}

export class WipLimitExceededError extends Error {
  constructor(
    public readonly limit: number,
    public readonly activeCount: number,
  ) {
    super(`Doing limit of ${limit} has been reached`);
    this.name = "WipLimitExceededError";
  }
}

function createOutboxMutation(
  input: {
    userId: string;
    entityType: OutboxMutation["entityType"];
    entityId: string;
    operation?: OutboxMutation["operation"];
    payload: unknown;
  },
  occurredAt: string,
  generateId: () => string,
): OutboxMutation {
  return {
    id: generateId(),
    userId: input.userId,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation ?? "UPSERT",
    payload: input.payload,
    createdAt: occurredAt,
    attempts: 0,
  };
}

async function persistTaskMutation(
  transaction: StorageTransaction,
  task: Task,
  events: readonly TaskEvent[],
  occurredAt: string,
  generateId: () => string,
): Promise<void> {
  await transaction.tasks.save(task);

  for (const event of events) {
    await transaction.taskEvents.append(event);
  }

  await transaction.outbox.append(
    createOutboxMutation(
      {
        userId: task.userId,
        entityType: "TASK",
        entityId: task.id,
        payload: task,
      },
      occurredAt,
      generateId,
    ),
  );
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
      await persistTaskMutation(
        transaction,
        task,
        [event],
        occurredAt,
        this.dependencies.generateId,
      );
    });

    return task;
  }

  async listInbox(): Promise<readonly Task[]> {
    return this.dependencies.database.transaction((transaction) =>
      transaction.tasks.list({ status: "INBOX" }),
    );
  }

  async listBoardTasks(): Promise<readonly Task[]> {
    return this.dependencies.database.transaction((transaction) =>
      transaction.tasks.list({ statuses: ["READY", "DOING", "WAITING"] }),
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

      await persistTaskMutation(
        transaction,
        task,
        event === undefined ? [] : [event],
        occurredAt,
        this.dependencies.generateId,
      );
      return task;
    });
  }

  async transition(
    taskId: string,
    to: TaskStatus,
    options: TransitionTaskOptions = {},
  ): Promise<Task> {
    return this.dependencies.database.transaction(async (transaction) => {
      const current = await transaction.tasks.findById(taskId);

      if (current === undefined) {
        throw new Error("Task not found");
      }

      const occurredAt = this.dependencies.now();
      const wipLimit = this.dependencies.wipLimit ?? 3;
      let wipOverrideEvent: TaskEvent | undefined;

      if (to === "DOING" && current.status !== "DOING") {
        const doingTasks = await transaction.tasks.list({ status: "DOING" });

        if (doingTasks.length >= wipLimit && options.allowWipOverride !== true) {
          throw new WipLimitExceededError(wipLimit, doingTasks.length);
        }

        if (doingTasks.length >= wipLimit) {
          wipOverrideEvent = {
            id: this.dependencies.generateId(),
            userId: current.userId,
            taskId: current.id,
            type: "WIP_LIMIT_OVERRIDDEN",
            occurredAt,
            metadata: {
              fieldNames: ["doingLimit"],
            },
          };
        }
      }

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

      await persistTaskMutation(
        transaction,
        task,
        wipOverrideEvent === undefined ? [event] : [wipOverrideEvent, event],
        occurredAt,
        this.dependencies.generateId,
      );
      return task;
    });
  }

  async changeVisibility(taskId: string, to: TaskVisibility): Promise<Task> {
    return this.dependencies.database.transaction(async (transaction) => {
      const current = await transaction.tasks.findById(taskId);

      if (current === undefined) {
        throw new Error("Task not found");
      }

      if (current.visibility === to) {
        return current;
      }

      const occurredAt = this.dependencies.now();
      const task: Task = {
        ...current,
        visibility: to,
        updatedAt: occurredAt,
        revision: current.revision + 1,
      };
      const event: TaskEvent = {
        id: this.dependencies.generateId(),
        userId: task.userId,
        taskId: task.id,
        type: "VISIBILITY_CHANGED",
        occurredAt,
        metadata: {
          fromVisibility: current.visibility,
          toVisibility: to,
        },
      };

      await persistTaskMutation(
        transaction,
        task,
        [event],
        occurredAt,
        this.dependencies.generateId,
      );
      return task;
    });
  }

  async moveToBoardColumn(
    taskId: string,
    column: BoardColumn,
    options: TransitionTaskOptions = {},
  ): Promise<Task> {
    let task = await this.findTask(taskId);

    if (task === undefined) {
      throw new Error("Task not found");
    }

    if (column === "SOMEDAY") {
      if (task.status !== "READY") {
        task = await this.transition(task.id, "READY");
      }
      return this.changeVisibility(task.id, "SOMEDAY");
    }

    if (column === "DOING") {
      task = await this.transition(task.id, "DOING", options);
      return task.visibility === "SOMEDAY" ? this.changeVisibility(task.id, "ACTIVE") : task;
    }

    if (task.visibility === "SOMEDAY") {
      task = await this.changeVisibility(task.id, "ACTIVE");
    }

    return this.transition(task.id, column, options);
  }

  async addToToday(
    taskId: string,
    localDate: string,
    timeZone: string,
    requestedSection?: DailyPlanSection,
  ): Promise<DailyPlanItem> {
    return this.dependencies.database.transaction(async (transaction) => {
      const task = await transaction.tasks.findById(taskId);

      if (task === undefined) {
        throw new Error("Task not found");
      }

      const occurredAt = this.dependencies.now();
      let plan = await transaction.dailyPlans.findByDate(this.dependencies.userId, localDate);

      if (plan === undefined) {
        plan = {
          id: this.dependencies.generateId(),
          userId: this.dependencies.userId,
          localDate,
          timeZone,
          createdAt: occurredAt,
          updatedAt: occurredAt,
          revision: 1,
        };
        await transaction.dailyPlans.save(plan);
        await transaction.outbox.append(
          createOutboxMutation(
            {
              userId: plan.userId,
              entityType: "DAILY_PLAN",
              entityId: plan.id,
              payload: plan,
            },
            occurredAt,
            this.dependencies.generateId,
          ),
        );
      }

      const existing = await transaction.dailyPlanItems.findByTask(plan.id, taskId);

      if (existing !== undefined) {
        return existing;
      }

      const planItems = await transaction.dailyPlanItems.listByPlanId(plan.id);
      const focusCount = planItems.filter((item) => item.section === "FOCUS").length;
      const section = requestedSection ?? (focusCount < 3 ? "FOCUS" : "LATER");
      const item: DailyPlanItem = {
        id: this.dependencies.generateId(),
        planId: plan.id,
        taskId,
        section,
        sortKey: occurredAt,
        createdAt: occurredAt,
      };
      const event: TaskEvent = {
        id: this.dependencies.generateId(),
        userId: task.userId,
        taskId: task.id,
        type: "ADDED_TO_DAILY_PLAN",
        occurredAt,
        metadata: {},
      };

      await transaction.dailyPlanItems.save(item);
      await transaction.taskEvents.append(event);
      await transaction.outbox.append(
        createOutboxMutation(
          {
            userId: task.userId,
            entityType: "DAILY_PLAN_ITEM",
            entityId: item.id,
            payload: item,
          },
          occurredAt,
          this.dependencies.generateId,
        ),
      );
      return item;
    });
  }

  async removeFromToday(taskId: string, localDate: string): Promise<void> {
    await this.dependencies.database.transaction(async (transaction) => {
      const task = await transaction.tasks.findById(taskId);
      const plan = await transaction.dailyPlans.findByDate(this.dependencies.userId, localDate);

      if (task === undefined || plan === undefined) {
        return;
      }

      const item = await transaction.dailyPlanItems.findByTask(plan.id, taskId);

      if (item === undefined) {
        return;
      }

      const occurredAt = this.dependencies.now();
      await transaction.dailyPlanItems.remove(item.id);
      await transaction.taskEvents.append({
        id: this.dependencies.generateId(),
        userId: task.userId,
        taskId: task.id,
        type: "REMOVED_FROM_DAILY_PLAN",
        occurredAt,
        metadata: {},
      });
      await transaction.outbox.append(
        createOutboxMutation(
          {
            userId: task.userId,
            entityType: "DAILY_PLAN_ITEM",
            entityId: item.id,
            operation: "DELETE",
            payload: null,
          },
          occurredAt,
          this.dependencies.generateId,
        ),
      );
    });
  }

  async getToday(localDate: string): Promise<TodayView> {
    return this.dependencies.database.transaction(async (transaction) => {
      const plan = await transaction.dailyPlans.findByDate(this.dependencies.userId, localDate);
      const doing = await transaction.tasks.list({ status: "DOING" });

      if (plan === undefined) {
        return { plan: undefined, focus: [], later: [], doing };
      }

      const items = await transaction.dailyPlanItems.listByPlanId(plan.id);
      const todayTasks: TodayTask[] = [];

      for (const item of items) {
        const task = await transaction.tasks.findById(item.taskId);
        if (task !== undefined && task.status !== "CANCELED" && task.status !== "COMPLETED") {
          todayTasks.push({ item, task });
        }
      }

      return {
        plan,
        focus: todayTasks.filter(({ item }) => item.section === "FOCUS"),
        later: todayTasks.filter(({ item }) => item.section === "LATER"),
        doing,
      };
    });
  }
}
