import type { Area, DailyPlan, DailyPlanItem, Project, Task, TaskEvent } from "@nextone/domain";
import type {
  AreaRepository,
  DataManagementRepository,
  DailyPlanItemRepository,
  DailyPlanRepository,
  LocalDatabase,
  LocalDataSnapshot,
  OutboxMutation,
  OutboxRepository,
  ProjectQuery,
  ProjectRepository,
  RestorePoint,
  RestorePointRepository,
  StorageTransaction,
  SyncConflict,
  SyncConflictRepository,
  SyncState,
  SyncStateRepository,
  TaskEventRepository,
  TaskQuery,
  TaskRepository,
  UserPreferences,
  UserPreferencesRepository,
} from "@nextone/storage-contracts";

const databaseName = "nextone";
const databaseVersion = 4;

const stores = {
  tasks: "tasks",
  areas: "areas",
  projects: "projects",
  taskEvents: "taskEvents",
  dailyPlans: "dailyPlans",
  dailyPlanItems: "dailyPlanItems",
  outbox: "outbox",
  syncState: "syncState",
  syncConflicts: "syncConflicts",
  preferences: "preferences",
  restorePoints: "restorePoints",
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

  if (!database.objectStoreNames.contains(stores.syncState)) {
    database.createObjectStore(stores.syncState, { keyPath: "id" });
  }

  if (!database.objectStoreNames.contains(stores.syncConflicts)) {
    const conflictStore = database.createObjectStore(stores.syncConflicts, { keyPath: "id" });
    conflictStore.createIndex("createdAt", "createdAt", { unique: false });
  }

  if (!database.objectStoreNames.contains(stores.preferences)) {
    database.createObjectStore(stores.preferences, { keyPath: "id" });
  }

  if (!database.objectStoreNames.contains(stores.restorePoints)) {
    const restorePointStore = database.createObjectStore(stores.restorePoints, {
      keyPath: "id",
    });
    restorePointStore.createIndex("createdAt", "createdAt", { unique: false });
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
          task.deletedAt === undefined &&
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
          project.deletedAt === undefined &&
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

  async listAll(): Promise<readonly TaskEvent[]> {
    const events = await requestToPromise(this.store.getAll() as IDBRequest<TaskEvent[]>);
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
    const now = new Date().toISOString();
    return mutations
      .filter(
        (mutation) =>
          mutation.status !== "BLOCKED" &&
          (mutation.nextAttemptAt === undefined || mutation.nextAttemptAt <= now),
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async listAll(): Promise<readonly OutboxMutation[]> {
    const mutations = await requestToPromise(this.store.getAll() as IDBRequest<OutboxMutation[]>);
    return mutations.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async append(mutation: OutboxMutation): Promise<void> {
    await requestToPromise(this.store.add(mutation));
  }

  async update(mutation: OutboxMutation): Promise<void> {
    await requestToPromise(this.store.put(mutation));
  }

  async remove(id: string): Promise<void> {
    await requestToPromise(this.store.delete(id));
  }
}

class IndexedDbSyncStateRepository implements SyncStateRepository {
  constructor(private readonly store: IDBObjectStore) {}

  async get(): Promise<SyncState | undefined> {
    return requestToPromise(this.store.get("default") as IDBRequest<SyncState | undefined>);
  }

  async save(state: SyncState): Promise<void> {
    await requestToPromise(this.store.put(state));
  }
}

class IndexedDbSyncConflictRepository implements SyncConflictRepository {
  constructor(private readonly store: IDBObjectStore) {}

  async listOpen(): Promise<readonly SyncConflict[]> {
    const conflicts = await requestToPromise(this.store.getAll() as IDBRequest<SyncConflict[]>);
    return conflicts
      .filter((conflict) => conflict.resolvedAt === undefined)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async save(conflict: SyncConflict): Promise<void> {
    await requestToPromise(this.store.put(conflict));
  }
}

class IndexedDbUserPreferencesRepository implements UserPreferencesRepository {
  constructor(private readonly store: IDBObjectStore) {}

  async get(): Promise<UserPreferences | undefined> {
    return requestToPromise(this.store.get("default") as IDBRequest<UserPreferences | undefined>);
  }

  async save(preferences: UserPreferences): Promise<void> {
    await requestToPromise(this.store.put(preferences));
  }
}

class IndexedDbRestorePointRepository implements RestorePointRepository {
  constructor(private readonly store: IDBObjectStore) {}

  async list(): Promise<readonly RestorePoint[]> {
    const restorePoints = await requestToPromise(this.store.getAll() as IDBRequest<RestorePoint[]>);
    return restorePoints.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findById(id: string): Promise<RestorePoint | undefined> {
    return requestToPromise(this.store.get(id) as IDBRequest<RestorePoint | undefined>);
  }

  async save(restorePoint: RestorePoint): Promise<void> {
    await requestToPromise(this.store.put(restorePoint));
  }

  async remove(id: string): Promise<void> {
    await requestToPromise(this.store.delete(id));
  }
}

class IndexedDbDataManagementRepository implements DataManagementRepository {
  constructor(private readonly objectStores: Readonly<Record<string, IDBObjectStore>>) {}

  private store(name: keyof typeof stores): IDBObjectStore {
    const store = this.objectStores[stores[name]];
    if (store === undefined) {
      throw new Error(`IndexedDB store ${name} is unavailable`);
    }
    return store;
  }

  async exportSnapshot(exportedAt: string): Promise<LocalDataSnapshot> {
    const [tasks, areas, projects, taskEvents, dailyPlans, dailyPlanItems, preferences] =
      await Promise.all([
        requestToPromise(this.store("tasks").getAll() as IDBRequest<Task[]>),
        requestToPromise(this.store("areas").getAll() as IDBRequest<Area[]>),
        requestToPromise(this.store("projects").getAll() as IDBRequest<Project[]>),
        requestToPromise(this.store("taskEvents").getAll() as IDBRequest<TaskEvent[]>),
        requestToPromise(this.store("dailyPlans").getAll() as IDBRequest<DailyPlan[]>),
        requestToPromise(this.store("dailyPlanItems").getAll() as IDBRequest<DailyPlanItem[]>),
        requestToPromise(
          this.store("preferences").get("default") as IDBRequest<UserPreferences | undefined>,
        ),
      ]);
    return {
      schemaVersion: 1,
      exportedAt,
      tasks,
      areas,
      projects,
      taskEvents,
      dailyPlans,
      dailyPlanItems,
      ...(preferences === undefined ? {} : { preferences }),
    };
  }

  async replaceWithSnapshot(snapshot: LocalDataSnapshot, occurredAt: string): Promise<void> {
    const replaceableStores = [
      "tasks",
      "areas",
      "projects",
      "taskEvents",
      "dailyPlans",
      "dailyPlanItems",
      "outbox",
      "syncState",
      "syncConflicts",
      "preferences",
    ] as const;
    for (const storeName of replaceableStores) {
      await requestToPromise(this.store(storeName).clear());
    }
    for (const value of snapshot.areas) {
      await requestToPromise(this.store("areas").put(value));
    }
    for (const value of snapshot.projects) {
      await requestToPromise(this.store("projects").put(value));
    }
    for (const value of snapshot.tasks) {
      await requestToPromise(this.store("tasks").put(value));
    }
    for (const value of snapshot.taskEvents) {
      await requestToPromise(this.store("taskEvents").put(value));
    }
    for (const value of snapshot.dailyPlans) {
      await requestToPromise(this.store("dailyPlans").put(value));
    }
    for (const value of snapshot.dailyPlanItems) {
      await requestToPromise(this.store("dailyPlanItems").put(value));
    }
    if (snapshot.preferences !== undefined) {
      await requestToPromise(this.store("preferences").put(snapshot.preferences));
    }

    const syncEntities: readonly {
      entityType: OutboxMutation["entityType"];
      id: string;
      revision: number;
      deleted: boolean;
      payload: unknown;
    }[] = [
      ...snapshot.projects.map((project) => ({
        entityType: "PROJECT" as const,
        id: project.id,
        revision: project.revision,
        deleted: project.deletedAt !== undefined,
        payload: project,
      })),
      ...snapshot.tasks.map((task) => ({
        entityType: "TASK" as const,
        id: task.id,
        revision: task.revision,
        deleted: task.deletedAt !== undefined,
        payload: task,
      })),
      ...snapshot.dailyPlans.map((plan) => ({
        entityType: "DAILY_PLAN" as const,
        id: plan.id,
        revision: plan.revision,
        deleted: false,
        payload: plan,
      })),
      ...snapshot.dailyPlanItems.map((item) => ({
        entityType: "DAILY_PLAN_ITEM" as const,
        id: item.id,
        revision: 0,
        deleted: false,
        payload: item,
      })),
    ];
    for (const entity of syncEntities) {
      const mutation: OutboxMutation = {
        id: crypto.randomUUID(),
        userId: "local-user",
        entityType: entity.entityType,
        entityId: entity.id,
        operation: entity.deleted ? "DELETE" : "UPSERT",
        baseRevision: Math.max(0, entity.revision - 1),
        payload: entity.payload,
        createdAt: occurredAt,
        attempts: 0,
      };
      await requestToPromise(this.store("outbox").put(mutation));
    }
  }

  async clearLocalCopy(): Promise<void> {
    for (const storeName of Object.keys(this.objectStores)) {
      const store = this.objectStores[storeName];
      if (store !== undefined) {
        await requestToPromise(store.clear());
      }
    }
  }
}

export class IndexedDbLocalDatabase implements LocalDatabase {
  private databasePromise: Promise<IDBDatabase> | undefined;

  private getDatabase(): Promise<IDBDatabase> {
    this.databasePromise ??= openDatabase();
    return this.databasePromise;
  }

  async replaceWithServerSnapshot(
    snapshot: LocalDataSnapshot,
    cursor: number,
    synchronizedAt: string,
  ): Promise<void> {
    const database = await this.getDatabase();
    const serverControlledStores = [
      stores.tasks,
      stores.areas,
      stores.projects,
      stores.taskEvents,
      stores.dailyPlans,
      stores.dailyPlanItems,
      stores.outbox,
      stores.syncState,
      stores.syncConflicts,
    ] as const;
    const indexedDbTransaction = database.transaction(serverControlledStores, "readwrite");
    const completion = transactionToPromise(indexedDbTransaction);

    for (const storeName of serverControlledStores) {
      await requestToPromise(indexedDbTransaction.objectStore(storeName).clear());
    }
    for (const value of snapshot.areas) {
      await requestToPromise(indexedDbTransaction.objectStore(stores.areas).put(value));
    }
    for (const value of snapshot.projects) {
      await requestToPromise(indexedDbTransaction.objectStore(stores.projects).put(value));
    }
    for (const value of snapshot.tasks) {
      await requestToPromise(indexedDbTransaction.objectStore(stores.tasks).put(value));
    }
    for (const value of snapshot.taskEvents) {
      await requestToPromise(indexedDbTransaction.objectStore(stores.taskEvents).put(value));
    }
    for (const value of snapshot.dailyPlans) {
      await requestToPromise(indexedDbTransaction.objectStore(stores.dailyPlans).put(value));
    }
    for (const value of snapshot.dailyPlanItems) {
      await requestToPromise(indexedDbTransaction.objectStore(stores.dailyPlanItems).put(value));
    }
    await requestToPromise(
      indexedDbTransaction.objectStore(stores.syncState).put({
        id: "default",
        cursor,
        status: "UP_TO_DATE",
        lastSyncAt: synchronizedAt,
        retryCount: 0,
      } satisfies SyncState),
    );
    await completion;
  }

  async transaction<T>(work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {
    const database = await this.getDatabase();
    const indexedDbTransaction = database.transaction(Object.values(stores), "readwrite");
    const completion = transactionToPromise(indexedDbTransaction);
    const objectStores = Object.fromEntries(
      Object.values(stores).map((storeName) => [
        storeName,
        indexedDbTransaction.objectStore(storeName),
      ]),
    );
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
      syncState: new IndexedDbSyncStateRepository(
        indexedDbTransaction.objectStore(stores.syncState),
      ),
      syncConflicts: new IndexedDbSyncConflictRepository(
        indexedDbTransaction.objectStore(stores.syncConflicts),
      ),
      preferences: new IndexedDbUserPreferencesRepository(
        indexedDbTransaction.objectStore(stores.preferences),
      ),
      restorePoints: new IndexedDbRestorePointRepository(
        indexedDbTransaction.objectStore(stores.restorePoints),
      ),
      dataManagement: new IndexedDbDataManagementRepository(objectStores),
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
