import type {
  Area,
  DailyPlan,
  DailyPlanItem,
  Project,
  ProjectStatus,
  Task,
  TaskEvent,
  TaskStatus,
} from "@nextone/domain";

export interface TaskQuery {
  status?: TaskStatus;
  statuses?: readonly TaskStatus[];
  projectId?: string;
  includeCanceled?: boolean;
}

export interface TaskRepository {
  findById(id: string): Promise<Task | undefined>;
  list(query?: TaskQuery): Promise<readonly Task[]>;
  save(task: Task): Promise<void>;
}

export interface AreaRepository {
  findById(id: string): Promise<Area | undefined>;
  list(): Promise<readonly Area[]>;
  save(area: Area): Promise<void>;
}

export interface ProjectQuery {
  areaId?: string;
  status?: ProjectStatus;
}

export interface ProjectRepository {
  findById(id: string): Promise<Project | undefined>;
  list(query?: ProjectQuery): Promise<readonly Project[]>;
  save(project: Project): Promise<void>;
}

export interface TaskEventRepository {
  listByTaskId(taskId: string): Promise<readonly TaskEvent[]>;
  listAll(): Promise<readonly TaskEvent[]>;
  append(event: TaskEvent): Promise<void>;
}

export interface DailyPlanRepository {
  findByDate(userId: string, localDate: string): Promise<DailyPlan | undefined>;
  save(plan: DailyPlan): Promise<void>;
}

export interface DailyPlanItemRepository {
  findByTask(planId: string, taskId: string): Promise<DailyPlanItem | undefined>;
  listByPlanId(planId: string): Promise<readonly DailyPlanItem[]>;
  save(item: DailyPlanItem): Promise<void>;
  remove(id: string): Promise<void>;
}

export type OutboxEntityType = "TASK" | "AREA" | "PROJECT" | "DAILY_PLAN" | "DAILY_PLAN_ITEM";
export type OutboxOperation = "UPSERT" | "DELETE";

export interface OutboxMutation {
  id: string;
  userId: string;
  entityType: OutboxEntityType;
  entityId: string;
  operation: OutboxOperation;
  baseRevision: number;
  payload: unknown;
  createdAt: string;
  attempts: number;
  status?: "PENDING" | "BLOCKED";
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  lastError?: string;
}

export interface OutboxRepository {
  listPending(): Promise<readonly OutboxMutation[]>;
  listAll(): Promise<readonly OutboxMutation[]>;
  append(mutation: OutboxMutation): Promise<void>;
  update(mutation: OutboxMutation): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface SyncState {
  id: "default";
  cursor: number;
  status: "OFFLINE" | "SYNCING" | "UP_TO_DATE" | "ERROR";
  lastSyncAt?: string;
  lastError?: string;
  retryCount: number;
  nextRetryAt?: string;
}

export interface SyncConflict {
  id: string;
  entityType: OutboxEntityType;
  entityId: string;
  code: string;
  localPayload: unknown;
  serverPayload?: unknown;
  createdAt: string;
  resolvedAt?: string;
}

export interface SyncStateRepository {
  get(): Promise<SyncState | undefined>;
  save(state: SyncState): Promise<void>;
}

export interface SyncConflictRepository {
  listOpen(): Promise<readonly SyncConflict[]>;
  save(conflict: SyncConflict): Promise<void>;
}

export interface StorageTransaction {
  tasks: TaskRepository;
  areas: AreaRepository;
  projects: ProjectRepository;
  taskEvents: TaskEventRepository;
  dailyPlans: DailyPlanRepository;
  dailyPlanItems: DailyPlanItemRepository;
  outbox: OutboxRepository;
  syncState: SyncStateRepository;
  syncConflicts: SyncConflictRepository;
}

export interface LocalDatabase {
  transaction<T>(work: (transaction: StorageTransaction) => Promise<T>): Promise<T>;
}
