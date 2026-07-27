import type { Task } from "@nextone/domain";

export type CapacityLevel = "EMPTY" | "UNCERTAIN" | "SPACIOUS" | "BALANCED" | "FULL" | "OVERLOADED";

export interface DailyCapacity {
  estimatedMinutes: number;
  capacityMinutes: number;
  unestimatedCount: number;
  ratio: number;
  level: CapacityLevel;
}

export function calculateDailyCapacity(
  tasks: readonly Task[],
  capacityMinutes = 240,
): DailyCapacity {
  const uniqueTasks = [...new Map(tasks.map((task) => [task.id, task])).values()];
  const estimatedMinutes = uniqueTasks.reduce(
    (total, task) => total + (task.estimateMinutes ?? 0),
    0,
  );
  const unestimatedCount = uniqueTasks.filter((task) => task.estimateMinutes === undefined).length;
  const safeCapacity = Math.max(30, capacityMinutes);
  const ratio = estimatedMinutes / safeCapacity;
  const level: CapacityLevel =
    uniqueTasks.length === 0
      ? "EMPTY"
      : ratio > 1.25
        ? "OVERLOADED"
        : ratio > 1
          ? "FULL"
          : unestimatedCount > 0
            ? "UNCERTAIN"
            : ratio <= 0.6
              ? "SPACIOUS"
              : "BALANCED";

  return {
    estimatedMinutes,
    capacityMinutes: safeCapacity,
    unestimatedCount,
    ratio,
    level,
  };
}
