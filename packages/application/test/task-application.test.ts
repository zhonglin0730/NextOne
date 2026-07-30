import type { DailyPlan, DailyPlanItem, Project, Task, TaskEvent } from "@nextone/domain";
import type {
  AreaRepository,
  DailyPlanItemRepository,
  DailyPlanRepository,
  LocalDatabase,
  OutboxMutation,
  OutboxRepository,
  ProjectRepository,
  StorageTransaction,
  SyncConflict,
  SyncConflictRepository,
  SyncState,
  SyncStateRepository,
  TaskEventRepository,
  TaskQuery,
  TaskRepository,
} from "@nextone/storage-contracts";
import { describe, expect, it } from "vitest";

import {
  ProjectApplicationService,
  ReviewApplicationService,
  TaskApplicationService,
  TaskNotActionableForTodayError,
  WipLimitExceededError,
} from "../src";

class MemoryTaskRepository implements TaskRepository {
  constructor(private readonly tasks: Map<string, Task>) {}

  async findById(id: string): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async list(query?: TaskQuery): Promise<readonly Task[]> {
    return [...this.tasks.values()].filter(
      (task) =>
        (query?.status === undefined || task.status === query.status) &&
        (query?.statuses === undefined || query.statuses.includes(task.status)) &&
        (query?.projectId === undefined || task.projectId === query.projectId) &&
        (query?.includeCanceled === true || task.status !== "CANCELED"),
    );
  }

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }
}

class MemoryDailyPlanRepository implements DailyPlanRepository {
  constructor(private readonly plans: Map<string, DailyPlan>) {}

  async findByDate(userId: string, localDate: string): Promise<DailyPlan | undefined> {
    return [...this.plans.values()].find(
      (plan) => plan.userId === userId && plan.localDate === localDate,
    );
  }

  async save(plan: DailyPlan): Promise<void> {
    this.plans.set(plan.id, plan);
  }
}

class MemoryDailyPlanItemRepository implements DailyPlanItemRepository {
  constructor(private readonly items: Map<string, DailyPlanItem>) {}

  async findByTask(planId: string, taskId: string): Promise<DailyPlanItem | undefined> {
    return [...this.items.values()].find(
      (item) => item.planId === planId && item.taskId === taskId,
    );
  }

  async listByPlanId(planId: string): Promise<readonly DailyPlanItem[]> {
    return [...this.items.values()].filter((item) => item.planId === planId);
  }

  async save(item: DailyPlanItem): Promise<void> {
    this.items.set(item.id, item);
  }

  async remove(id: string): Promise<void> {
    this.items.delete(id);
  }
}

class MemoryEventRepository implements TaskEventRepository {
  constructor(private readonly events: TaskEvent[]) {}

  async listByTaskId(taskId: string): Promise<readonly TaskEvent[]> {
    return this.events.filter((event) => event.taskId === taskId);
  }

  async listAll(): Promise<readonly TaskEvent[]> {
    return [...this.events].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }

  async append(event: TaskEvent): Promise<void> {
    this.events.push(event);
  }
}

class MemoryProjectRepository implements ProjectRepository {
  constructor(private readonly projects: Map<string, Project>) {}

  async findById(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async list(query?: Parameters<ProjectRepository["list"]>[0]): Promise<readonly Project[]> {
    return [...this.projects.values()].filter(
      (project) =>
        (query?.areaId === undefined || project.areaId === query.areaId) &&
        (query?.status === undefined || project.status === query.status),
    );
  }

  async save(project: Project): Promise<void> {
    this.projects.set(project.id, project);
  }
}

class MemoryOutboxRepository implements OutboxRepository {
  constructor(private readonly mutations: OutboxMutation[]) {}

  async listPending(): Promise<readonly OutboxMutation[]> {
    return this.mutations;
  }

  async listAll(): Promise<readonly OutboxMutation[]> {
    return this.mutations;
  }

  async append(mutation: OutboxMutation): Promise<void> {
    this.mutations.push(mutation);
  }

  async update(mutation: OutboxMutation): Promise<void> {
    const index = this.mutations.findIndex((candidate) => candidate.id === mutation.id);
    if (index >= 0) {
      this.mutations[index] = mutation;
    }
  }

  async remove(id: string): Promise<void> {
    const index = this.mutations.findIndex((mutation) => mutation.id === id);
    if (index >= 0) {
      this.mutations.splice(index, 1);
    }
  }
}

class MemorySyncStateRepository implements SyncStateRepository {
  state: SyncState | undefined;

  async get(): Promise<SyncState | undefined> {
    return this.state;
  }

  async save(state: SyncState): Promise<void> {
    this.state = state;
  }
}

class MemorySyncConflictRepository implements SyncConflictRepository {
  conflicts: SyncConflict[] = [];

  async listOpen(): Promise<readonly SyncConflict[]> {
    return this.conflicts.filter((conflict) => conflict.resolvedAt === undefined);
  }

  async save(conflict: SyncConflict): Promise<void> {
    this.conflicts.push(conflict);
  }
}

function createMemoryDatabase() {
  const tasks = new Map<string, Task>();
  const events: TaskEvent[] = [];
  const outbox: OutboxMutation[] = [];
  const plans = new Map<string, DailyPlan>();
  const planItems = new Map<string, DailyPlanItem>();
  const projects = new Map<string, Project>();
  const unsupportedAreaRepository = {} as AreaRepository;
  const transaction: StorageTransaction = {
    tasks: new MemoryTaskRepository(tasks),
    areas: unsupportedAreaRepository,
    projects: new MemoryProjectRepository(projects),
    taskEvents: new MemoryEventRepository(events),
    dailyPlans: new MemoryDailyPlanRepository(plans),
    dailyPlanItems: new MemoryDailyPlanItemRepository(planItems),
    outbox: new MemoryOutboxRepository(outbox),
    syncState: new MemorySyncStateRepository(),
    syncConflicts: new MemorySyncConflictRepository(),
    preferences: {} as StorageTransaction["preferences"],
    restorePoints: {} as StorageTransaction["restorePoints"],
    dataManagement: {} as StorageTransaction["dataManagement"],
  };
  const database: LocalDatabase = {
    transaction: async <T>(work: (value: StorageTransaction) => Promise<T>) => work(transaction),
  };

  return { database, tasks, events, outbox, plans, planItems, projects };
}

function createService(
  database: LocalDatabase,
  rules?: { focusLimit?: number; wipLimit?: number },
) {
  let id = 0;
  let minute = 0;

  return new TaskApplicationService({
    database,
    userId: "local-user",
    generateId: () => `id-${++id}`,
    now: () => `2026-07-24T10:${String(minute++).padStart(2, "0")}:00.000Z`,
    ...(rules === undefined ? {} : { loadRules: async () => rules }),
  });
}

function createProjectService(database: LocalDatabase) {
  let id = 100;
  let minute = 30;

  return new ProjectApplicationService({
    database,
    userId: "local-user",
    generateId: () => `project-id-${++id}`,
    now: () => `2026-07-24T11:${String(minute++).padStart(2, "0")}:00.000Z`,
  });
}

function createReviewService(database: LocalDatabase) {
  let id = 200;
  return new ReviewApplicationService({
    database,
    userId: "local-user",
    generateId: () => `review-id-${++id}`,
    now: () => "2026-07-24T12:00:00.000Z",
  });
}

describe("task application service", () => {
  it("atomically captures a task, its event, and an outbox mutation", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);

    const task = await service.capture({ title: "记录一个想法" });

    expect(state.tasks.get(task.id)?.status).toBe("INBOX");
    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.type).toBe("CREATED");
    expect(state.outbox).toHaveLength(1);
    expect(state.outbox[0]?.entityId).toBe(task.id);
  });

  it("rejects capture into a project that does not exist", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);

    await expect(
      service.capture({ title: "不能成为孤儿任务", projectId: "missing-project" }),
    ).rejects.toThrow("Active project not found");

    expect(state.tasks.size).toBe(0);
    expect(state.events).toHaveLength(0);
    expect(state.outbox).toHaveLength(0);
  });

  it("rejects invalid estimate minutes at the application boundary", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);

    await expect(service.capture({ title: "非法预估", estimateMinutes: 0 })).rejects.toThrow(
      "Estimate minutes must be a positive integer",
    );
    await expect(service.capture({ title: "非法预估", estimateMinutes: 1.5 })).rejects.toThrow(
      "Estimate minutes must be a positive integer",
    );
    expect(state.tasks.size).toBe(0);
  });

  it("persists edited task details and appends an outbox mutation", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const task = await service.capture({ title: "旧标题" });

    const updated = await service.updateDetails(task.id, {
      title: "明确的下一步",
      note: "保存后的备注",
      projectId: null,
      parentTaskId: null,
      deadlineAt: "2026-07-31",
      reviewAt: null,
      estimateMinutes: 30,
      energyLevel: "MEDIUM",
      waitingFor: null,
    });

    expect(updated.title).toBe("明确的下一步");
    expect(updated.note).toBe("保存后的备注");
    expect(updated.deadlineAt).toBe("2026-07-31");
    expect(updated.estimateMinutes).toBe(30);
    expect(state.tasks.get(task.id)).toEqual(updated);
    expect(state.outbox).toHaveLength(2);
  });

  it("keeps a canceled task and records the decision", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const task = await service.capture({ title: "不再值得继续" });

    const canceled = await service.transition(task.id, "CANCELED");

    expect(state.tasks.get(task.id)?.status).toBe("CANCELED");
    expect(canceled.deletedAt).toBeUndefined();
    expect(state.events.map((event) => event.type)).toEqual(["CREATED", "CANCELED"]);
    expect(state.outbox).toHaveLength(2);
  });

  it("rejects an illegal transition without appending another event", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const task = await service.capture({ title: "已经完成" });
    await service.transition(task.id, "READY");
    await service.transition(task.id, "COMPLETED");

    await expect(service.transition(task.id, "DOING")).rejects.toThrow(
      "Task cannot transition from COMPLETED to DOING",
    );
    expect(state.events).toHaveLength(3);
  });

  it("keeps completed tasks available to the board for progress review", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const task = await service.capture({ title: "完成后仍可查看" });
    await service.transition(task.id, "READY");
    await service.transition(task.id, "COMPLETED");

    const boardTasks = await service.listBoardTasks();

    expect(boardTasks.map((candidate) => candidate.id)).toContain(task.id);
    expect(boardTasks.find((candidate) => candidate.id === task.id)?.status).toBe("COMPLETED");
  });

  it("adds a task to today without changing its execution status", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const task = await service.capture({ title: "今天真正要推进的事" });
    await service.transition(task.id, "READY");

    const item = await service.addToToday(task.id, "2026-07-24", "Asia/Shanghai");

    expect(item.section).toBe("FOCUS");
    expect(state.tasks.get(task.id)?.status).toBe("READY");
    expect(state.events.map((event) => event.type)).toContain("ADDED_TO_DAILY_PLAN");
  });

  it("keeps waiting tasks out of today's actionable plan", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const task = await service.capture({ title: "等待客户确认" });
    await service.transition(task.id, "WAITING");

    await expect(service.addToToday(task.id, "2026-07-24", "Asia/Shanghai")).rejects.toBeInstanceOf(
      TaskNotActionableForTodayError,
    );
  });

  it("shows a planned task in only one today section as its status changes", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const task = await service.capture({ title: "推进发布准备" });
    await service.transition(task.id, "READY");
    await service.addToToday(task.id, "2026-07-24", "Asia/Shanghai");

    await service.transition(task.id, "DOING");
    const doingView = await service.getToday("2026-07-24");
    expect(doingView.focus).toHaveLength(0);
    expect(doingView.doing.map((candidate) => candidate.id)).toEqual([task.id]);

    await service.transition(task.id, "WAITING");
    const waitingView = await service.getToday("2026-07-24");
    expect(waitingView.focus).toHaveLength(0);
    expect(waitingView.later).toHaveLength(0);
    expect(waitingView.doing).toHaveLength(0);
  });

  it("keeps an unplanned doing task visible in today after it is paused", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const task = await service.capture({ title: "专注后暂停" });
    await service.transition(task.id, "READY");
    await service.transition(task.id, "DOING");

    const paused = await service.pauseAndKeepToday(task.id, "2026-07-24", "Asia/Shanghai");
    const today = await service.getToday("2026-07-24");

    expect(paused.status).toBe("READY");
    expect(today.focus.map((entry) => entry.task.id)).toEqual([task.id]);
    expect(await service.isInTodayPlan(task.id, "2026-07-24")).toBe(true);
  });

  it("rejects a fourth doing task until the user explicitly overrides the limit", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const tasks: Task[] = [];

    for (let index = 0; index < 4; index += 1) {
      const task = await service.capture({ title: `任务 ${index + 1}` });
      tasks.push(await service.transition(task.id, "READY"));
    }

    for (const task of tasks.slice(0, 3)) {
      await service.transition(task.id, "DOING");
    }

    const fourthTask = tasks[3];
    expect(fourthTask).toBeDefined();
    await expect(service.transition(fourthTask!.id, "DOING")).rejects.toBeInstanceOf(
      WipLimitExceededError,
    );

    await service.transition(fourthTask!.id, "DOING", { allowWipOverride: true });
    expect(state.events.map((event) => event.type)).toContain("WIP_LIMIT_OVERRIDDEN");
  });

  it("allows another task to start after a doing task moves to waiting", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const tasks: Task[] = [];

    for (let index = 0; index < 4; index += 1) {
      const task = await service.capture({ title: `任务 ${index + 1}` });
      tasks.push(await service.transition(task.id, "READY"));
    }

    for (const task of tasks.slice(0, 3)) {
      await service.transition(task.id, "DOING");
    }

    await service.transition(tasks[0]!.id, "WAITING");
    const started = await service.transition(tasks[3]!.id, "DOING");

    expect(started.status).toBe("DOING");
  });

  it("loads configurable action limits before making WIP and focus decisions", async () => {
    const state = createMemoryDatabase();
    let id = 500;
    const service = new TaskApplicationService({
      database: state.database,
      userId: "local-user",
      generateId: () => `rules-id-${++id}`,
      now: () => `2026-07-24T13:${String(id - 500).padStart(2, "0")}:00.000Z`,
      loadRules: async () => ({
        focusLimit: 1,
        wipLimit: 1,
        staleDays: 10,
        waitingDays: 5,
      }),
    });
    const first = await service.capture({ title: "第一项" });
    const second = await service.capture({ title: "第二项" });
    await service.transition(first.id, "READY");
    await service.transition(second.id, "READY");
    await service.transition(first.id, "DOING");

    await expect(service.transition(second.id, "DOING")).rejects.toBeInstanceOf(
      WipLimitExceededError,
    );
    expect((await service.addToToday(first.id, "2026-07-24", "Asia/Shanghai")).section).toBe(
      "FOCUS",
    );
    expect((await service.addToToday(second.id, "2026-07-24", "Asia/Shanghai")).section).toBe(
      "LATER",
    );
  });

  it("uses one board operation to move tasks into and out of someday", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const captured = await service.capture({ title: "暂时不推进" });
    const ready = await service.transition(captured.id, "READY");
    await service.transition(ready.id, "DOING");

    const someday = await service.moveToBoardColumn(ready.id, "SOMEDAY");

    expect(someday.status).toBe("READY");
    expect(someday.visibility).toBe("SOMEDAY");

    const restored = await service.moveToBoardColumn(ready.id, "WAITING");

    expect(restored.status).toBe("WAITING");
    expect(restored.visibility).toBe("ACTIVE");
  });

  it("reactivates a snoozed task when the user explicitly adds it to today", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const captured = await service.capture({ title: "提醒后今天处理" });
    await service.transition(captured.id, "READY");
    await service.setReviewDate(captured.id, "2026-07-24");

    await service.addToToday(captured.id, "2026-07-24", "Asia/Shanghai");

    expect(state.tasks.get(captured.id)?.visibility).toBe("ACTIVE");
    expect((await service.getToday("2026-07-24")).focus[0]?.task.id).toBe(captured.id);
  });

  it("does not count snoozed doing work against the active WIP limit", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const snoozed = await service.capture({ title: "暂缓的进行中任务" });
    const next = await service.capture({ title: "当前真正推进的任务" });
    await service.transition(snoozed.id, "READY");
    await service.transition(next.id, "READY");
    await service.transition(snoozed.id, "DOING");
    await service.setReviewDate(snoozed.id, "2026-08-01");

    const started = await service.transition(next.id, "DOING");

    expect(started.status).toBe("DOING");
  });

  it("reactivates a snoozed task when review sends it back to ready", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const captured = await service.capture({ title: "提醒后重新决定" });
    await service.transition(captured.id, "READY");
    await service.transition(captured.id, "WAITING");
    await service.setReviewDate(captured.id, "2026-08-01");

    const ready = await service.transition(captured.id, "READY");

    expect(ready.status).toBe("READY");
    expect(ready.visibility).toBe("ACTIVE");
  });

  it("reactivates reviewed doing work and restores its project focus", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const projects = createProjectService(state.database);
    const project = await projects.create({ name: "恢复推进的项目" });
    const task = await tasks.capture({ title: "提醒后继续推进", projectId: project.id });
    await tasks.transition(task.id, "READY");
    await tasks.transition(task.id, "DOING");
    await tasks.setReviewDate(task.id, "2026-08-01");

    const reviewed = await tasks.acknowledgeReview(task.id);

    expect(reviewed.visibility).toBe("ACTIVE");
    expect(state.projects.get(project.id)?.focusTaskId).toBe(task.id);
  });

  it("clears project focus when its task is snoozed until a review date", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const projects = createProjectService(state.database);
    const project = await projects.create({ name: "等待合适时间" });
    const focus = await tasks.capture({ title: "暂缓发布", projectId: project.id });
    await tasks.transition(focus.id, "READY");
    await projects.setFocusTask(project.id, focus.id);

    await tasks.setReviewDate(focus.id, "2026-08-01");

    const detail = await projects.getDetail(project.id, "2026-07-20T00:00:00.000Z");
    expect(state.projects.get(project.id)?.focusTaskId).toBeUndefined();
    expect(detail?.overview.focusTask).toBeUndefined();
    expect(detail?.nextCandidates).toHaveLength(0);
  });

  it("does not carry unfinished tasks into another date automatically", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database);
    const task = await service.capture({ title: "只属于今天" });
    await service.transition(task.id, "READY");
    await service.addToToday(task.id, "2026-07-24", "Asia/Shanghai");

    const tomorrow = await service.getToday("2026-07-25");

    expect(tomorrow.focus).toHaveLength(0);
    expect(tomorrow.later).toHaveLength(0);
  });

  it("enforces the configured focus limit even when focus is explicitly requested", async () => {
    const state = createMemoryDatabase();
    const service = createService(state.database, { focusLimit: 1 });
    const first = await service.capture({ title: "唯一焦点" });
    const second = await service.capture({ title: "转入之后可做" });
    await service.transition(first.id, "READY");
    await service.transition(second.id, "READY");

    const firstItem = await service.addToToday(first.id, "2026-07-24", "Asia/Shanghai", "FOCUS");
    const secondItem = await service.addToToday(second.id, "2026-07-24", "Asia/Shanghai", "FOCUS");

    expect(firstItem.section).toBe("FOCUS");
    expect(secondItem.section).toBe("LATER");
  });

  it("only allows a project task to become that project's focus", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const projects = createProjectService(state.database);
    const project = await projects.create({ name: "NextOne 产品开发" });
    const otherProject = await projects.create({ name: "另一个项目" });
    const task = await tasks.capture({ title: "实现项目页", projectId: otherProject.id });
    await tasks.transition(task.id, "READY");

    await expect(projects.setFocusTask(project.id, task.id)).rejects.toThrow(
      "Focus task must be an actionable task in this project",
    );
    expect(state.projects.get(project.id)?.focusTaskId).toBeUndefined();
  });

  it("replaces a project focus without changing the previous task status", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const projects = createProjectService(state.database);
    const project = await projects.create({ name: "NextOne 产品开发" });
    const previous = await tasks.capture({ title: "完成交互稿", projectId: project.id });
    const next = await tasks.capture({ title: "实现项目页", projectId: project.id });
    await tasks.transition(previous.id, "READY");
    await tasks.transition(previous.id, "DOING");
    await tasks.transition(next.id, "READY");
    await projects.setFocusTask(project.id, previous.id);

    await projects.setFocusTask(project.id, next.id);

    expect(state.projects.get(project.id)?.focusTaskId).toBe(next.id);
    expect(state.tasks.get(previous.id)?.status).toBe("DOING");
    expect(
      state.events.filter((event) => event.taskId === previous.id).map((event) => event.type),
    ).toContain("PROJECT_FOCUS_CLEARED");
    expect(
      state.events.filter((event) => event.taskId === next.id).map((event) => event.type),
    ).toContain("PROJECT_FOCUS_SET");
  });

  it("makes a started project task the current project focus", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const projects = createProjectService(state.database);
    const project = await projects.create({ name: "NextOne 产品开发" });
    const previous = await tasks.capture({ title: "原来的项目焦点", projectId: project.id });
    const started = await tasks.capture({ title: "实际开始推进的任务", projectId: project.id });
    await tasks.transition(previous.id, "READY");
    await tasks.transition(started.id, "READY");
    await projects.setFocusTask(project.id, previous.id);

    await tasks.transition(started.id, "DOING");

    expect(state.projects.get(project.id)?.focusTaskId).toBe(started.id);
    expect(state.tasks.get(previous.id)?.status).toBe("READY");
    expect(
      state.events.filter((event) => event.taskId === previous.id).map((event) => event.type),
    ).toContain("PROJECT_FOCUS_CLEARED");
    expect(
      state.events.filter((event) => event.taskId === started.id).map((event) => event.type),
    ).toContain("PROJECT_FOCUS_SET");
  });

  it("moves the focus with a doing task when its project changes", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const projects = createProjectService(state.database);
    const source = await projects.create({ name: "原项目" });
    const target = await projects.create({ name: "新项目" });
    const task = await tasks.capture({ title: "正在推进的任务", projectId: source.id });
    await tasks.transition(task.id, "READY");
    await tasks.transition(task.id, "DOING");

    await tasks.updateDetails(task.id, {
      title: task.title,
      note: null,
      projectId: target.id,
      parentTaskId: null,
      deadlineAt: null,
      reviewAt: null,
      estimateMinutes: null,
      energyLevel: null,
      waitingFor: null,
    });

    expect(state.projects.get(source.id)?.focusTaskId).toBeUndefined();
    expect(state.projects.get(target.id)?.focusTaskId).toBe(task.id);

    const targetDetail = await projects.getDetail(target.id, "2026-07-20T00:00:00.000Z");
    expect(targetDetail?.recentActivity.map(({ event }) => event.type)).toEqual([
      "PROJECT_CHANGED",
      "PROJECT_FOCUS_SET",
    ]);
  });

  it("clears a completed focus and recommends only the next ready task", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const projects = createProjectService(state.database);
    const project = await projects.create({ name: "NextOne 产品开发" });
    const focus = await tasks.capture({ title: "完成 M3", projectId: project.id });
    const next = await tasks.capture({ title: "准备 M4", projectId: project.id });
    const waiting = await tasks.capture({ title: "等待反馈", projectId: project.id });
    await tasks.transition(focus.id, "READY");
    await tasks.transition(next.id, "READY");
    await tasks.transition(waiting.id, "WAITING");
    await projects.setFocusTask(project.id, focus.id);

    await tasks.transition(focus.id, "COMPLETED");
    const detail = await projects.getDetail(project.id, "2026-07-20T00:00:00.000Z");

    expect(state.projects.get(project.id)?.focusTaskId).toBeUndefined();
    expect(detail?.overview.needsFocusDecision).toBe(true);
    expect(detail?.nextCandidates.map((task) => task.id)).toEqual([next.id]);
    expect(detail?.waiting.map((task) => task.id)).toEqual([waiting.id]);
    expect(detail?.overview.progress).toEqual({
      ready: 1,
      doing: 0,
      waiting: 1,
      completed: 1,
      total: 3,
      completedPercent: 33,
    });
    expect(state.events.map((event) => event.type)).toContain("PROJECT_FOCUS_CLEARED");
  });

  it("builds a three-level project structure and derives work-package progress", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const projects = createProjectService(state.database);
    const project = await projects.create({ name: "发布 NextOne" });
    const workstream = await tasks.capture({
      title: "Web 版本",
      projectId: project.id,
      kind: "WORK_PACKAGE",
    });
    await tasks.transition(workstream.id, "READY");
    const milestone = await tasks.capture({
      title: "上线验收",
      projectId: project.id,
      parentTaskId: workstream.id,
      kind: "WORK_PACKAGE",
    });
    await tasks.transition(milestone.id, "READY");
    const action = await tasks.capture({
      title: "完成回归测试",
      projectId: project.id,
      parentTaskId: milestone.id,
    });
    await tasks.transition(action.id, "READY");
    await tasks.transition(action.id, "COMPLETED");

    const detail = await projects.getDetail(project.id, "2026-07-20T00:00:00.000Z");
    const board = await tasks.listBoardTasks();

    expect(detail?.structure).toHaveLength(1);
    expect(detail?.structure[0]?.task.id).toBe(workstream.id);
    expect(detail?.structure[0]?.children[0]?.task.id).toBe(milestone.id);
    expect(detail?.structure[0]?.children[0]?.children[0]?.task.id).toBe(action.id);
    expect(detail?.structure[0]?.progress.completedPercent).toBe(100);
    expect(board.map((task) => task.id)).toEqual([action.id]);
  });

  it("rejects work packages deeper than the supported project structure", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const projects = createProjectService(state.database);
    const project = await projects.create({ name: "层级边界" });
    const root = await tasks.capture({
      title: "第一层",
      projectId: project.id,
      kind: "WORK_PACKAGE",
    });
    const second = await tasks.capture({
      title: "第二层",
      projectId: project.id,
      parentTaskId: root.id,
      kind: "WORK_PACKAGE",
    });

    await expect(
      tasks.capture({
        title: "不允许的第三层工作包",
        projectId: project.id,
        parentTaskId: second.id,
        kind: "WORK_PACKAGE",
      }),
    ).rejects.toThrow("at most three levels");
  });

  it("clears project focus when the next step becomes externally blocked", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const projects = createProjectService(state.database);
    const project = await projects.create({ name: "等待发布审批" });
    const focus = await tasks.capture({ title: "提交应用商店审核", projectId: project.id });
    await tasks.transition(focus.id, "READY");
    await projects.setFocusTask(project.id, focus.id);

    await tasks.transition(focus.id, "WAITING");

    expect(state.projects.get(project.id)?.focusTaskId).toBeUndefined();
    await expect(projects.setFocusTask(project.id, focus.id)).rejects.toThrow(
      "Focus task must be an actionable task in this project",
    );
  });

  it("places active projects without a focus into the decision queue", async () => {
    const state = createMemoryDatabase();
    const projects = createProjectService(state.database);
    const project = await projects.create({ name: "需要确定下一步" });

    const overview = await projects.listOverview("2026-07-20T00:00:00.000Z");

    expect(overview).toHaveLength(1);
    expect(overview[0]?.project.id).toBe(project.id);
    expect(overview[0]?.needsFocusDecision).toBe(true);
    expect(overview[0]?.progress).toEqual({
      ready: 0,
      doing: 0,
      waiting: 0,
      completed: 0,
      total: 0,
      completedPercent: 0,
    });
  });

  it("records an explicit review and keeps the task out of the stale queue", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const review = createReviewService(state.database);
    const captured = await tasks.capture({ title: "仍然值得做" });
    await tasks.transition(captured.id, "READY");
    const current = state.tasks.get(captured.id);
    expect(current).toBeDefined();
    state.tasks.set(captured.id, {
      ...current!,
      updatedAt: "2026-06-01T00:00:00.000Z",
    });

    const before = await review.getCenter("2026-07-24T12:00:00.000Z");
    expect(before.items.map(({ task }) => task.id)).toContain(captured.id);

    const reviewed = await tasks.keepReadyAfterReview(captured.id);
    const after = await review.getCenter("2026-07-24T12:00:00.000Z");

    expect(reviewed.reviewedAt).toBe("2026-07-24T10:02:00.000Z");
    expect(after.items.map(({ task }) => task.id)).not.toContain(captured.id);
    expect(state.events.map((event) => event.type)).toContain("REVIEWED");
  });

  it("keeps a date-only deadline in the review queue through that local day", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const review = createReviewService(state.database);
    const captured = await tasks.capture({
      title: "今天截止的事项",
      deadlineAt: "2026-07-24",
    });
    await tasks.transition(captured.id, "READY");

    const center = await review.getCenter("2026-07-24T12:00:00.000Z");
    const item = center.items.find(({ task }) => task.id === captured.id);

    expect(item?.reasons).toContain("DEADLINE_SOON");
  });

  it("removes an acknowledged deadline decision from the review queue for the day", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const review = createReviewService(state.database);
    const captured = await tasks.capture({
      title: "今天已决定如何处理",
      deadlineAt: "2026-07-24",
    });
    await tasks.transition(captured.id, "READY");

    const before = await review.getCenter("2026-07-24T12:00:00.000Z");
    expect(before.items.map(({ task }) => task.id)).toContain(captured.id);

    await tasks.acknowledgeReview(captured.id);
    const after = await review.getCenter("2026-07-24T12:00:00.000Z");

    expect(after.items.map(({ task }) => task.id)).not.toContain(captured.id);
  });

  it("does not ask for another decision after a dated task is completed", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const review = createReviewService(state.database);
    const captured = await tasks.capture({
      title: "已经完成的到期事项",
      deadlineAt: "2026-07-24",
      reviewAt: "2026-07-24",
    });
    await tasks.transition(captured.id, "READY");
    await tasks.transition(captured.id, "COMPLETED");

    const center = await review.getCenter("2026-07-24T12:00:00.000Z");

    expect(center.items.map(({ task }) => task.id)).not.toContain(captured.id);
  });

  it("keeps an acknowledged review task in today while removing its decision card", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const review = createReviewService(state.database);
    const captured = await tasks.capture({
      title: "加入今天后给出明确反馈",
      deadlineAt: "2026-07-24",
    });
    await tasks.transition(captured.id, "READY");

    await tasks.addToToday(captured.id, "2026-07-24", "Asia/Shanghai");
    await tasks.acknowledgeReview(captured.id);

    const today = await tasks.getToday("2026-07-24");
    const center = await review.getCenter("2026-07-24T12:00:00.000Z");

    expect(today.focus.map(({ task }) => task.id)).toContain(captured.id);
    expect(center.items.map(({ task }) => task.id)).not.toContain(captured.id);
  });

  it("separates unfinished and completed work during daily close", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const review = createReviewService(state.database);
    const completedTask = await tasks.capture({ title: "收尾时确认结果" });
    const waitingTask = await tasks.capture({ title: "等待外部回复" });
    await tasks.transition(completedTask.id, "READY");
    await tasks.transition(waitingTask.id, "READY");
    await tasks.addToToday(completedTask.id, "2026-07-24", "Asia/Shanghai");
    await tasks.addToToday(waitingTask.id, "2026-07-24", "Asia/Shanghai");

    const before = await review.getDailyClose("2026-07-24");
    expect(before.unfinished.map(({ task }) => task.id)).toEqual([
      completedTask.id,
      waitingTask.id,
    ]);
    expect(before.completed).toHaveLength(0);

    await tasks.transition(completedTask.id, "COMPLETED");
    await tasks.transition(waitingTask.id, "WAITING");
    const after = await review.getDailyClose("2026-07-24");

    expect(after.unfinished).toHaveLength(0);
    expect(after.completed.map(({ task }) => task.id)).toEqual([completedTask.id]);
  });

  it("moves an unfinished task out of today when explicitly continued tomorrow", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const captured = await tasks.capture({ title: "明天继续推进" });
    await tasks.transition(captured.id, "READY");
    await tasks.addToToday(captured.id, "2026-07-24", "Asia/Shanghai");
    await tasks.transition(captured.id, "DOING");

    await tasks.continueTomorrow(captured.id, "2026-07-24", "2026-07-25", "Asia/Shanghai", "FOCUS");

    const today = await tasks.getToday("2026-07-24");
    const tomorrow = await tasks.getToday("2026-07-25");
    const task = await tasks.findTask(captured.id);

    expect(today.focus).toHaveLength(0);
    expect(today.doing).toHaveLength(0);
    expect(tomorrow.focus.map((entry) => entry.task.id)).toEqual([captured.id]);
    expect(task?.status).toBe("READY");
  });

  it("includes active doing work in daily close even when it was started outside today", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const review = createReviewService(state.database);
    const captured = await tasks.capture({ title: "从总看板直接开始" });
    await tasks.transition(captured.id, "READY");
    await tasks.transition(captured.id, "DOING");

    const close = await review.getDailyClose("2026-07-24");

    expect(close.plan).toBeUndefined();
    expect(close.unfinished.map(({ task }) => task.id)).toEqual([captured.id]);
  });

  it("keeps unplanned work in daily close after it is paused or completed", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const review = createReviewService(state.database);
    const paused = await tasks.capture({ title: "开始后暂停" });
    const completed = await tasks.capture({ title: "开始后完成" });
    await tasks.transition(paused.id, "READY");
    await tasks.transition(completed.id, "READY");
    await tasks.transition(paused.id, "DOING");
    await tasks.transition(paused.id, "READY");
    await tasks.transition(completed.id, "DOING");
    await tasks.transition(completed.id, "COMPLETED");

    const close = await review.getDailyClose("2026-07-24", "UTC");

    expect(close.unfinished.map(({ task }) => task.id)).toContain(paused.id);
    expect(close.completed.map(({ task }) => task.id)).toContain(completed.id);
  });

  it("keeps canceled work queryable in the activity log", async () => {
    const state = createMemoryDatabase();
    const tasks = createService(state.database);
    const review = createReviewService(state.database);
    const task = await tasks.capture({ title: "主动放弃的事项" });
    await tasks.transition(task.id, "CANCELED");

    const activity = await review.getActivity();

    expect(activity.some((entry) => entry.type === "CANCELED" && entry.task?.id === task.id)).toBe(
      true,
    );
  });
});
