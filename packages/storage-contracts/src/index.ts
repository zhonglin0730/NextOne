import type { Task, TaskStatus } from "@nextone/domain";

export interface TaskQuery {
  status?: TaskStatus;
  projectId?: string;
  includeDeleted?: boolean;
}

export interface TaskRepository {
  findById(id: string): Promise<Task | undefined>;
  list(query?: TaskQuery): Promise<readonly Task[]>;
  save(task: Task): Promise<void>;
}

export interface StorageTransaction {
  tasks: TaskRepository;
}

export interface LocalStorage {
  transaction<T>(work: (transaction: StorageTransaction) => Promise<T>): Promise<T>;
}
