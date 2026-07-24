import type { Task, TaskEvent } from "@nextone/domain";
import type {
  AreaRepository,
  LocalDatabase,
  OutboxMutation,
  OutboxRepository,
  ProjectRepository,
  StorageTransaction,
  TaskEventRepository,
  TaskQuery,
  TaskRepository,
} from "@nextone/storage-contracts";
import { describe, expect, it } from "vitest";

import { TaskApplicationService } from "../src";

class MemoryTaskRepository implements TaskRepository {
  constructor(private readonly tasks: Map<string, Task>) {}

  async findById(id: string): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async list(query?: TaskQuery): Promise<readonly Task[]> {
    return [...this.tasks.values()].filter(
      (task) =>
        (query?.status === undefined || task.status === query.status) &&
        (query?.includeCanceled === true || task.status !== "CANCELED"),
    );
  }

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }
}

class MemoryEventRepository implements TaskEventRepository {
  constructor(private readonly events: TaskEvent[]) {}

  async listByTaskId(taskId: string): Promise<readonly TaskEvent[]> {
    return this.events.filter((event) => event.taskId === taskId);
  }

  async append(event: TaskEvent): Promise<void> {
    this.events.push(event);
  }
}

class MemoryOutboxRepository implements OutboxRepository {
  constructor(private readonly mutations: OutboxMutation[]) {}

  async listPending(): Promise<readonly OutboxMutation[]> {
    return this.mutations;
  }

  async append(mutation: OutboxMutation): Promise<void> {
    this.mutations.push(mutation);
  }

  async remove(id: string): Promise<void> {
    const index = this.mutations.findIndex((mutation) => mutation.id === id);
    if (index >= 0) {
      this.mutations.splice(index, 1);
    }
  }
}

function createMemoryDatabase() {
  const tasks = new Map<string, Task>();
  const events: TaskEvent[] = [];
  const outbox: OutboxMutation[] = [];
  const unsupportedAreaRepository = {} as AreaRepository;
  const unsupportedProjectRepository = {} as ProjectRepository;
  const transaction: StorageTransaction = {
    tasks: new MemoryTaskRepository(tasks),
    areas: unsupportedAreaRepository,
    projects: unsupportedProjectRepository,
    taskEvents: new MemoryEventRepository(events),
    outbox: new MemoryOutboxRepository(outbox),
  };
  const database: LocalDatabase = {
    transaction: async <T>(work: (value: StorageTransaction) => Promise<T>) => work(transaction),
  };

  return { database, tasks, events, outbox };
}

function createService(database: LocalDatabase) {
  let id = 0;
  let minute = 0;

  return new TaskApplicationService({
    database,
    userId: "local-user",
    generateId: () => `id-${++id}`,
    now: () => `2026-07-24T10:${String(minute++).padStart(2, "0")}:00.000Z`,
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
});
