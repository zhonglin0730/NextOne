import {
  SyncEngine,
  type ConflictResolution,
  type SyncSummary,
  type SyncTransport,
} from "@nextone/sync-core";

import { nextOneDatabase } from "../storage/indexedDb";

const apiUrlKey = "nextone.sync.apiUrl";
const tokenKey = "nextone.sync.token";
const deviceIdKey = "nextone.sync.deviceId";
const syncChangedEvent = "nextone:sync-changed";

export interface SyncConfiguration {
  apiUrl: string;
  token: string;
}

export function getSyncConfiguration(): SyncConfiguration {
  return {
    apiUrl: localStorage.getItem(apiUrlKey) ?? "http://127.0.0.1:8080",
    token: localStorage.getItem(tokenKey) ?? "nextone-local-dev-token",
  };
}

export function saveSyncConfiguration(configuration: SyncConfiguration): void {
  localStorage.setItem(apiUrlKey, configuration.apiUrl.replace(/\/+$/, ""));
  localStorage.setItem(tokenKey, configuration.token);
}

function getDeviceId(): string {
  const existing = localStorage.getItem(deviceIdKey);
  if (existing !== null) {
    return existing;
  }
  const deviceId = crypto.randomUUID();
  localStorage.setItem(deviceIdKey, deviceId);
  return deviceId;
}

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

function announceChange(): void {
  window.dispatchEvent(new Event(syncChangedEvent));
}

export function getSyncSummary(): Promise<SyncSummary> {
  return engine.summary();
}

export async function syncNow(): Promise<SyncSummary> {
  announceChange();
  const summary = await engine.syncNow();
  announceChange();
  return summary;
}

export function subscribeToSyncChanges(listener: () => void): () => void {
  window.addEventListener(syncChangedEvent, listener);
  return () => window.removeEventListener(syncChangedEvent, listener);
}

export async function resolveSyncConflict(
  conflictId: string,
  resolution: ConflictResolution,
): Promise<SyncSummary> {
  const summary = await engine.resolveConflict(conflictId, resolution);
  announceChange();
  if (resolution === "KEEP_LOCAL") {
    return syncNow();
  }
  return summary;
}

export function startAutomaticSync(): () => void {
  const attempt = () => {
    if (navigator.onLine) {
      void syncNow();
    }
  };
  const interval = window.setInterval(attempt, 30_000);
  window.addEventListener("online", attempt);
  window.setTimeout(attempt, 500);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener("online", attempt);
  };
}
