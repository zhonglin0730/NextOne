import {
  createInboxTask,
  createWorkPackage,
  eventTypeForStatusTransition,
  InvalidTaskTransitionError,
  transitionTask,
  type DailyPlan,
  type DailyPlanItem,
  type DailyPlanSection,
  type EnergyLevel,
  type Project,
  type ProjectStatus,
  type Task,
  type TaskEvent,
  type TaskStatus,
  type TaskVisibility,
  type WorkPackage,
} from "@nextone/domain";
import type { LocalDatabase, OutboxMutation, StorageTransaction } from "@nextone/storage-contracts";

export interface CaptureTaskInput {
  title: string;
  note?: string;
  areaId?: string;
  projectId?: string;
  workPackageId?: string;
  deadlineAt?: string;
  reviewAt?: string;
  estimateMinutes?: number;
  energyLevel?: EnergyLevel;
}

export interface UpdateTaskDetailsInput {
  title: string;
  note: string | null;
  projectId: string | null;
  workPackageId: string | null;
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
  loadRules?: () => Promise<Partial<ActionRules>>;
}

export interface ActionRules {
  focusLimit: number;
  wipLimit: number;
  staleDays: number;
  waitingDays: number;
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
  planned: readonly TodayTask[];
  focus: readonly TodayTask[];
  later: readonly TodayTask[];
  doing: readonly Task[];
}

export interface CreateProjectInput {
  name: string;
  note?: string;
  areaId?: string;
}

export interface CreateWorkPackageInput {
  projectId: string;
  title: string;
  note?: string;
  parentId?: string;
}

export interface UpdateWorkPackageInput {
  title: string;
  note: string | null;
  parentId: string | null;
}

export interface ProjectOverview {
  project: Project;
  doingTasks: readonly Task[];
  nextReadyTask: Task | undefined;
  progress: ProjectProgress;
  waitingCount: number;
  nextCandidateCount: number;
  completedThisWeek: number;
  lastProgressAt: string | undefined;
  needsFocusDecision: boolean;
}

export interface ProjectProgress {
  ready: number;
  doing: number;
  waiting: number;
  completed: number;
  total: number;
  completedPercent: number;
}

export interface ProjectActivity {
  event: TaskEvent;
  task: Task;
}

export interface ProjectDetail {
  overview: ProjectOverview;
  nextCandidates: readonly Task[];
  doing: readonly Task[];
  waiting: readonly Task[];
  someday: readonly Task[];
  recentlyCompleted: readonly Task[];
  recentActivity: readonly ProjectActivity[];
  structure: readonly WorkPackageStructureNode[];
  ungroupedActions: readonly Task[];
}

export interface WorkPackageStructureNode {
  workPackage: WorkPackage;
  children: readonly WorkPackageStructureNode[];
  actions: readonly Task[];
  progress: ProjectProgress;
}

export type ReviewReason =
  "STALE" | "WAITING_OVERDUE" | "DEADLINE_SOON" | "REVIEW_DUE" | "LONG_DOING";

export interface ReviewQueueItem {
  task: Task;
  reasons: readonly ReviewReason[];
}

export interface ReviewCenterView {
  items: readonly ReviewQueueItem[];
  focuslessProjects: readonly Project[];
  counts: Readonly<Record<ReviewReason | "FOCUSLESS_PROJECT", number>>;
}

export interface ActivityLogEntry {
  id: string;
  type: TaskEvent["type"] | "FOCUSLESS_PROJECT";
  occurredAt: string;
  task?: Task;
  project?: Project;
}

export interface DailyCloseView {
  plan: DailyPlan | undefined;
  completed: readonly DailyCloseTask[];
  unfinished: readonly DailyCloseTask[];
  canceled: readonly DailyCloseTask[];
}

export interface DailyCloseTask {
  task: Task;
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

export class TaskNotActionableForTodayError extends Error {
  constructor(public readonly status: TaskStatus) {
    super(`Only READY or DOING tasks can be added to today; received ${status}`);
    this.name = "TaskNotActionableForTodayError";
  }
}

function createOutboxMutation(
  input: {
    userId: string;
    entityType: OutboxMutation["entityType"];
    entityId: string;
    operation?: OutboxMutation["operation"];
    baseRevision?: number;
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
    baseRevision:
      input.baseRevision ??
      (typeof input.payload === "object" &&
      input.payload !== null &&
      "revision" in input.payload &&
      typeof input.payload.revision === "number"
        ? Math.max(0, input.payload.revision - 1)
        : 0),
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
    projectId: _projectId,
    workPackageId: _workPackageId,
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
    ...(input.projectId === null ? {} : { projectId: input.projectId }),
    ...(input.workPackageId === null ? {} : { workPackageId: input.workPackageId }),
    ...(input.deadlineAt === null ? {} : { deadlineAt: input.deadlineAt }),
    ...(input.reviewAt === null ? {} : { reviewAt: input.reviewAt }),
    ...(input.estimateMinutes === null ? {} : { estimateMinutes: input.estimateMinutes }),
    ...(input.energyLevel === null ? {} : { energyLevel: input.energyLevel }),
    ...(input.waitingFor === null || input.waitingFor.trim().length === 0
      ? {}
      : { waitingFor: input.waitingFor.trim() }),
  };
}

async function validateWorkPackageAssignment(
  transaction: StorageTransaction,
  input: {
    workPackageId?: string;
    projectId?: string;
  },
): Promise<void> {
  if (input.workPackageId === undefined) {
    return;
  }
  if (input.projectId === undefined) {
    throw new Error("A packaged task must belong to a project");
  }
  const workPackage = await transaction.workPackages.findById(input.workPackageId);
  if (
    workPackage === undefined ||
    workPackage.deletedAt !== undefined ||
    workPackage.projectId !== input.projectId
  ) {
    throw new Error("Work package must belong to the same project");
  }
}

async function persistProjectMutation(
  transaction: StorageTransaction,
  project: Project,
  occurredAt: string,
  generateId: () => string,
): Promise<void> {
  await transaction.projects.save(project);
  await transaction.outbox.append(
    createOutboxMutation(
      {
        userId: project.userId,
        entityType: "PROJECT",
        entityId: project.id,
        payload: project,
      },
      occurredAt,
      generateId,
    ),
  );
}

async function persistWorkPackageMutation(
  transaction: StorageTransaction,
  workPackage: WorkPackage,
  occurredAt: string,
  generateId: () => string,
): Promise<void> {
  await transaction.workPackages.save(workPackage);
  await transaction.outbox.append(
    createOutboxMutation(
      {
        userId: workPackage.userId,
        entityType: "WORK_PACKAGE",
        entityId: workPackage.id,
        payload: workPackage,
      },
      occurredAt,
      generateId,
    ),
  );
}

async function validateWorkPackageParent(
  transaction: StorageTransaction,
  input: {
    projectId: string;
    parentId?: string;
    currentId?: string;
  },
): Promise<void> {
  if (input.parentId === undefined) {
    return;
  }
  if (input.parentId === input.currentId) {
    throw new Error("A work package cannot contain itself");
  }
  const parent = await transaction.workPackages.findById(input.parentId);
  if (
    parent === undefined ||
    parent.deletedAt !== undefined ||
    parent.projectId !== input.projectId ||
    parent.parentId !== undefined
  ) {
    throw new Error("Child work packages require a root package in the same project");
  }
}

export class TaskApplicationService {
  constructor(private readonly dependencies: TaskApplicationDependencies) {}

  async capture(input: CaptureTaskInput): Promise<Task> {
    const occurredAt = this.dependencies.now();
    if (
      input.estimateMinutes !== undefined &&
      (!Number.isInteger(input.estimateMinutes) || input.estimateMinutes < 1)
    ) {
      throw new Error("Estimate minutes must be a positive integer");
    }
    const task = createInboxTask({
      id: this.dependencies.generateId(),
      userId: this.dependencies.userId,
      title: input.title,
      now: occurredAt,
      ...(input.note === undefined ? {} : { note: input.note }),
      ...(input.areaId === undefined ? {} : { areaId: input.areaId }),
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.workPackageId === undefined ? {} : { workPackageId: input.workPackageId }),
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
      if (input.projectId !== undefined) {
        const project = await transaction.projects.findById(input.projectId);
        if (
          project === undefined ||
          project.userId !== task.userId ||
          project.status !== "ACTIVE"
        ) {
          throw new Error("Active project not found");
        }
      }
      await validateWorkPackageAssignment(transaction, {
        ...(input.workPackageId === undefined ? {} : { workPackageId: input.workPackageId }),
        ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      });
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
    return this.dependencies.database.transaction(async (transaction) => {
      const tasks = await transaction.tasks.list({
        statuses: ["READY", "DOING", "WAITING", "COMPLETED"],
      });
      return tasks.filter((task) => task.visibility !== "SNOOZED");
    });
  }

  async listProjectWorkPackages(projectId: string): Promise<readonly WorkPackage[]> {
    return this.dependencies.database.transaction((transaction) =>
      transaction.workPackages.list({ projectId }),
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
      if (
        input.estimateMinutes !== null &&
        (!Number.isInteger(input.estimateMinutes) || input.estimateMinutes < 1)
      ) {
        throw new Error("Estimate minutes must be a positive integer");
      }

      const occurredAt = this.dependencies.now();
      let nextProject: Project | undefined;

      if (input.projectId !== null && input.projectId !== current.projectId) {
        nextProject = await transaction.projects.findById(input.projectId);
        if (
          nextProject === undefined ||
          nextProject.userId !== current.userId ||
          nextProject.status !== "ACTIVE"
        ) {
          throw new Error("Active project not found");
        }
      }
      await validateWorkPackageAssignment(transaction, {
        ...(input.workPackageId === null ? {} : { workPackageId: input.workPackageId }),
        ...(input.projectId === null ? {} : { projectId: input.projectId }),
      });

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
            : changedFields.length === 1 && changedFields[0] === "projectId"
              ? "PROJECT_CHANGED"
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
              metadata:
                eventType === "PROJECT_CHANGED"
                  ? {
                      ...(current.projectId === undefined
                        ? {}
                        : { fromProjectId: current.projectId }),
                      ...(input.projectId === null ? {} : { toProjectId: input.projectId }),
                      fieldNames: changedFields,
                    }
                  : { fieldNames: changedFields },
            };

      const events: TaskEvent[] = event === undefined ? [] : [event];

      if ((current.projectId ?? null) !== input.projectId && eventType !== "PROJECT_CHANGED") {
        events.push({
          id: this.dependencies.generateId(),
          userId: task.userId,
          taskId: task.id,
          type: "PROJECT_CHANGED",
          occurredAt,
          metadata: {
            ...(current.projectId === undefined ? {} : { fromProjectId: current.projectId }),
            ...(input.projectId === null ? {} : { toProjectId: input.projectId }),
            fieldNames: ["projectId"],
          },
        });
      }

      await persistTaskMutation(
        transaction,
        task,
        events,
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
      const rules = await this.dependencies.loadRules?.();
      const wipLimit = rules?.wipLimit ?? this.dependencies.wipLimit ?? 3;
      let wipOverrideEvent: TaskEvent | undefined;

      if (to === "DOING" && current.status !== "DOING") {
        const doingTasks = (await transaction.tasks.list({ status: "DOING" })).filter(
          (task) => task.visibility === "ACTIVE",
        );

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

      const transitionedTask = transitionTask(current, to, occurredAt);

      if (transitionedTask === current) {
        return current;
      }

      const shouldReactivate =
        current.visibility !== "ACTIVE" && (to === "READY" || to === "DOING" || to === "WAITING");
      const task: Task = shouldReactivate
        ? { ...transitionedTask, visibility: "ACTIVE" }
        : transitionedTask;
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

      const events = wipOverrideEvent === undefined ? [event] : [wipOverrideEvent, event];
      if (shouldReactivate) {
        events.push({
          id: this.dependencies.generateId(),
          userId: task.userId,
          taskId: task.id,
          type: "VISIBILITY_CHANGED",
          occurredAt,
          metadata: {
            fromVisibility: current.visibility,
            toVisibility: "ACTIVE",
          },
        });
      }
      await persistTaskMutation(
        transaction,
        task,
        events,
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

  async keepReadyAfterReview(taskId: string): Promise<Task> {
    return this.dependencies.database.transaction(async (transaction) => {
      const current = await transaction.tasks.findById(taskId);
      if (current === undefined || current.status !== "READY") {
        throw new Error("Only a ready task can be kept ready");
      }

      const occurredAt = this.dependencies.now();
      const task: Task = {
        ...current,
        reviewedAt: occurredAt,
        visibility: "ACTIVE",
        updatedAt: occurredAt,
        revision: current.revision + 1,
      };
      const event: TaskEvent = {
        id: this.dependencies.generateId(),
        userId: task.userId,
        taskId: task.id,
        type: "REVIEWED",
        occurredAt,
        metadata: {},
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

  async acknowledgeReview(taskId: string): Promise<Task> {
    return this.dependencies.database.transaction(async (transaction) => {
      const current = await transaction.tasks.findById(taskId);
      if (
        current === undefined ||
        current.status === "COMPLETED" ||
        current.status === "CANCELED"
      ) {
        throw new Error("Only an open task can be reviewed");
      }

      const occurredAt = this.dependencies.now();
      const task: Task = {
        ...current,
        reviewedAt: occurredAt,
        visibility: "ACTIVE",
        updatedAt: occurredAt,
        revision: current.revision + 1,
      };
      const events: TaskEvent[] = [
        {
          id: this.dependencies.generateId(),
          userId: task.userId,
          taskId: task.id,
          type: "REVIEWED",
          occurredAt,
          metadata: {},
        },
      ];
      if (current.visibility !== "ACTIVE") {
        events.push({
          id: this.dependencies.generateId(),
          userId: task.userId,
          taskId: task.id,
          type: "VISIBILITY_CHANGED",
          occurredAt,
          metadata: {
            fromVisibility: current.visibility,
            toVisibility: "ACTIVE",
          },
        });
      }

      await persistTaskMutation(
        transaction,
        task,
        events,
        occurredAt,
        this.dependencies.generateId,
      );
      return task;
    });
  }

  async setReviewDate(taskId: string, reviewAt: string): Promise<Task> {
    return this.dependencies.database.transaction(async (transaction) => {
      const current = await transaction.tasks.findById(taskId);
      if (current === undefined) {
        throw new Error("Task not found");
      }

      const occurredAt = this.dependencies.now();
      const task: Task = {
        ...current,
        reviewAt,
        reviewedAt: occurredAt,
        visibility: "SNOOZED",
        updatedAt: occurredAt,
        revision: current.revision + 1,
      };
      const events: TaskEvent[] = [
        {
          id: this.dependencies.generateId(),
          userId: task.userId,
          taskId: task.id,
          type: "REVIEW_AT_CHANGED",
          occurredAt,
          metadata: { fieldNames: ["reviewAt"] },
        },
        {
          id: this.dependencies.generateId(),
          userId: task.userId,
          taskId: task.id,
          type: "REVIEWED",
          occurredAt,
          metadata: {},
        },
      ];
      await persistTaskMutation(
        transaction,
        task,
        events,
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
      let task = await transaction.tasks.findById(taskId);

      if (task === undefined) {
        throw new Error("Task not found");
      }

      if (task.status !== "READY" && task.status !== "DOING") {
        throw new TaskNotActionableForTodayError(task.status);
      }

      const occurredAt = this.dependencies.now();
      if (task.visibility !== "ACTIVE") {
        const activeTask: Task = {
          ...task,
          visibility: "ACTIVE",
          updatedAt: occurredAt,
          revision: task.revision + 1,
        };
        await persistTaskMutation(
          transaction,
          activeTask,
          [
            {
              id: this.dependencies.generateId(),
              userId: activeTask.userId,
              taskId: activeTask.id,
              type: "VISIBILITY_CHANGED",
              occurredAt,
              metadata: {
                fromVisibility: task.visibility,
                toVisibility: "ACTIVE",
              },
            },
          ],
          occurredAt,
          this.dependencies.generateId,
        );
        task = activeTask;
      }

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
      const rules = await this.dependencies.loadRules?.();
      const focusLimit = rules?.focusLimit ?? 3;
      const section =
        requestedSection === "FOCUS" && focusCount >= focusLimit
          ? "LATER"
          : (requestedSection ?? (focusCount < focusLimit ? "FOCUS" : "LATER"));
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

  async isInTodayPlan(taskId: string, localDate: string): Promise<boolean> {
    return this.dependencies.database.transaction(async (transaction) => {
      const plan = await transaction.dailyPlans.findByDate(this.dependencies.userId, localDate);
      if (plan === undefined) {
        return false;
      }
      return (await transaction.dailyPlanItems.findByTask(plan.id, taskId)) !== undefined;
    });
  }

  async pauseAndKeepToday(taskId: string, localDate: string, timeZone: string): Promise<Task> {
    const task = await this.findTask(taskId);
    if (task === undefined) {
      throw new Error("Task not found");
    }
    if (task.status !== "DOING") {
      throw new InvalidTaskTransitionError(task.status, "READY");
    }

    await this.addToToday(taskId, localDate, timeZone);
    return this.transition(taskId, "READY");
  }

  async continueTomorrow(
    taskId: string,
    currentLocalDate: string,
    nextLocalDate: string,
    timeZone: string,
    requestedSection?: DailyPlanSection,
  ): Promise<DailyPlanItem> {
    let task = await this.findTask(taskId);

    if (task === undefined) {
      throw new Error("Task not found");
    }

    if (task.status === "INBOX" || task.status === "DOING") {
      task = await this.transition(task.id, "READY");
    }

    const item = await this.addToToday(task.id, nextLocalDate, timeZone, requestedSection);
    await this.removeFromToday(task.id, currentLocalDate);
    return item;
  }

  async getToday(localDate: string): Promise<TodayView> {
    return this.dependencies.database.transaction(async (transaction) => {
      const plan = await transaction.dailyPlans.findByDate(this.dependencies.userId, localDate);
      const doing = (await transaction.tasks.list({ status: "DOING" })).filter(
        (task) => task.visibility === "ACTIVE",
      );

      if (plan === undefined) {
        return { plan: undefined, planned: [], focus: [], later: [], doing };
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
        planned: todayTasks.filter(
          ({ task }) =>
            task.visibility === "ACTIVE" &&
            (task.status === "READY" || task.status === "DOING"),
        ),
        focus: todayTasks.filter(
          ({ item, task }) =>
            item.section === "FOCUS" &&
            task.visibility === "ACTIVE" &&
            task.status === "READY",
        ),
        later: todayTasks.filter(
          ({ item, task }) =>
            item.section === "LATER" &&
            task.visibility === "ACTIVE" &&
            task.status === "READY",
        ),
        doing,
      };
    });
  }
}

function timeValue(value?: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function lastMeaningfulTaskTime(task: Task): number {
  return Math.max(timeValue(task.updatedAt) ?? 0, timeValue(task.reviewedAt) ?? 0);
}

function localDateInTimeZone(value: string, timeZone: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  return year === undefined || month === undefined || day === undefined
    ? undefined
    : `${year}-${month}-${day}`;
}

export class ReviewApplicationService {
  constructor(private readonly dependencies: TaskApplicationDependencies) {}

  async getCenter(now: string): Promise<ReviewCenterView> {
    return this.dependencies.database.transaction(async (transaction) => {
      const nowValue = timeValue(now) ?? Date.now();
      const rules = await this.dependencies.loadRules?.();
      const staleCutoff = nowValue - (rules?.staleDays ?? 14) * 86_400_000;
      const waitingCutoff = nowValue - (rules?.waitingDays ?? 7) * 86_400_000;
      const doingCutoff = nowValue - 7 * 86_400_000;
      const deadlineCutoff = nowValue + 3 * 86_400_000;
      const startOfDay = new Date(nowValue);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const startOfDayValue = startOfDay.getTime();
      const tasks = await transaction.tasks.list();
      const items: ReviewQueueItem[] = [];

      for (const task of tasks) {
        if (task.status === "COMPLETED" || task.status === "CANCELED") {
          continue;
        }
        const reasons: ReviewReason[] = [];
        const reviewedAtValue = timeValue(task.reviewedAt);
        if (
          task.status === "READY" &&
          task.visibility === "ACTIVE" &&
          lastMeaningfulTaskTime(task) <= staleCutoff
        ) {
          reasons.push("STALE");
        }
        if (
          task.status === "WAITING" &&
          Math.max(timeValue(task.waitingSince) ?? nowValue, reviewedAtValue ?? 0) <= waitingCutoff
        ) {
          reasons.push("WAITING_OVERDUE");
        }
        const deadlineValue = timeValue(task.deadlineAt);
        const deadlineEnd =
          deadlineValue === undefined
            ? undefined
            : task.deadlineAt?.length === 10
              ? deadlineValue + 86_400_000 - 1
              : deadlineValue;
        if (
          deadlineValue !== undefined &&
          deadlineEnd !== undefined &&
          deadlineEnd >= nowValue &&
          deadlineValue <= deadlineCutoff &&
          task.visibility === "ACTIVE" &&
          (reviewedAtValue === undefined || reviewedAtValue < startOfDayValue)
        ) {
          reasons.push("DEADLINE_SOON");
        }
        if (
          task.reviewAt !== undefined &&
          task.visibility !== "SOMEDAY" &&
          (timeValue(task.reviewAt) ?? Number.POSITIVE_INFINITY) <= nowValue &&
          (reviewedAtValue === undefined ||
            reviewedAtValue < (timeValue(task.reviewAt) ?? Number.POSITIVE_INFINITY))
        ) {
          reasons.push("REVIEW_DUE");
        }
        if (task.status === "DOING" && lastMeaningfulTaskTime(task) <= doingCutoff) {
          reasons.push("LONG_DOING");
        }
        if (reasons.length > 0) {
          items.push({ task, reasons });
        }
      }

      const projects = await transaction.projects.list({ status: "ACTIVE" });
      const focuslessProjects: Project[] = [];
      for (const project of projects) {
        const projectTasks = await transaction.tasks.list({ projectId: project.id });
        const hasExecutableTask = projectTasks.some(
          (task) =>
            task.visibility === "ACTIVE" && (task.status === "READY" || task.status === "DOING"),
        );
        if (!hasExecutableTask) {
          focuslessProjects.push(project);
        }
      }

      const counts: Record<ReviewReason | "FOCUSLESS_PROJECT", number> = {
        STALE: 0,
        WAITING_OVERDUE: 0,
        DEADLINE_SOON: 0,
        REVIEW_DUE: 0,
        LONG_DOING: 0,
        FOCUSLESS_PROJECT: focuslessProjects.length,
      };
      for (const item of items) {
        for (const reason of item.reasons) {
          counts[reason] += 1;
        }
      }

      return { items, focuslessProjects, counts };
    });
  }

  async getActivity(): Promise<readonly ActivityLogEntry[]> {
    return this.dependencies.database.transaction(async (transaction) => {
      const events = await transaction.taskEvents.listAll();
      const entries: ActivityLogEntry[] = [];
      const visibleTypes = new Set<TaskEvent["type"]>([
        "COMPLETED",
        "CANCELED",
        "REVIEWED",
      ]);

      for (const event of events) {
        if (!visibleTypes.has(event.type)) {
          continue;
        }
        const task = await transaction.tasks.findById(event.taskId);
        if (task !== undefined) {
          entries.push({
            id: event.id,
            type: event.type,
            occurredAt: event.occurredAt,
            task,
          });
        }
      }

      const projects = await transaction.projects.list({ status: "ACTIVE" });
      for (const project of projects) {
        const projectTasks = await transaction.tasks.list({ projectId: project.id });
        const hasExecutableTask = projectTasks.some(
          (task) =>
            task.visibility === "ACTIVE" && (task.status === "READY" || task.status === "DOING"),
        );
        if (!hasExecutableTask) {
          entries.push({
            id: `focusless-${project.id}`,
            type: "FOCUSLESS_PROJECT",
            occurredAt: project.updatedAt,
            project,
          });
        }
      }

      return entries.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    });
  }

  async getDailyClose(localDate: string, timeZone = "UTC"): Promise<DailyCloseView> {
    return this.dependencies.database.transaction(async (transaction) => {
      const plan = await transaction.dailyPlans.findByDate(this.dependencies.userId, localDate);
      const entries = new Map<string, DailyCloseTask>();

      if (plan !== undefined) {
        const items = await transaction.dailyPlanItems.listByPlanId(plan.id);
        for (const item of items) {
          const task = await transaction.tasks.findById(item.taskId);
          if (task !== undefined) {
            entries.set(task.id, { task });
          }
        }
      }

      const doing = await transaction.tasks.list({ status: "DOING" });
      for (const task of doing) {
        if (task.visibility === "ACTIVE") {
          entries.set(task.id, { task });
        }
      }

      const events = await transaction.taskEvents.listAll();
      for (const event of events) {
        const belongsToDay = localDateInTimeZone(event.occurredAt, timeZone) === localDate;
        const isWorkedToday =
          event.type === "COMPLETED" ||
          event.type === "CANCELED" ||
          event.metadata.toStatus === "DOING";
        if (!belongsToDay || !isWorkedToday || event.userId !== this.dependencies.userId) {
          continue;
        }
        const task = await transaction.tasks.findById(event.taskId);
        if (task !== undefined) {
          entries.set(task.id, { task });
        }
      }

      const all = [...entries.values()];
      return {
        plan,
        completed: all.filter(({ task }) => task.status === "COMPLETED"),
        unfinished: all.filter(
          ({ task }) =>
            task.visibility === "ACTIVE" &&
            (task.status === "INBOX" || task.status === "READY" || task.status === "DOING"),
        ),
        canceled: all.filter(({ task }) => task.status === "CANCELED"),
      };
    });
  }
}

const projectProgressEventTypes = new Set<TaskEvent["type"]>([
  "CLARIFIED",
  "STATUS_CHANGED",
  "WAITING_STARTED",
  "WAITING_ENDED",
  "COMPLETED",
  "REOPENED",
  "PROJECT_CHANGED",
]);

function isOpenTask(task: Task): boolean {
  return task.status !== "COMPLETED" && task.status !== "CANCELED";
}

function candidateTasks(tasks: readonly Task[], firstTaskId?: string): readonly Task[] {
  return tasks.filter(
    (task) =>
      task.status === "READY" &&
      task.visibility === "ACTIVE" &&
      task.id !== firstTaskId,
  );
}

function completedSince(tasks: readonly Task[], weekStartsAt: string): readonly Task[] {
  return tasks
    .filter(
      (task) =>
        task.status === "COMPLETED" &&
        task.completedAt !== undefined &&
        task.completedAt >= weekStartsAt,
    )
    .sort((left, right) => (right.completedAt ?? "").localeCompare(left.completedAt ?? ""));
}

function createProjectProgress(tasks: readonly Task[]): ProjectProgress {
  const ready = tasks.filter(
    (task) => task.status === "READY" && task.visibility === "ACTIVE",
  ).length;
  const doing = tasks.filter(
    (task) => task.status === "DOING" && task.visibility === "ACTIVE",
  ).length;
  const waiting = tasks.filter(
    (task) => task.status === "WAITING" && task.visibility === "ACTIVE",
  ).length;
  const completed = tasks.filter((task) => task.status === "COMPLETED").length;
  const total = ready + doing + waiting + completed;

  return {
    ready,
    doing,
    waiting,
    completed,
    total,
    completedPercent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

function createProjectStructure(
  workPackages: readonly WorkPackage[],
  tasks: readonly Task[],
): readonly WorkPackageStructureNode[] {
  const activePackages = workPackages.filter((workPackage) => workPackage.deletedAt === undefined);
  const childrenByParent = new Map<string, WorkPackage[]>();
  for (const workPackage of activePackages) {
    if (workPackage.parentId === undefined) {
      continue;
    }
    const children = childrenByParent.get(workPackage.parentId) ?? [];
    children.push(workPackage);
    childrenByParent.set(workPackage.parentId, children);
  }
  const actionsByPackage = new Map<string, Task[]>();
  for (const task of tasks.filter((candidate) => candidate.status !== "CANCELED")) {
    if (task.workPackageId === undefined) {
      continue;
    }
    const actions = actionsByPackage.get(task.workPackageId) ?? [];
    actions.push(task);
    actionsByPackage.set(task.workPackageId, actions);
  }

  const build = (workPackage: WorkPackage): WorkPackageStructureNode => {
    const children = [...(childrenByParent.get(workPackage.id) ?? [])]
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
      .map(build);
    const actions = [...(actionsByPackage.get(workPackage.id) ?? [])].sort((left, right) =>
      left.sortKey.localeCompare(right.sortKey),
    );
    const descendantActions = [
      ...actions,
      ...children.flatMap((child) => collectStructureActions(child)),
    ];
    return {
      workPackage,
      children,
      actions,
      progress: createProjectProgress(descendantActions),
    };
  };

  return activePackages
    .filter((workPackage) => workPackage.parentId === undefined)
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map(build);
}

function collectStructureActions(node: WorkPackageStructureNode): readonly Task[] {
  return [...node.actions, ...node.children.flatMap((child) => collectStructureActions(child))];
}

async function projectActivity(
  transaction: StorageTransaction,
  tasks: readonly Task[],
  projectId: string,
): Promise<readonly ProjectActivity[]> {
  const activity: ProjectActivity[] = [];

  for (const task of tasks) {
    const events = await transaction.taskEvents.listByTaskId(task.id);
    const joinedAt = events
      .filter(
        (event) => event.type === "PROJECT_CHANGED" && event.metadata.toProjectId === projectId,
      )
      .at(-1)?.occurredAt;

    for (const event of events) {
      if (
        projectProgressEventTypes.has(event.type) &&
        (joinedAt === undefined || event.occurredAt >= joinedAt)
      ) {
        activity.push({ event, task });
      }
    }
  }

  return activity.sort((left, right) =>
    right.event.occurredAt.localeCompare(left.event.occurredAt),
  );
}

function createProjectOverview(
  project: Project,
  tasks: readonly Task[],
  activity: readonly ProjectActivity[],
  weekStartsAt: string,
): ProjectOverview {
  const doingTasks = tasks.filter(
    (task) => task.status === "DOING" && task.visibility === "ACTIVE",
  );
  const nextReadyTask = tasks.find(
    (task) => task.status === "READY" && task.visibility === "ACTIVE",
  );

  return {
    project,
    doingTasks,
    nextReadyTask,
    progress: createProjectProgress(tasks),
    waitingCount: tasks.filter((task) => task.status === "WAITING").length,
    nextCandidateCount: candidateTasks(tasks, nextReadyTask?.id).length,
    completedThisWeek: completedSince(tasks, weekStartsAt).length,
    lastProgressAt: activity[0]?.event.occurredAt,
    needsFocusDecision:
      project.status === "ACTIVE" && doingTasks.length === 0 && nextReadyTask === undefined,
  };
}

export class ProjectApplicationService {
  constructor(private readonly dependencies: TaskApplicationDependencies) {}

  async create(input: CreateProjectInput): Promise<Project> {
    const name = input.name.trim();
    if (name.length === 0) {
      throw new Error("Project name is required");
    }

    const occurredAt = this.dependencies.now();
    const project: Project = {
      id: this.dependencies.generateId(),
      userId: this.dependencies.userId,
      name,
      status: "ACTIVE",
      sortKey: occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      revision: 1,
      ...(input.note === undefined || input.note.trim().length === 0
        ? {}
        : { note: input.note.trim() }),
      ...(input.areaId === undefined ? {} : { areaId: input.areaId }),
    };

    await this.dependencies.database.transaction((transaction) =>
      persistProjectMutation(transaction, project, occurredAt, this.dependencies.generateId),
    );
    return project;
  }

  async listProjects(status?: ProjectStatus): Promise<readonly Project[]> {
    return this.dependencies.database.transaction((transaction) =>
      transaction.projects.list(status === undefined ? undefined : { status }),
    );
  }

  async listOverview(weekStartsAt: string): Promise<readonly ProjectOverview[]> {
    return this.dependencies.database.transaction(async (transaction) => {
      const projects = await transaction.projects.list({ status: "ACTIVE" });
      const overview: ProjectOverview[] = [];

      for (const project of projects) {
        const tasks = await transaction.tasks.list({
          projectId: project.id,
          includeCanceled: true,
        });
        const activity = await projectActivity(transaction, tasks, project.id);
        overview.push(createProjectOverview(project, tasks, activity, weekStartsAt));
      }

      return overview;
    });
  }

  async getDetail(projectId: string, weekStartsAt: string): Promise<ProjectDetail | undefined> {
    return this.dependencies.database.transaction(async (transaction) => {
      const project = await transaction.projects.findById(projectId);
      if (project === undefined || project.userId !== this.dependencies.userId) {
        return undefined;
      }

      const tasks = await transaction.tasks.list({ projectId, includeCanceled: true });
      const workPackages = await transaction.workPackages.list({ projectId });
      const activity = await projectActivity(transaction, tasks, project.id);
      const overview = createProjectOverview(project, tasks, activity, weekStartsAt);

      return {
        overview,
        nextCandidates: candidateTasks(tasks, overview.nextReadyTask?.id),
        doing: overview.doingTasks,
        waiting: tasks.filter(
          (task) => task.status === "WAITING" && task.visibility === "ACTIVE",
        ),
        someday: tasks.filter(
          (task) => isOpenTask(task) && task.visibility === "SOMEDAY",
        ),
        recentlyCompleted: completedSince(tasks, weekStartsAt),
        recentActivity: activity.slice(0, 8),
        structure: createProjectStructure(workPackages, tasks),
        ungroupedActions: tasks.filter(
          (task) => task.workPackageId === undefined && task.status !== "CANCELED",
        ),
      };
    });
  }
}

export class WorkPackageApplicationService {
  constructor(private readonly dependencies: TaskApplicationDependencies) {}

  async create(input: CreateWorkPackageInput): Promise<WorkPackage> {
    return this.dependencies.database.transaction(async (transaction) => {
      const project = await transaction.projects.findById(input.projectId);
      if (
        project === undefined ||
        project.userId !== this.dependencies.userId ||
        project.status !== "ACTIVE"
      ) {
        throw new Error("Active project not found");
      }
      const occurredAt = this.dependencies.now();
      await validateWorkPackageParent(transaction, {
        projectId: input.projectId,
        ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
      });
      const workPackage = createWorkPackage({
        id: this.dependencies.generateId(),
        userId: this.dependencies.userId,
        projectId: input.projectId,
        title: input.title,
        now: occurredAt,
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
      });
      await persistWorkPackageMutation(
        transaction,
        workPackage,
        occurredAt,
        this.dependencies.generateId,
      );
      return workPackage;
    });
  }

  async update(id: string, input: UpdateWorkPackageInput): Promise<WorkPackage> {
    return this.dependencies.database.transaction(async (transaction) => {
      const current = await transaction.workPackages.findById(id);
      if (current === undefined || current.userId !== this.dependencies.userId) {
        throw new Error("Work package not found");
      }
      await validateWorkPackageParent(transaction, {
        currentId: current.id,
        projectId: current.projectId,
        ...(input.parentId === null ? {} : { parentId: input.parentId }),
      });
      const title = input.title.trim();
      if (title.length === 0) {
        throw new Error("Work package title is required");
      }
      const occurredAt = this.dependencies.now();
      const { note: _note, parentId: _parentId, ...base } = current;
      const updated: WorkPackage = {
        ...base,
        title,
        updatedAt: occurredAt,
        revision: current.revision + 1,
        ...(input.note === null || input.note.trim().length === 0
          ? {}
          : { note: input.note.trim() }),
        ...(input.parentId === null ? {} : { parentId: input.parentId }),
      };
      await persistWorkPackageMutation(
        transaction,
        updated,
        occurredAt,
        this.dependencies.generateId,
      );
      return updated;
    });
  }
}
