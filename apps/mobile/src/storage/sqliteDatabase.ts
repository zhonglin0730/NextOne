import { randomUUID } from "expo-crypto";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import type {
  Area,
  DailyPlan,
  DailyPlanItem,
  Project,
  Task,
  TaskEvent,
  WorkPackage,
} from "@nextone/domain";
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
  WorkPackageQuery,
  WorkPackageRepository,
} from "@nextone/storage-contracts";

type SqlExecutor = Pick<SQLiteDatabase, "execAsync" | "getAllAsync" | "getFirstAsync" | "runAsync">;

type RecordKind =
  | "TASK"
  | "AREA"
  | "PROJECT"
  | "WORK_PACKAGE"
  | "TASK_EVENT"
  | "DAILY_PLAN"
  | "DAILY_PLAN_ITEM"
  | "OUTBOX"
  | "SYNC_STATE"
  | "SYNC_CONFLICT"
  | "PREFERENCES"
  | "RESTORE_POINT";

interface StoredRow {
  data: string;
}

interface RecordIndexes {
  userId?: string;
  status?: string;
  projectId?: string;
  planId?: string;
  taskId?: string;
  localDate?: string;
  sortKey?: string;
  occurredAt?: string;
}

const allKinds: readonly RecordKind[] = [
  "TASK",
  "AREA",
  "PROJECT",
  "WORK_PACKAGE",
  "TASK_EVENT",
  "DAILY_PLAN",
  "DAILY_PLAN_ITEM",
  "OUTBOX",
  "SYNC_STATE",
  "SYNC_CONFLICT",
  "PREFERENCES",
  "RESTORE_POINT",
];

const replaceableKinds = allKinds.filter((kind) => kind !== "RESTORE_POINT");

function parseRow<T>(row: StoredRow | null): T | undefined {
  return row === null ? undefined : (JSON.parse(row.data) as T);
}

async function findRecord<T>(
  executor: SqlExecutor,
  kind: RecordKind,
  id: string,
): Promise<T | undefined> {
  return parseRow<T>(
    await executor.getFirstAsync<StoredRow>(
      "SELECT data FROM nextone_records WHERE kind = ? AND id = ?",
      kind,
      id,
    ),
  );
}

async function listRecords<T>(executor: SqlExecutor, kind: RecordKind): Promise<T[]> {
  const rows = await executor.getAllAsync<StoredRow>(
    "SELECT data FROM nextone_records WHERE kind = ?",
    kind,
  );
  return rows.map((row) => JSON.parse(row.data) as T);
}

async function saveRecord(
  executor: SqlExecutor,
  kind: RecordKind,
  id: string,
  value: unknown,
  indexes: RecordIndexes = {},
): Promise<void> {
  await executor.runAsync(
    `INSERT INTO nextone_records (
       kind, id, data, user_id, status, project_id, plan_id, task_id,
       local_date, sort_key, occurred_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, id) DO UPDATE SET
       data = excluded.data,
       user_id = excluded.user_id,
       status = excluded.status,
       project_id = excluded.project_id,
       plan_id = excluded.plan_id,
       task_id = excluded.task_id,
       local_date = excluded.local_date,
       sort_key = excluded.sort_key,
       occurred_at = excluded.occurred_at`,
    kind,
    id,
    JSON.stringify(value),
    indexes.userId ?? null,
    indexes.status ?? null,
    indexes.projectId ?? null,
    indexes.planId ?? null,
    indexes.taskId ?? null,
    indexes.localDate ?? null,
    indexes.sortKey ?? null,
    indexes.occurredAt ?? null,
  );
}

async function removeRecord(executor: SqlExecutor, kind: RecordKind, id: string): Promise<void> {
  await executor.runAsync("DELETE FROM nextone_records WHERE kind = ? AND id = ?", kind, id);
}

async function clearKinds(executor: SqlExecutor, kinds: readonly RecordKind[]): Promise<void> {
  for (const kind of kinds) {
    await executor.runAsync("DELETE FROM nextone_records WHERE kind = ?", kind);
  }
}

function taskRepository(executor: SqlExecutor): TaskRepository {
  return {
    findById: (id) => findRecord<Task>(executor, "TASK", id),
    async list(query?: TaskQuery) {
      const tasks = await listRecords<Task>(executor, "TASK");
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
    },
    save: (task) =>
      saveRecord(executor, "TASK", task.id, task, {
        userId: task.userId,
        status: task.status,
        projectId: task.projectId,
        sortKey: task.sortKey,
      }),
  };
}

function areaRepository(executor: SqlExecutor): AreaRepository {
  return {
    findById: (id) => findRecord<Area>(executor, "AREA", id),
    async list() {
      const areas = await listRecords<Area>(executor, "AREA");
      return areas.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
    },
    save: (area) =>
      saveRecord(executor, "AREA", area.id, area, {
        userId: area.userId,
        sortKey: area.sortKey,
      }),
  };
}

function projectRepository(executor: SqlExecutor): ProjectRepository {
  return {
    findById: (id) => findRecord<Project>(executor, "PROJECT", id),
    async list(query?: ProjectQuery) {
      const projects = await listRecords<Project>(executor, "PROJECT");
      return projects
        .filter(
          (project) =>
            project.deletedAt === undefined &&
            (query?.areaId === undefined || project.areaId === query.areaId) &&
            (query?.status === undefined || project.status === query.status),
        )
        .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
    },
    save: (project) =>
      saveRecord(executor, "PROJECT", project.id, project, {
        userId: project.userId,
        status: project.status,
        sortKey: project.sortKey,
      }),
  };
}

function workPackageRepository(executor: SqlExecutor): WorkPackageRepository {
  return {
    findById: (id) => findRecord<WorkPackage>(executor, "WORK_PACKAGE", id),
    async list(query?: WorkPackageQuery) {
      const workPackages = await listRecords<WorkPackage>(executor, "WORK_PACKAGE");
      return workPackages
        .filter(
          (workPackage) =>
            workPackage.deletedAt === undefined &&
            (query?.projectId === undefined || workPackage.projectId === query.projectId) &&
            (query?.parentId === undefined ||
              (query.parentId === null
                ? workPackage.parentId === undefined
                : workPackage.parentId === query.parentId)),
        )
        .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
    },
    save: (workPackage) =>
      saveRecord(executor, "WORK_PACKAGE", workPackage.id, workPackage, {
        userId: workPackage.userId,
        projectId: workPackage.projectId,
        sortKey: workPackage.sortKey,
      }),
  };
}

function taskEventRepository(executor: SqlExecutor): TaskEventRepository {
  return {
    async listByTaskId(taskId) {
      const events = await listRecords<TaskEvent>(executor, "TASK_EVENT");
      return events
        .filter((event) => event.taskId === taskId)
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    },
    async listAll() {
      const events = await listRecords<TaskEvent>(executor, "TASK_EVENT");
      return events.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    },
    append: (event) =>
      saveRecord(executor, "TASK_EVENT", event.id, event, {
        userId: event.userId,
        taskId: event.taskId,
        occurredAt: event.occurredAt,
      }),
  };
}

function dailyPlanRepository(executor: SqlExecutor): DailyPlanRepository {
  return {
    async findByDate(userId, localDate) {
      const row = await executor.getFirstAsync<StoredRow>(
        `SELECT data FROM nextone_records
         WHERE kind = 'DAILY_PLAN' AND user_id = ? AND local_date = ?
         LIMIT 1`,
        userId,
        localDate,
      );
      return parseRow<DailyPlan>(row);
    },
    save: (plan) =>
      saveRecord(executor, "DAILY_PLAN", plan.id, plan, {
        userId: plan.userId,
        localDate: plan.localDate,
      }),
  };
}

function dailyPlanItemRepository(executor: SqlExecutor): DailyPlanItemRepository {
  return {
    async findByTask(planId, taskId) {
      const row = await executor.getFirstAsync<StoredRow>(
        `SELECT data FROM nextone_records
         WHERE kind = 'DAILY_PLAN_ITEM' AND plan_id = ? AND task_id = ?
         LIMIT 1`,
        planId,
        taskId,
      );
      return parseRow<DailyPlanItem>(row);
    },
    async listByPlanId(planId) {
      const items = await listRecords<DailyPlanItem>(executor, "DAILY_PLAN_ITEM");
      return items
        .filter((item) => item.planId === planId)
        .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
    },
    save: (item) =>
      saveRecord(executor, "DAILY_PLAN_ITEM", item.id, item, {
        planId: item.planId,
        taskId: item.taskId,
        sortKey: item.sortKey,
      }),
    remove: (id) => removeRecord(executor, "DAILY_PLAN_ITEM", id),
  };
}

function outboxRepository(executor: SqlExecutor): OutboxRepository {
  return {
    async listPending() {
      const now = new Date().toISOString();
      const mutations = await listRecords<OutboxMutation>(executor, "OUTBOX");
      return mutations
        .filter(
          (mutation) =>
            mutation.status !== "BLOCKED" &&
            (mutation.nextAttemptAt === undefined || mutation.nextAttemptAt <= now),
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },
    async listAll() {
      const mutations = await listRecords<OutboxMutation>(executor, "OUTBOX");
      return mutations.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },
    append: (mutation) =>
      saveRecord(executor, "OUTBOX", mutation.id, mutation, {
        userId: mutation.userId,
        status: mutation.status ?? "PENDING",
        occurredAt: mutation.createdAt,
      }),
    update: (mutation) =>
      saveRecord(executor, "OUTBOX", mutation.id, mutation, {
        userId: mutation.userId,
        status: mutation.status ?? "PENDING",
        occurredAt: mutation.createdAt,
      }),
    remove: (id) => removeRecord(executor, "OUTBOX", id),
  };
}

function syncStateRepository(executor: SqlExecutor): SyncStateRepository {
  return {
    get: () => findRecord<SyncState>(executor, "SYNC_STATE", "default"),
    save: (state) => saveRecord(executor, "SYNC_STATE", state.id, state),
  };
}

function syncConflictRepository(executor: SqlExecutor): SyncConflictRepository {
  return {
    async listOpen() {
      const conflicts = await listRecords<SyncConflict>(executor, "SYNC_CONFLICT");
      return conflicts
        .filter((conflict) => conflict.resolvedAt === undefined)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
    save: (conflict) =>
      saveRecord(executor, "SYNC_CONFLICT", conflict.id, conflict, {
        occurredAt: conflict.createdAt,
      }),
  };
}

function preferencesRepository(executor: SqlExecutor): UserPreferencesRepository {
  return {
    get: () => findRecord<UserPreferences>(executor, "PREFERENCES", "default"),
    save: (preferences) => saveRecord(executor, "PREFERENCES", preferences.id, preferences),
  };
}

function restorePointRepository(executor: SqlExecutor): RestorePointRepository {
  return {
    async list() {
      const restorePoints = await listRecords<RestorePoint>(executor, "RESTORE_POINT");
      return restorePoints.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
    findById: (id) => findRecord<RestorePoint>(executor, "RESTORE_POINT", id),
    save: (restorePoint) =>
      saveRecord(executor, "RESTORE_POINT", restorePoint.id, restorePoint, {
        occurredAt: restorePoint.createdAt,
      }),
    remove: (id) => removeRecord(executor, "RESTORE_POINT", id),
  };
}

function dataManagementRepository(executor: SqlExecutor): DataManagementRepository {
  const exportSnapshot = async (exportedAt: string): Promise<LocalDataSnapshot> => {
    const [
      tasks,
      areas,
      projects,
      workPackages,
      taskEvents,
      dailyPlans,
      dailyPlanItems,
      preferences,
    ] =
      await Promise.all([
        listRecords<Task>(executor, "TASK"),
        listRecords<Area>(executor, "AREA"),
        listRecords<Project>(executor, "PROJECT"),
        listRecords<WorkPackage>(executor, "WORK_PACKAGE"),
        listRecords<TaskEvent>(executor, "TASK_EVENT"),
        listRecords<DailyPlan>(executor, "DAILY_PLAN"),
        listRecords<DailyPlanItem>(executor, "DAILY_PLAN_ITEM"),
        findRecord<UserPreferences>(executor, "PREFERENCES", "default"),
      ]);
    return {
      schemaVersion: 2,
      exportedAt,
      tasks,
      areas,
      projects,
      workPackages,
      taskEvents,
      dailyPlans,
      dailyPlanItems,
      ...(preferences === undefined ? {} : { preferences }),
    };
  };

  return {
    exportSnapshot,
    async replaceWithSnapshot(snapshot, occurredAt) {
      await clearKinds(executor, replaceableKinds);
      const transaction = createStorageTransaction(executor);
      for (const area of snapshot.areas) await transaction.areas.save(area);
      for (const project of snapshot.projects) await transaction.projects.save(project);
      for (const workPackage of snapshot.workPackages) {
        await transaction.workPackages.save(workPackage);
      }
      for (const task of snapshot.tasks) await transaction.tasks.save(task);
      for (const event of snapshot.taskEvents) await transaction.taskEvents.append(event);
      for (const plan of snapshot.dailyPlans) await transaction.dailyPlans.save(plan);
      for (const item of snapshot.dailyPlanItems) await transaction.dailyPlanItems.save(item);
      if (snapshot.preferences !== undefined) {
        await transaction.preferences.save(snapshot.preferences);
      }

      const syncEntities = [
        ...snapshot.projects.map((entity) => ({
          entityType: "PROJECT" as const,
          entity,
          deleted: entity.deletedAt !== undefined,
        })),
        ...snapshot.tasks.map((entity) => ({
          entityType: "TASK" as const,
          entity,
          deleted: entity.deletedAt !== undefined,
        })),
        ...snapshot.workPackages.map((entity) => ({
          entityType: "WORK_PACKAGE" as const,
          entity,
          deleted: entity.deletedAt !== undefined,
        })),
        ...snapshot.dailyPlans.map((entity) => ({
          entityType: "DAILY_PLAN" as const,
          entity,
          deleted: false,
        })),
        ...snapshot.dailyPlanItems.map((entity) => ({
          entityType: "DAILY_PLAN_ITEM" as const,
          entity: { ...entity, revision: 0 },
          deleted: false,
        })),
      ];
      for (const { entityType, entity, deleted } of syncEntities) {
        await transaction.outbox.append({
          id: randomUUID(),
          userId: "userId" in entity ? String(entity.userId) : "local-user",
          entityType,
          entityId: entity.id,
          operation: deleted ? "DELETE" : "UPSERT",
          baseRevision: Math.max(0, entity.revision - 1),
          payload: entity,
          createdAt: occurredAt,
          attempts: 0,
        });
      }
    },
    clearLocalCopy: () => clearKinds(executor, allKinds),
  };
}

function createStorageTransaction(executor: SqlExecutor): StorageTransaction {
  return {
    tasks: taskRepository(executor),
    areas: areaRepository(executor),
    projects: projectRepository(executor),
    workPackages: workPackageRepository(executor),
    taskEvents: taskEventRepository(executor),
    dailyPlans: dailyPlanRepository(executor),
    dailyPlanItems: dailyPlanItemRepository(executor),
    outbox: outboxRepository(executor),
    syncState: syncStateRepository(executor),
    syncConflicts: syncConflictRepository(executor),
    preferences: preferencesRepository(executor),
    restorePoints: restorePointRepository(executor),
    dataManagement: dataManagementRepository(executor),
  };
}

export class ExpoSqliteLocalDatabase implements LocalDatabase {
  private databasePromise: Promise<SQLiteDatabase> | undefined;

  private getDatabase(): Promise<SQLiteDatabase> {
    this.databasePromise ??= this.open();
    return this.databasePromise;
  }

  private async open(): Promise<SQLiteDatabase> {
    const database = await openDatabaseAsync("nextone.db");
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS nextone_records (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        user_id TEXT,
        status TEXT,
        project_id TEXT,
        plan_id TEXT,
        task_id TEXT,
        local_date TEXT,
        sort_key TEXT,
        occurred_at TEXT,
        PRIMARY KEY (kind, id)
      );
      CREATE INDEX IF NOT EXISTS idx_nextone_records_status
        ON nextone_records(kind, status);
      CREATE INDEX IF NOT EXISTS idx_nextone_records_project
        ON nextone_records(kind, project_id);
      CREATE INDEX IF NOT EXISTS idx_nextone_records_plan_task
        ON nextone_records(kind, plan_id, task_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nextone_daily_plan_date
        ON nextone_records(user_id, local_date)
        WHERE kind = 'DAILY_PLAN';
    `);
    const legacyTasks = await listRecords<
      Task & { kind?: "ACTION" | "WORK_PACKAGE"; parentTaskId?: string }
    >(database, "TASK");
    for (const legacy of legacyTasks) {
      if (legacy.kind === "WORK_PACKAGE" && legacy.projectId !== undefined) {
        await saveRecord(database, "WORK_PACKAGE", legacy.id, {
          id: legacy.id,
          userId: legacy.userId,
          projectId: legacy.projectId,
          title: legacy.title,
          sortKey: legacy.sortKey,
          createdAt: legacy.createdAt,
          updatedAt: legacy.updatedAt,
          revision: legacy.revision,
          ...(legacy.parentTaskId === undefined ? {} : { parentId: legacy.parentTaskId }),
          ...(legacy.note === undefined ? {} : { note: legacy.note }),
        } satisfies WorkPackage);
        await removeRecord(database, "TASK", legacy.id);
      } else if (legacy.kind !== undefined || legacy.parentTaskId !== undefined) {
        const { kind: _kind, parentTaskId, ...task } = legacy;
        await taskRepository(database).save({
          ...task,
          ...(parentTaskId === undefined ? {} : { workPackageId: parentTaskId }),
        });
      }
    }
    const legacyProjects = await listRecords<Project & { focusTaskId?: string }>(
      database,
      "PROJECT",
    );
    for (const legacy of legacyProjects) {
      if (legacy.focusTaskId !== undefined) {
        const { focusTaskId: _focusTaskId, ...project } = legacy;
        await projectRepository(database).save(project);
      }
    }
    return database;
  }

  async transaction<T>(work: (transaction: StorageTransaction) => Promise<T>): Promise<T> {
    const database = await this.getDatabase();
    let result!: T;
    await database.withExclusiveTransactionAsync(async (executor) => {
      result = await work(createStorageTransaction(executor));
    });
    return result;
  }
}

export const mobileDatabase = new ExpoSqliteLocalDatabase();
