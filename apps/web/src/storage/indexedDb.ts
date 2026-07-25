import type { Area, DailyPlan, DailyPlanItem, Project, Task, TaskEvent } from "@nextone/domain";
import type {
  AreaRepository,
  DailyPlanItemRepository,
  DailyPlanRepository,
  LocalDatabase,
  OutboxMutation,
  OutboxRepository,
  ProjectQuery,
  ProjectRepository,
  StorageTransaction,
  TaskEventRepository,
  TaskQuery,
  TaskRepository,
} from "@nextone/storage-contracts";

const databaseName = "nextone";
const databaseVersion = 2;

const stores = {
  tasks: "tasks",
  areas: "areas",
  projects: "projects",
  taskEvents: "taskEvents",
  dailyPlans: "dailyPlans",
  dailyPlanItems: "dailyPlanItems",
  outbox: "outbox",
} as const;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("IndexedDB request failed")),
      { once: true },
    );
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () => reject(transaction.error ?? new Error("IndexedDB transaction failed")),
      { once: true },
    );
  });
}

function createSchema(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(stores.tasks)) {
    const taskStore = database.createObjectStore(stores.tasks, { keyPath: "id" });
    taskStore.createIndex("status", "status", { unique: false });
    taskStore.createIndex("projectId", "projectId", { unique: false });
    taskStore.createIndex("createdAt", "createdAt", { unique: false });
  }

  if (!database.objectStoreNames.contains(stores.areas)) {
    database.createObjectStore(stores.areas, { keyPath: "id" });
  }

  if (!database.objectStoreNames.contains(stores.projects)) {
    const projectStore = database.createObjectStore(stores.projects, { keyPath: "id" });
    projectStore.createIndex("areaId", "areaId", { unique: false });
    projectStore.createIndex("status", "status", { unique: false });
  }

  if (!database.objectStoreNames.contains(stores.taskEvents)) {
    const eventStore = database.createObjectStore(stores.taskEvents, { keyPath: "id" });
    eventStore.createIndex("taskId", "taskId", { unique: false });
    eventStore.createIndex("occurredAt", "occurredAt", { unique: false });
  }

  if (!database.objectStoreNames.contains(stores.dailyPlans)) {
    const planStore = database.createObjectStore(stores.dailyPlans, { keyPath: "id" });
    planStore.createIndex("userDate", ["userId", "localDate"], { unique: true });
  }

  if (!database.objectStoreNames.contains(stores.dailyPlanItems)) {
    const planItemStore = database.createObjectStore(stores.dailyPlanItems, { keyPath: "id" });
    planItemStore.createIndex("planId", "planId", { unique: false });
    planItemStore.createIndex("planTask", ["planId", "taskId"], { unique: true });
  }

  if (!database.objectStoreNames.contains(stores.outbox)) {
    const outboxStore = database.createObjectStore(stores.outbox, { keyPath: "id" });
    outboxStore.createIndex("createdAt", "createdAt", { unique: false });
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.addEventListener(
      "upgradeneeded",
      () => {
        createSchema(request.result);
      },
      { once: true },
    );
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("Unable to open IndexedDB")),
      { once: true },
    );
    request.addEventListener(
      "blocked",
      () => reject(new Error("IndexedDB upgrade is blocked by another tab")),
      { once: true },
    );
  });
}

class IndexedDbTaskRepository implements TaskRepository {
  constructor(private readonly store: IDBObjectStore) {}

  async findById(id: string): Promise<Task | undefined> {
    return requestToPromise(this.store.get(id) as IDBRequest<Task | undefined>);
  }

  async list(query?: TaskQuery): Promise<readonly Task[]> {
    const tasks = await requestToPromise(this.store.getAll() as IDBRequest<Task[]>);

    return tasks
      .filter(
        (task) =>
          (query?.status === undefined || task.status === query.status) &&
          (query?.statuses === undefined || query.statuses.includes(task.status)) &&
          (query?.projectId === undefined || task.projectId === query.projectId) &&
          (query?.includeCanceled === true || task.status !== "CANCELED"),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async save(task: Task): Promise<void> {
    await requestToPromise(this.store.put(task));
  }
}

class IndexedDbAreaRepository implements AreaRepository {
  constructor(private readonly store: IDBObjectStore) {}

  async findById(id: string): Promise<Area | undefined> {
    return requestToPromise(this.store.get(id) as IDBRequest<Area | undefined>);
  }

  async list(): Promise<readonly Area[]> {
    const areas = await requestToPromise(this.store.getAll() as IDBRequest<Area[]>);
    return areas.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  }

  async save(area: Area): Promise<void> {
    await requestToPromise(this.store.put(area));
  }
}

class IndexedDbProjectRepository implements ProjectRepository {
  constructor(private readonly store: IDBObjectStore) {}

  async findById(id: string): Promise<Project | undefined> {
    return requestToPromise(this.store.get(id) as IDBRequest<Project | undefined>);
  }

  async list(query?: ProjectQuery): Promise<readonly Project[]> {
    const projects = await requestToPromise(this.store.getAll() as IDBRequest<Project[]>);

    return projects
      .filter(
        (project) =>
          (query?.areaId === undefined || project.areaId === query.areaId) &&
          (query?.status === undefined || project.status === query.status),
      )
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  }

  async save(project: Project): Promise<void> {
    await requestToPromise(this.store.put(project));
  }
}

class IndexedDbTaskEventRepository implements TaskEventRepository {
  constructor(private readonly store: IDBObjectStore) {}

  async listByTaskId(taskId: string): Promise<readonly TaskEvent[]> {
    const events = await requestToPromise(
      this.store.index("taskId").getAll(taskId) as IDBRequest<TaskEvent[]>,
    );
    return events.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }

  async append(event: TaskEvent): Promise<void> {
    await requestToPromise(this.store.add(event));
  }
}

class IndexedDbDailyPlanRepository implements DailyPlanRepository {
  constructor(private readonly store: IDBObjectStore) {}

  async findByDate(userId: string, localDate: string): Promise<DailyPlan | undefined> {
    return requestToPromise(
      this.store.index("userDate").get([userId, localDate]) as IDBRequest<DailyPlan | undefined>,
    );
  }

  async save(plan: DailyPlan): Promise<void> {
    await requestToPromise(this.store.put(plan));
  }
}

class IndexedDbDailyPlanItemRepository implements DailyPlanItemRepository {
  constructor(private readonly store: IDBObjectStore) {}

  async findByTask(planId: string, taskId: string): Promise<DailyPlanItem | undefined> {
    return requestToPromise(
      this.store.index("planTask").get([planId, taskId]) as IDBRequest<DailyPlanItem | undefined>,
    );
  }

  async listByPlanId(planId: string): Promise<readonly DailyPlanItem[]> {
    const items = await requestToPromise(
      this.store.index("planId").getAll(planId) as IDBRequest<DailyPlanItem[]>,
    );
    return items.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  }

  async save(item: DailyPlanItem): Promise<void> {
    await requestToPromise(this.store.put(item));
  }

  async remove(id: string): Promise<void> {
    await requestToPromise(this.store.delete(id));
  }
}

class IndexedDbOutboxRepository implements OutboxRepository {
  constructor(private readonly store: IDBObjectStore) {}

  async listPending(): Promise<readonly OutboxMutation[]> {
    const mutations = await requestToPromise(this.store.getAll() as IDBRequest<OutboxMutation[]>);
    return mutations.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async append(mutation: OutboxMutation): Promise<void> {
    await requestToPromise(this.store.add(mutation));
  }

  async remove(id: string): Promise<void> {
    await requestToPromise(this.store.delete(id));
  }
}

export class IndexedDbLocalDatabase implements LocalDatabase {
  private databasePromise: Promise<IDBDatabase> | undefined;

  private getDatabase(): Promise<IDBDatabase> {
    this.databasePromise ??= openDatabase();
    return this.databasePromise;
  }

  async transaction<T>(work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {
    const database = await this.getDatabase();
    const indexedDbTransaction = database.transaction(Object.values(stores), "readwrite");
    const completion = transactionToPromise(indexedDbTransaction);
    const transaction: StorageTransaction = {
      tasks: new IndexedDbTaskRepository(indexedDbTransaction.objectStore(stores.tasks)),
      areas: new IndexedDbAreaRepository(indexedDbTransaction.objectStore(stores.areas)),
      projects: new IndexedDbProjectRepository(indexedDbTransaction.objectStore(stores.projects)),
      taskEvents: new IndexedDbTaskEventRepository(
        indexedDbTransaction.objectStore(stores.taskEvents),
      ),
      dailyPlans: new IndexedDbDailyPlanRepository(
        indexedDbTransaction.objectStore(stores.dailyPlans),
      ),
      dailyPlanItems: new IndexedDbDailyPlanItemRepository(
        indexedDbTransaction.objectStore(stores.dailyPlanItems),
      ),
      outbox: new IndexedDbOutboxRepository(indexedDbTransaction.objectStore(stores.outbox)),
    };

    try {
      const result = await work(transaction);
      await completion;
      return result;
    } catch (error) {
      try {
        indexedDbTransaction.abort();
      } catch {
        // The transaction may already have completed or aborted.
      }
      throw error;
    }
  }
}

export const nextOneDatabase = new IndexedDbLocalDatabase();
