import { describe, expect, it } from "vitest";

import { toLocalSnapshot, type ServerBootstrapSnapshot } from "./serverSnapshot";

describe("server snapshot", () => {
  it("converts bootstrap data into the local cache shape and removes nullable fields", () => {
    const task: ServerBootstrapSnapshot["tasks"][number] = {
      id: "task-1",
      userId: "local-user",
      areaId: null,
      projectId: "project-1",
      title: "Publish",
      note: null,
      status: "READY",
      visibility: "ACTIVE",
      deadlineAt: null,
      reviewAt: null,
      reviewedAt: null,
      waitingFor: null,
      waitingSince: null,
      estimateMinutes: 30,
      energyLevel: null,
      sortKey: "1",
      completedAt: null,
      canceledAt: null,
      createdAt: "2026-07-28T01:00:00Z",
      updatedAt: "2026-07-28T01:00:00Z",
      deletedAt: null,
      revision: 1,
    };
    const bootstrap: ServerBootstrapSnapshot = {
      schemaVersion: 4,
      user: { id: "local-user" },
      tasks: [task],
      projects: [
        {
          id: "project-1",
          userId: "local-user",
          areaId: null,
          name: "Release",
          note: null,
          status: "ACTIVE",
          focusTaskId: "task-1",
          sortKey: "1",
          createdAt: "2026-07-28T01:00:00Z",
          updatedAt: "2026-07-28T01:00:00Z",
          deletedAt: null,
          revision: 1,
        },
      ],
      dailyPlans: [
        {
          id: "plan-1",
          userId: "local-user",
          localDate: "2026-07-28",
          timeZone: "Asia/Shanghai",
          createdAt: "2026-07-28T01:00:00Z",
          updatedAt: "2026-07-28T01:00:00Z",
          revision: 1,
          focus: [
            {
              itemId: "item-1",
              section: "FOCUS",
              sortKey: "1",
              selectedAt: "2026-07-28T01:00:00Z",
              task,
            },
          ],
          later: [],
        },
      ],
      recentEvents: [
        {
          id: "event-1",
          taskId: "task-1",
          type: "CREATED",
          metadata: null,
          occurredAt: "2026-07-28T01:00:00Z",
        },
      ],
    };

    const snapshot = toLocalSnapshot(bootstrap, "2026-07-28T02:00:00Z");

    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.tasks[0]).not.toHaveProperty("note");
    expect(snapshot.dailyPlans).toHaveLength(1);
    expect(snapshot.dailyPlanItems).toEqual([
      {
        id: "item-1",
        planId: "plan-1",
        taskId: "task-1",
        section: "FOCUS",
        sortKey: "1",
        createdAt: "2026-07-28T01:00:00Z",
      },
    ]);
    expect(snapshot.taskEvents[0]?.metadata).toEqual({});
  });
});
