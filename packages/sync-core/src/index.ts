import type {
  Area,
  DailyPlan,
  DailyPlanItem,
  Project,
  Task,
  WorkPackage,
} from "@nextone/domain";
import type {
  LocalDatabase,
  OutboxEntityType,
  OutboxMutation,
  StorageTransaction,
  SyncConflict,
  SyncState,
} from "@nextone/storage-contracts";

export type MutationResultStatus = "APPLIED" | "ALREADY_APPLIED" | "CONFLICT" | "REJECTED";

export interface PushMutation {
  clientMutationId: string;
  entityType: OutboxEntityType;
  entityId: string;
  operation: "UPSERT" | "DELETE";
  baseRevision: number;
  occurredAt: string;
  payload: unknown;
}

export interface MutationResult {
  clientMutationId: string;
  status: MutationResultStatus;
  revision?: number;
  serverSequence?: number;
  errorCode?: string;
  serverPayload?: unknown;
}

export interface PullChange {
  serverSequence: number;
  entityType: OutboxEntityType;
  entityId: string;
  operation: "UPSERT" | "DELETE";
  revision: number;
  payload: unknown;
  createdAt: string;
}

export interface SyncTransport {
  push(request: {
    deviceId: string;
    mutations: readonly PushMutation[];
  }): Promise<{ results: readonly MutationResult[] }>;
  pull(
    cursor: number,
    limit: number,
  ): Promise<{
    nextCursor: number;
    hasMore: boolean;
    changes: readonly PullChange[];
  }>;
}

export interface SyncSummary {
  state: SyncState;
  pendingCount: number;
  blockedCount: number;
  conflictCount: number;
}

export type ConflictResolution = "KEEP_LOCAL" | "USE_SERVER";

const defaultState: SyncState = {
  id: "default",
  cursor: 0,
  status: "OFFLINE",
  retryCount: 0,
};

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function backoffSeconds(attempt: number): number {
  return Math.min(5 * 2 ** Math.max(0, attempt - 1), 300);
}

function mutationToRequest(mutation: OutboxMutation): PushMutation {
  const payloadRevision =
    mutation.payload !== null &&
    typeof mutation.payload === "object" &&
    "revision" in mutation.payload &&
    typeof mutation.payload.revision === "number"
      ? mutation.payload.revision
      : 1;
  return {
    clientMutationId: mutation.id,
    entityType: mutation.entityType,
    entityId: mutation.entityId,
    operation: mutation.operation,
    // IndexedDB may still contain M4/M5 Outbox rows created before baseRevision existed.
    baseRevision: mutation.baseRevision ?? Math.max(0, payloadRevision - 1),
    occurredAt: mutation.createdAt,
    payload: mutation.payload,
  };
}

async function applyPayload(
  transaction: StorageTransaction,
  entityType: OutboxEntityType,
  operation: "UPSERT" | "DELETE",
  payload: unknown,
): Promise<void> {
  if (payload === null || typeof payload !== "object") {
    return;
  }
  const payloadRecord = payload as Record<string, unknown>;
  const localPayload =
    entityType === "TASK"
      ? {
          ...payloadRecord,
          ...(["deadlineAt", "reviewAt"] as const).reduce<Record<string, string>>(
            (dates, field) => {
              const value = payloadRecord[field];
              if (typeof value === "string" && value.length > 10) {
                dates[field] = value.slice(0, 10);
              }
              return dates;
            },
            {},
          ),
        }
      : payload;

  switch (entityType) {
    case "TASK":
      await transaction.tasks.save(localPayload as Task);
      break;
    case "AREA":
      await transaction.areas.save(localPayload as Area);
      break;
    case "PROJECT":
      await transaction.projects.save(localPayload as Project);
      break;
    case "WORK_PACKAGE":
      await transaction.workPackages.save(localPayload as WorkPackage);
      break;
    case "DAILY_PLAN":
      await transaction.dailyPlans.save(localPayload as DailyPlan);
      break;
    case "DAILY_PLAN_ITEM":
      if (operation === "DELETE") {
        await transaction.dailyPlanItems.remove((localPayload as DailyPlanItem).id);
      } else {
        await transaction.dailyPlanItems.save(localPayload as DailyPlanItem);
      }
      break;
  }
}

export class SyncEngine {
  private running: Promise<SyncSummary> | undefined;

  constructor(
    private readonly database: LocalDatabase,
    private readonly transport: SyncTransport,
    private readonly deviceId: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  summary(): Promise<SyncSummary> {
    return this.database.transaction(async (transaction) => {
      const [state, mutations, conflicts] = await Promise.all([
        transaction.syncState.get(),
        transaction.outbox.listAll(),
        transaction.syncConflicts.listOpen(),
      ]);
      return {
        state: state ?? defaultState,
        pendingCount: mutations.filter((mutation) => mutation.status !== "BLOCKED").length,
        blockedCount: mutations.filter((mutation) => mutation.status === "BLOCKED").length,
        conflictCount: new Set(
          conflicts.map((conflict) => `${conflict.entityType}:${conflict.entityId}`),
        ).size,
      };
    });
  }

  syncNow(): Promise<SyncSummary> {
    this.running ??= this.run().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async run(): Promise<SyncSummary> {
    const startedAt = this.now().toISOString();
    const state = await this.database.transaction(async (transaction) => {
      const current = (await transaction.syncState.get()) ?? defaultState;
      const { lastError: _lastError, nextRetryAt: _nextRetryAt, ...stateWithoutError } = current;
      await transaction.syncState.save({
        ...stateWithoutError,
        status: "SYNCING",
      });
      return current;
    });

    try {
      await this.pushPending();
      const cursor = await this.pullChanges(state.cursor);
      await this.database.transaction(async (transaction) => {
        const mutations = await transaction.outbox.listAll();
        const blocked = mutations.filter((mutation) => mutation.status === "BLOCKED");
        const remaining = mutations.filter((mutation) => mutation.status !== "BLOCKED");
        if (remaining.length === 0) {
          if (blocked.length > 0) {
            await transaction.syncState.save({
              id: "default",
              cursor,
              status: "ERROR",
              retryCount: state.retryCount,
              lastError: blocked[0]?.lastError ?? "SYNC_CONFLICT",
              ...(state.lastSyncAt === undefined ? {} : { lastSyncAt: state.lastSyncAt }),
            });
            return;
          }
          await transaction.syncState.save({
            id: "default",
            cursor,
            status: "UP_TO_DATE",
            lastSyncAt: this.now().toISOString(),
            retryCount: 0,
          });
          return;
        }
        const retryTimes = remaining
          .map((mutation) => mutation.nextAttemptAt)
          .filter((value): value is string => value !== undefined)
          .sort();
        await transaction.syncState.save({
          id: "default",
          cursor,
          status: "ERROR",
          retryCount: state.retryCount,
          lastError: remaining[0]?.lastError ?? "SYNC_RETRY_PENDING",
          ...(state.lastSyncAt === undefined ? {} : { lastSyncAt: state.lastSyncAt }),
          ...(retryTimes[0] === undefined ? {} : { nextRetryAt: retryTimes[0] }),
        });
      });
    } catch (error) {
      const message = asErrorMessage(error);
      const attempt = state.retryCount + 1;
      const nextRetryAt = new Date(
        this.now().getTime() + backoffSeconds(attempt) * 1_000,
      ).toISOString();
      await this.database.transaction(async (transaction) => {
        const pending = (await transaction.outbox.listAll()).filter(
          (mutation) => mutation.status !== "BLOCKED",
        );
        for (const mutation of pending) {
          await transaction.outbox.update({
            ...mutation,
            attempts: mutation.attempts + 1,
            lastAttemptAt: startedAt,
            nextAttemptAt: nextRetryAt,
            lastError: message,
          });
        }
        await transaction.syncState.save({
          ...state,
          status: "ERROR",
          retryCount: attempt,
          lastError: message,
          nextRetryAt,
        });
      });
    }
    return this.summary();
  }

  private async pushPending(): Promise<void> {
    const pending = await this.database.transaction((transaction) =>
      transaction.outbox.listPending(),
    );
    const batch = pending.slice(0, 100);
    if (batch.length === 0) {
      return;
    }

    const response = await this.transport.push({
      deviceId: this.deviceId,
      mutations: batch.map(mutationToRequest),
    });
    const resultById = new Map(response.results.map((result) => [result.clientMutationId, result]));

    await this.database.transaction(async (transaction) => {
      for (const mutation of batch) {
        const result = resultById.get(mutation.id);
        if (result === undefined) {
          throw new Error(`Sync response is missing mutation ${mutation.id}`);
        }
        if (result.status === "APPLIED" || result.status === "ALREADY_APPLIED") {
          if (result.serverPayload !== undefined) {
            await applyPayload(
              transaction,
              mutation.entityType,
              mutation.operation,
              result.serverPayload,
            );
          }
          await transaction.outbox.remove(mutation.id);
          continue;
        }

        const code = result.errorCode ?? result.status;
        await transaction.outbox.update({
          ...mutation,
          status: "BLOCKED",
          attempts: mutation.attempts + 1,
          lastAttemptAt: this.now().toISOString(),
          lastError: code,
        });
        await transaction.syncConflicts.save({
          id: mutation.id,
          entityType: mutation.entityType,
          entityId: mutation.entityId,
          code,
          localPayload: mutation.payload,
          serverPayload: result.serverPayload,
          createdAt: this.now().toISOString(),
        });
      }
    });

    if (pending.length > batch.length) {
      await this.pushPending();
    }
  }

  private async pullChanges(initialCursor: number): Promise<number> {
    let cursor = initialCursor;
    let hasMore = true;
    while (hasMore) {
      const response = await this.transport.pull(cursor, 200);
      await this.database.transaction(async (transaction) => {
        const localMutations = await transaction.outbox.listAll();
        for (const change of response.changes) {
          const local = localMutations.find(
            (mutation) =>
              mutation.entityType === change.entityType && mutation.entityId === change.entityId,
          );
          if (local !== undefined) {
            const conflict: SyncConflict = {
              id: `pull-${change.serverSequence}`,
              entityType: change.entityType,
              entityId: change.entityId,
              code: "LOCAL_CHANGES_PENDING",
              localPayload: local.payload,
              serverPayload: change.payload,
              createdAt: this.now().toISOString(),
            };
            await transaction.syncConflicts.save(conflict);
            continue;
          }
          await applyPayload(transaction, change.entityType, change.operation, change.payload);
        }
      });
      cursor = response.nextCursor;
      hasMore = response.hasMore;
    }
    return cursor;
  }

  async resolveConflict(conflictId: string, resolution: ConflictResolution): Promise<SyncSummary> {
    await this.database.transaction(async (transaction) => {
      const conflicts = await transaction.syncConflicts.listOpen();
      const selected = conflicts.find((conflict) => conflict.id === conflictId);
      if (selected === undefined) {
        return;
      }
      const entityConflicts = conflicts.filter(
        (conflict) =>
          conflict.entityType === selected.entityType && conflict.entityId === selected.entityId,
      );
      const mutations = (await transaction.outbox.listAll()).filter(
        (mutation) =>
          mutation.entityType === selected.entityType && mutation.entityId === selected.entityId,
      );

      if (resolution === "USE_SERVER") {
        if (selected.serverPayload !== undefined) {
          await applyPayload(transaction, selected.entityType, "UPSERT", selected.serverPayload);
        }
        for (const mutation of mutations) {
          await transaction.outbox.remove(mutation.id);
        }
      } else {
        const serverRevision =
          selected.serverPayload !== null &&
          typeof selected.serverPayload === "object" &&
          "revision" in selected.serverPayload &&
          typeof selected.serverPayload.revision === "number"
            ? selected.serverPayload.revision
            : 0;
        let nextBaseRevision = serverRevision;
        for (const mutation of mutations) {
          const {
            status: _status,
            lastAttemptAt: _lastAttemptAt,
            nextAttemptAt: _nextAttemptAt,
            lastError: _lastError,
            ...retryable
          } = mutation;
          await transaction.outbox.update({
            ...retryable,
            baseRevision: nextBaseRevision,
            attempts: 0,
          });
          nextBaseRevision += 1;
        }
      }

      const resolvedAt = this.now().toISOString();
      for (const conflict of entityConflicts) {
        await transaction.syncConflicts.save({ ...conflict, resolvedAt });
      }
    });
    return this.summary();
  }
}
