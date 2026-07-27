import { SyncEngine, type SyncSummary, type SyncTransport } from "@nextone/sync-core";
import type { LocalDatabase } from "@nextone/storage-contracts";

import {
  loadSyncCredentials,
  saveSyncCredentials,
  type MobileSyncCredentials,
} from "./credentials";

async function parseApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { code?: string };
      detail = body.code ?? detail;
    } catch {
      // Keep the status text when the server did not return JSON.
    }
    throw new Error(`${response.status} ${detail}`);
  }
  return response.json() as Promise<T>;
}

function createTransport(
  credentials: MobileSyncCredentials,
  fetcher: typeof fetch = fetch,
): SyncTransport {
  const request = <T>(path: string, init?: RequestInit): Promise<T> =>
    fetcher(`${credentials.apiUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    }).then(parseApiResponse<T>);

  return {
    push: (payload) =>
      request("/api/v1/sync/push", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    pull: (cursor, limit) => request(`/api/v1/sync/pull?cursor=${cursor}&limit=${limit}`),
  };
}

export class MobileSyncService {
  private runtime: Promise<{ credentials: MobileSyncCredentials; engine: SyncEngine }> | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly database: LocalDatabase) {}

  private getRuntime(): Promise<{ credentials: MobileSyncCredentials; engine: SyncEngine }> {
    this.runtime ??= loadSyncCredentials().then((credentials) => ({
      credentials,
      engine: new SyncEngine(this.database, createTransport(credentials), credentials.deviceId),
    }));
    return this.runtime;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private announce(): void {
    for (const listener of this.listeners) listener();
  }

  async credentials(): Promise<MobileSyncCredentials> {
    return (await this.getRuntime()).credentials;
  }

  async saveCredentials(credentials: MobileSyncCredentials): Promise<void> {
    await saveSyncCredentials(credentials);
    this.runtime = undefined;
    this.announce();
  }

  async summary(): Promise<SyncSummary> {
    return (await this.getRuntime()).engine.summary();
  }

  async syncNow(): Promise<SyncSummary> {
    this.announce();
    const summary = await (await this.getRuntime()).engine.syncNow();
    this.announce();
    return summary;
  }
}
