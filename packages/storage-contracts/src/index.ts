import type { Area, Project, ProjectStatus, Task, TaskEvent, TaskStatus } from "@nextone/domain";

export interface TaskQuery {
  status?: TaskStatus;
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

export type OutboxEntityType = "TASK" | "AREA" | "PROJECT";
export type OutboxOperation = "UPSERT";

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
  outbox: OutboxRepository;
}

export interface LocalDatabase {
  transaction<T>(work: (transaction: StorageTransaction) => Promise<T>): Promise<T>;
}
