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
  payload: unknown;
  createdAt: string;
  attempts: number;
}

export interface OutboxRepository {
  listPending(): Promise<readonly OutboxMutation[]>;
  append(mutation: OutboxMutation): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface StorageTransaction {
  tasks: TaskRepository;
  areas: AreaRepository;
  projects: ProjectRepository;
  taskEvents: TaskEventRepository;
  dailyPlans: DailyPlanRepository;
  dailyPlanItems: DailyPlanItemRepository;
  outbox: OutboxRepository;
}

export interface LocalDatabase {
  transaction<T>(work: (transaction: StorageTransaction) => Promise<T>): Promise<T>;
}
