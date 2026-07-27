import type { Task } from "@nextone/domain";
import { describe, expect, it } from "vitest";

import { calculateDailyCapacity } from "./capacity";

function task(id: string, estimateMinutes?: number): Task {
  return {
    id,
    userId: "local-user",
    title: id,
    status: "READY",
    visibility: "ACTIVE",
    sortKey: "2026-07-27T08:00:00Z",
    createdAt: "2026-07-27T08:00:00Z",
    updatedAt: "2026-07-27T08:00:00Z",
    revision: 1,
    ...(estimateMinutes === undefined ? {} : { estimateMinutes }),
  };
}

describe("daily capacity", () => {
  it("deduplicates tasks that appear in both the plan and doing list", () => {
    const repeated = task("task-1", 60);
    expect(calculateDailyCapacity([repeated, repeated], 240).estimatedMinutes).toBe(60);
  });

  it("reports unknown estimates without inflating the total", () => {
    expect(calculateDailyCapacity([task("known", 90), task("unknown")], 240)).toMatchObject({
      estimatedMinutes: 90,
      unestimatedCount: 1,
      level: "UNCERTAIN",
    });
  });

  it("marks a plan over 125 percent as overloaded", () => {
    expect(calculateDailyCapacity([task("large", 320)], 240).level).toBe("OVERLOADED");
  });
});
