import type { Task } from "@nextone/domain";
import type {
  LocalDatabase,
  OutboxMutation,
  StorageTransaction,
  SyncConflict,
  SyncState,
} from "@nextone/storage-contracts";
import { describe, expect, it, vi } from "vitest";

import { SyncEngine, type SyncTransport } from "../src";

function task(revision = 1): Task {
  return {
    id: "task-1",
    userId: "local-user",
    title: "Write acceptance notes",
    status: "INBOX",
    visibility: "ACTIVE",
    sortKey: "2026-07-25T10:00:00Z",
    createdAt: "2026-07-25T10:00:00Z",
    updatedAt: "2026-07-25T10:00:00Z",
    revision,
  };
}

function mutation(): OutboxMutation {
  return {
    id: "mutation-1",
    userId: "local-user",
    entityType: "TASK",
    entityId: "task-1",
    operation: "UPSERT",
    baseRevision: 0,
    payload: task(),
    createdAt: "2026-07-25T10:00:00Z",
    attempts: 0,
  };
}

function memoryDatabase(initialMutation?: OutboxMutation) {
  const tasks = new Map<string, Task>();
  const outbox = new Map<string, OutboxMutation>();
  const conflicts = new Map<string, SyncConflict>();
  let state: SyncState | undefined;
  if (initialMutation !== undefined) {
    outbox.set(initialMutation.id, initialMutation);
  }

  const transaction: StorageTransaction = {
    tasks: {
      findById: async (id) => tasks.get(id),
      list: async () => [...tasks.values()].filter((value) => value.deletedAt === undefined),
      save: async (value) => void tasks.set(value.id, value),
    },
    areas: {
      findById: async () => undefined,
      list: async () => [],
      save: async () => undefined,
    },
    projects: {
      findById: async () => undefined,
      list: async () => [],
      save: async () => undefined,
    },
    workPackages: {
      findById: async () => undefined,
      list: async () => [],
      save: async () => undefined,
    },
    taskEvents: {
      listByTaskId: async () => [],
      listAll: async () => [],
      append: async () => undefined,
    },
    dailyPlans: {
      findByDate: async () => undefined,
      save: async () => undefined,
    },
    dailyPlanItems: {
      findByTask: async () => undefined,
      listByPlanId: async () => [],
      save: async () => undefined,
      remove: async () => undefined,
    },
    outbox: {
      listPending: async () => [...outbox.values()].filter((value) => value.status !== "BLOCKED"),
      listAll: async () => [...outbox.values()],
      append: async (value) => void outbox.set(value.id, value),
      update: async (value) => void outbox.set(value.id, value),
      remove: async (id) => void outbox.delete(id),
    },
    syncState: {
      get: async () => state,
      save: async (value) => {
        state = value;
      },
    },
    syncConflicts: {
      listOpen: async () =>
        [...conflicts.values()].filter((value) => value.resolvedAt === undefined),
      save: async (value) => void conflicts.set(value.id, value),
    },
    preferences: {} as StorageTransaction["preferences"],
    restorePoints: {} as StorageTransaction["restorePoints"],
    dataManagement: {} as StorageTransaction["dataManagement"],
  };
  const database: LocalDatabase = {
    transaction: async (work) => work(transaction),
  };
  return { database, tasks, outbox, conflicts, getState: () => state };
}

describe("SyncEngine", () => {
  it("removes an applied mutation and stores the authoritative payload", async () => {
    const memory = memoryDatabase(mutation());
    const serverTask = {
      ...task(),
      deadlineAt: "2026-07-31T23:59:59Z",
      reviewAt: "2026-07-28T00:00:00Z",
      revision: 1,
    };
    const transport: SyncTransport = {
      push: vi.fn().mockResolvedValue({
        results: [
          {
            clientMutationId: "mutation-1",
            status: "APPLIED",
            revision: 1,
            serverSequence: 1,
            serverPayload: serverTask,
          },
        ],
      }),
      pull: vi.fn().mockResolvedValue({ nextCursor: 1, hasMore: false, changes: [] }),
    };

    const summary = await new SyncEngine(
      memory.database,
      transport,
      "device-1",
      () => new Date("2026-07-25T10:01:00Z"),
    ).syncNow();

    expect(memory.outbox.size).toBe(0);
    expect(memory.tasks.get("task-1")).toEqual({
      ...serverTask,
      deadlineAt: "2026-07-31",
      reviewAt: "2026-07-28",
    });
    expect(summary.state.status).toBe("UP_TO_DATE");
    expect(summary.state.cursor).toBe(1);
  });

  it("keeps an outbox mutation and schedules backoff when the network fails", async () => {
    const memory = memoryDatabase(mutation());
    const transport: SyncTransport = {
      push: vi.fn().mockRejectedValue(new Error("network unavailable")),
      pull: vi.fn(),
    };

    const summary = await new SyncEngine(
      memory.database,
      transport,
      "device-1",
      () => new Date("2026-07-25T10:01:00Z"),
    ).syncNow();

    expect(memory.outbox.get("mutation-1")).toMatchObject({
      attempts: 1,
      lastError: "network unavailable",
      nextAttemptAt: "2026-07-25T10:01:05.000Z",
    });
    expect(summary.state.status).toBe("ERROR");
    expect(summary.pendingCount).toBe(1);
  });

  it("blocks a conflicting mutation without overwriting the local task", async () => {
    const localMutation = mutation();
    const memory = memoryDatabase(localMutation);
    memory.tasks.set("task-1", task());
    const transport: SyncTransport = {
      push: vi.fn().mockResolvedValue({
        results: [
          {
            clientMutationId: "mutation-1",
            status: "CONFLICT",
            errorCode: "REVISION_CONFLICT",
            serverPayload: { ...task(2), title: "Server title" },
          },
        ],
      }),
      pull: vi.fn().mockResolvedValue({ nextCursor: 0, hasMore: false, changes: [] }),
    };

    const summary = await new SyncEngine(memory.database, transport, "device-1").syncNow();

    expect(memory.outbox.get("mutation-1")?.status).toBe("BLOCKED");
    expect(memory.tasks.get("task-1")?.title).toBe("Write acceptance notes");
    expect(memory.conflicts.get("mutation-1")?.code).toBe("REVISION_CONFLICT");
    expect(summary.state.status).toBe("ERROR");
    expect(summary.blockedCount).toBe(1);
    expect(summary.conflictCount).toBe(1);
  });

  it("derives baseRevision for legacy Outbox rows", async () => {
    const legacy: Partial<OutboxMutation> = mutation();
    delete legacy.baseRevision;
    legacy.payload = task(4);
    const memory = memoryDatabase(legacy as OutboxMutation);
    const push = vi.fn().mockResolvedValue({
      results: [
        {
          clientMutationId: "mutation-1",
          status: "ALREADY_APPLIED",
          serverPayload: task(4),
        },
      ],
    });
    const transport: SyncTransport = {
      push,
      pull: vi.fn().mockResolvedValue({ nextCursor: 0, hasMore: false, changes: [] }),
    };

    await new SyncEngine(memory.database, transport, "device-1").syncNow();

    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        mutations: [expect.objectContaining({ baseRevision: 3 })],
      }),
    );
  });

  it("can explicitly accept the server version for a conflict", async () => {
    const blocked = { ...mutation(), status: "BLOCKED" as const };
    const memory = memoryDatabase(blocked);
    memory.tasks.set("task-1", task());
    memory.conflicts.set("mutation-1", {
      id: "mutation-1",
      entityType: "TASK",
      entityId: "task-1",
      code: "REVISION_CONFLICT",
      localPayload: task(),
      serverPayload: { ...task(2), title: "Server title" },
      createdAt: "2026-07-25T10:01:00Z",
    });
    const transport: SyncTransport = {
      push: vi.fn(),
      pull: vi.fn(),
    };
    const engine = new SyncEngine(memory.database, transport, "device-1");

    const summary = await engine.resolveConflict("mutation-1", "USE_SERVER");

    expect(memory.outbox.size).toBe(0);
    expect(memory.tasks.get("task-1")?.title).toBe("Server title");
    expect(summary.conflictCount).toBe(0);
  });
});
