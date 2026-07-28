import type {
  DailyPlan,
  DailyPlanItem,
  Project,
  Task,
  TaskEvent,
  TaskEventMetadata,
  TaskEventType,
} from "@nextone/domain";
import type { LocalDataSnapshot } from "@nextone/storage-contracts";

interface ServerDailyPlanItem {
  itemId: string;
  section: DailyPlanItem["section"];
  sortKey: string;
  selectedAt: string;
  task: ServerTask;
}

interface ServerDailyPlan {
  id: string;
  userId: string;
  localDate: string;
  timeZone: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  focus: readonly ServerDailyPlanItem[];
  later: readonly ServerDailyPlanItem[];
}

interface ServerTaskEvent {
  id: string;
  taskId: string;
  type: TaskEventType;
  metadata: TaskEventMetadata | null;
  occurredAt: string;
}

type ServerTask = {
  [Key in keyof Task]: Task[Key] | null;
};

type ServerProject = {
  [Key in keyof Project]: Project[Key] | null;
};

export interface ServerBootstrapSnapshot {
  schemaVersion: number;
  user: {
    id: string;
  };
  tasks: readonly ServerTask[];
  projects: readonly ServerProject[];
  dailyPlans: readonly ServerDailyPlan[];
  recentEvents: readonly ServerTaskEvent[];
}

function withoutNulls<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== null)) as T;
}

function requireString(value: string | null, field: string): string {
  if (value === null) {
    throw new Error(`Server snapshot is missing ${field}`);
  }
  return value;
}

export function toLocalSnapshot(
  bootstrap: ServerBootstrapSnapshot,
  exportedAt: string,
): LocalDataSnapshot {
  const dailyPlans: DailyPlan[] = bootstrap.dailyPlans.map(
    ({ focus: _focus, later: _later, ...plan }) => plan,
  );
  const dailyPlanItems: DailyPlanItem[] = bootstrap.dailyPlans.flatMap((plan) =>
    [...plan.focus, ...plan.later].map((item) => ({
      id: item.itemId,
      planId: plan.id,
      taskId: requireString(item.task.id, "daily plan task id"),
      section: item.section,
      sortKey: item.sortKey,
      createdAt: item.selectedAt,
    })),
  );
  const taskEvents: TaskEvent[] = bootstrap.recentEvents.map((event) => ({
    id: event.id,
    userId: bootstrap.user.id,
    taskId: event.taskId,
    type: event.type,
    occurredAt: event.occurredAt,
    metadata: event.metadata ?? {},
  }));

  return {
    schemaVersion: 1,
    exportedAt,
    tasks: bootstrap.tasks.map((task) => withoutNulls(task) as Task),
    areas: [],
    projects: bootstrap.projects.map((project) => withoutNulls(project) as Project),
    taskEvents,
    dailyPlans,
    dailyPlanItems,
  };
}
