import {
  SyncEngine,
  type ConflictResolution,
  type SyncSummary,
  type SyncTransport,
} from "@nextone/sync-core";
import type { SyncConflict } from "@nextone/storage-contracts";

import { nextOneDatabase } from "../storage/indexedDb";
import {
  getDeviceId,
  getSyncConfiguration,
  saveSyncConfiguration,
  type SyncConfiguration,
} from "./config";
import { announceSyncedDataChanged, localMutationsPendingEvent } from "./dataChangeEvents";
import {
  canReplaceWithServerSnapshot,
  toLocalSnapshot,
  type ServerBootstrapSnapshot,
} from "./serverSnapshot";
const syncChangedEvent = "nextone:sync-changed";
export { getSyncConfiguration, saveSyncConfiguration, type SyncConfiguration };

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const configuration = getSyncConfiguration();
  const response = await fetch(`${configuration.apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${configuration.token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { code?: string };
      detail = body.code ?? detail;
    } catch {
      // Keep the HTTP status text when the response is not JSON.
    }
    throw new Error(`${response.status} ${detail}`);
  }
  return response.json() as Promise<T>;
}

const transport: SyncTransport = {
  push: (request) =>
    apiRequest("/api/v1/sync/push", {
      method: "POST",
      body: JSON.stringify(request),
    }),
  pull: (cursor, limit) => apiRequest(`/api/v1/sync/pull?cursor=${cursor}&limit=${limit}`),
};

const engine = new SyncEngine(nextOneDatabase, transport, getDeviceId());
let runningSync: Promise<SyncSummary> | undefined;

function announceChange(): void {
  window.dispatchEvent(new Event(syncChangedEvent));
}

export function getSyncSummary(): Promise<SyncSummary> {
  return engine.summary();
}

export async function listSyncConflicts(): Promise<readonly SyncConflict[]> {
  const conflicts = await nextOneDatabase.transaction((transaction) =>
    transaction.syncConflicts.listOpen(),
  );
  return [
    ...new Map(
      conflicts.map((conflict) => [
        `${conflict.entityType}:${conflict.entityId}`,
        conflict,
      ]),
    ).values(),
  ];
}

async function runSync(): Promise<SyncSummary> {
  announceChange();
  let summary = await engine.syncNow();
  if (canReplaceWithServerSnapshot(summary)) {
    const synchronizedAt = new Date().toISOString();
    try {
      const bootstrap = await apiRequest<ServerBootstrapSnapshot>("/api/v1/bootstrap");
      await nextOneDatabase.replaceWithServerSnapshot(
        toLocalSnapshot(bootstrap, synchronizedAt),
        summary.state.cursor,
        synchronizedAt,
      );
      summary = await engine.summary();
    } catch {
      await nextOneDatabase.transaction(async (transaction) => {
        await transaction.syncState.save({
          ...summary.state,
          status: "ERROR",
          lastError: "SERVER_SNAPSHOT_FAILED",
          retryCount: summary.state.retryCount + 1,
        });
      });
      summary = await engine.summary();
    }
  }
  announceSyncedDataChanged();
  announceChange();
  return summary;
}

export function syncNow(): Promise<SyncSummary> {
  runningSync ??= runSync().finally(() => {
    runningSync = undefined;
  });
  return runningSync;
}

export function subscribeToSyncChanges(listener: () => void): () => void {
  window.addEventListener(syncChangedEvent, listener);
  return () => window.removeEventListener(syncChangedEvent, listener);
}

export async function resolveSyncConflict(
  conflictId: string,
  resolution: ConflictResolution,
): Promise<SyncSummary> {
  await engine.resolveConflict(conflictId, resolution);
  announceChange();
  return syncNow();
}

export function startAutomaticSync(): () => void {
  const attempt = () => {
    if (navigator.onLine) {
      void syncNow();
    }
  };
  let pendingTimer: number | undefined;
  const schedule = () => {
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
    }
    pendingTimer = window.setTimeout(() => {
      pendingTimer = undefined;
      attempt();
    }, 250);
  };
  const syncWhenVisible = () => {
    if (document.visibilityState === "visible") {
      attempt();
    }
  };

  const interval = window.setInterval(attempt, 30_000);
  window.addEventListener("online", attempt);
  window.addEventListener("focus", attempt);
  window.addEventListener(localMutationsPendingEvent, schedule);
  document.addEventListener("visibilitychange", syncWhenVisible);
  attempt();

  return () => {
    window.clearInterval(interval);
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
    }
    window.removeEventListener("online", attempt);
    window.removeEventListener("focus", attempt);
    window.removeEventListener(localMutationsPendingEvent, schedule);
    document.removeEventListener("visibilitychange", syncWhenVisible);
  };
}
