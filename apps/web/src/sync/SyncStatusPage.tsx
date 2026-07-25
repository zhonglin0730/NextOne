import type { SyncConflict, SyncState } from "@nextone/storage-contracts";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { nextOneDatabase } from "../storage/indexedDb";
import { SettingsNav } from "../settings/SettingsNav";
import {
  getSyncConfiguration,
  getSyncSummary,
  saveSyncConfiguration,
  resolveSyncConflict,
  subscribeToSyncChanges,
  syncNow,
  type SyncConfiguration,
} from "./syncService";

interface Details {
  state: SyncState;
  pendingCount: number;
  blockedCount: number;
  conflicts: readonly SyncConflict[];
}

async function loadDetails(): Promise<Details> {
  const summary = await getSyncSummary();
  const conflicts = await nextOneDatabase.transaction((transaction) =>
    transaction.syncConflicts.listOpen(),
  );
  return { ...summary, conflicts };
}

function groupConflicts(conflicts: readonly SyncConflict[]): readonly SyncConflict[] {
  const grouped = new Map<string, SyncConflict>();
  for (const conflict of conflicts) {
    const key = `${conflict.entityType}:${conflict.entityId}`;
    const existing = grouped.get(key);
    if (
      existing === undefined ||
      (existing.serverPayload === undefined && conflict.serverPayload)
    ) {
      grouped.set(key, conflict);
    }
  }
  return [...grouped.values()];
}

export function SyncStatusPage() {
  const { t } = useTranslation();
  const [configuration, setConfiguration] = useState<SyncConfiguration>(getSyncConfiguration);
  const [details, setDetails] = useState<Details>();
  const visibleConflicts = groupConflicts(details?.conflicts ?? []);

  const refresh = () => void loadDetails().then(setDetails);
  useEffect(() => {
    refresh();
    return subscribeToSyncChanges(refresh);
  }, []);

  const saveAndSync = async () => {
    saveSyncConfiguration(configuration);
    await syncNow();
  };

  return (
    <section className="page sync-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("sync.eyebrow")}</p>
          <h1>{t("sync.title")}</h1>
          <p>{t("sync.description")}</p>
        </div>
        <button
          className="button button-primary"
          disabled={details?.state.status === "SYNCING"}
          onClick={() => void syncNow()}
          type="button"
        >
          {t("sync.syncNow")}
        </button>
      </header>
      <SettingsNav />

      <div className="sync-summary-grid">
        <article className="panel sync-summary-card">
          <span>{t("sync.currentStatus")}</span>
          <strong>{t(`sync.status.${details?.state.status ?? "OFFLINE"}`)}</strong>
          <small>
            {details?.state.lastSyncAt
              ? t("sync.lastSync", {
                  value: new Date(details.state.lastSyncAt).toLocaleString(),
                })
              : t("sync.neverSynced")}
          </small>
        </article>
        <article className="panel sync-summary-card">
          <span>{t("sync.pending")}</span>
          <strong>{details?.pendingCount ?? 0}</strong>
          <small>{t("sync.pendingHint")}</small>
        </article>
        <article className="panel sync-summary-card">
          <span>{t("sync.conflicts")}</span>
          <strong>{visibleConflicts.length}</strong>
          <small>{t("sync.conflictHint")}</small>
        </article>
      </div>

      {details?.state.lastError && (
        <div className="sync-error" role="alert">
          <strong>{t("sync.lastError")}</strong>
          <span>
            {t(`sync.errorCode.${details.state.lastError}`, {
              defaultValue: details.state.lastError,
            })}
          </span>
          {details.state.nextRetryAt && (
            <small>
              {t("sync.nextRetry", {
                value: new Date(details.state.nextRetryAt).toLocaleString(),
              })}
            </small>
          )}
        </div>
      )}

      <section className="panel sync-settings">
        <div>
          <h2>{t("sync.server")}</h2>
          <p>{t("sync.serverHint")}</p>
        </div>
        <label>
          <span>{t("sync.apiUrl")}</span>
          <input
            onChange={(event) =>
              setConfiguration((current) => ({ ...current, apiUrl: event.target.value }))
            }
            value={configuration.apiUrl}
          />
        </label>
        <label>
          <span>{t("sync.token")}</span>
          <input
            onChange={(event) =>
              setConfiguration((current) => ({ ...current, token: event.target.value }))
            }
            type="password"
            value={configuration.token}
          />
        </label>
        <button className="button" onClick={() => void saveAndSync()} type="button">
          {t("sync.saveAndTest")}
        </button>
      </section>

      <section className="panel sync-conflicts">
        <div>
          <h2>{t("sync.conflictTitle")}</h2>
          <p>{t("sync.conflictDescription")}</p>
        </div>
        {visibleConflicts.length === 0 ? (
          <p className="empty-copy">{t("sync.noConflicts")}</p>
        ) : (
          <div className="sync-conflict-list">
            {visibleConflicts.map((conflict) => (
              <article key={conflict.id}>
                <div>
                  <strong>
                    {t(`sync.entity.${conflict.entityType}`)} · {conflict.entityId}
                  </strong>
                  <span>
                    {t(`sync.errorCode.${conflict.code}`, {
                      defaultValue: conflict.code,
                    })}
                  </span>
                  <small>{new Date(conflict.createdAt).toLocaleString()}</small>
                </div>
                <div className="sync-conflict-actions">
                  <button
                    className="button button-quiet"
                    disabled={conflict.serverPayload === undefined}
                    onClick={() => void resolveSyncConflict(conflict.id, "USE_SERVER")}
                    type="button"
                  >
                    {t("sync.useServer")}
                  </button>
                  <button
                    className="button"
                    onClick={() => void resolveSyncConflict(conflict.id, "KEEP_LOCAL")}
                    type="button"
                  >
                    {t("sync.keepLocal")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
