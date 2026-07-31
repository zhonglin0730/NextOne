import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { SettingsNav } from "../settings/SettingsNav";
import {
  getSyncConfiguration,
  getSyncSummary,
  listSyncConflicts,
  resolveSyncConflict,
  saveSyncConfiguration,
  subscribeToSyncChanges,
  syncNow,
  type SyncConfiguration,
} from "./syncService";

export function SyncStatusPage() {
  const { t } = useTranslation();
  const [configuration, setConfiguration] = useState<SyncConfiguration>(getSyncConfiguration);
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getSyncSummary>>>();
  const [conflicts, setConflicts] = useState<
    Awaited<ReturnType<typeof listSyncConflicts>>
  >([]);
  const [resolvingId, setResolvingId] = useState<string>();
  const [confirmingServerId, setConfirmingServerId] = useState<string>();
  const [tokenVisible, setTokenVisible] = useState(false);

  const refresh = () => {
    void Promise.all([getSyncSummary(), listSyncConflicts()]).then(
      ([nextDetails, nextConflicts]) => {
        setDetails(nextDetails);
        setConflicts(nextConflicts);
      },
    );
  };
  useEffect(() => {
    refresh();
    return subscribeToSyncChanges(refresh);
  }, []);

  const saveAndSync = async () => {
    saveSyncConfiguration(configuration);
    await syncNow();
  };

  const resolve = async (conflictId: string, resolution: "KEEP_LOCAL" | "USE_SERVER") => {
    setResolvingId(conflictId);
    try {
      await resolveSyncConflict(conflictId, resolution);
      refresh();
    } finally {
      setResolvingId(undefined);
      setConfirmingServerId(undefined);
    }
  };

  const conflictName = (conflict: (typeof conflicts)[number]) => {
    const payload =
      conflict.localPayload !== null && typeof conflict.localPayload === "object"
        ? (conflict.localPayload as Record<string, unknown>)
        : undefined;
    const title = payload?.title ?? payload?.name;
    return typeof title === "string" && title.trim().length > 0
      ? title
      : conflict.entityId;
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
          <strong>{details?.conflictCount ?? 0}</strong>
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

      <section className="panel sync-conflicts" aria-labelledby="sync-conflicts-title">
        <div>
          <h2 id="sync-conflicts-title">{t("sync.conflictTitle")}</h2>
          <p>{t("sync.conflictDescription")}</p>
        </div>
        {conflicts.length === 0 ? (
          <p className="muted">{t("sync.noConflicts")}</p>
        ) : (
          <div className="sync-conflict-list">
            {conflicts.map((conflict) => (
              <article className="sync-conflict-card" key={conflict.id}>
                <div>
                  <span>
                    {t(`sync.entity.${conflict.entityType}`)}
                  </span>
                  <strong>{conflictName(conflict)}</strong>
                  <small>
                    {t(`sync.errorCode.${conflict.code}`, {
                      defaultValue: conflict.code,
                    })}
                  </small>
                </div>
                <div className="sync-conflict-actions">
                  {confirmingServerId === conflict.id ? (
                    <>
                      <small>{t("sync.useServerConfirm")}</small>
                      <button
                        className="button button-danger"
                        disabled={resolvingId !== undefined}
                        onClick={() => void resolve(conflict.id, "USE_SERVER")}
                        type="button"
                      >
                        {t("sync.confirmUseServer")}
                      </button>
                      <button
                        className="button button-quiet"
                        disabled={resolvingId !== undefined}
                        onClick={() => setConfirmingServerId(undefined)}
                        type="button"
                      >
                        {t("common.cancel")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="button button-outline"
                        disabled={resolvingId !== undefined}
                        onClick={() => void resolve(conflict.id, "KEEP_LOCAL")}
                        type="button"
                      >
                        {t("sync.keepLocal")}
                      </button>
                      <button
                        className="button button-quiet"
                        disabled={resolvingId !== undefined}
                        onClick={() => setConfirmingServerId(conflict.id)}
                        type="button"
                      >
                        {t("sync.useServer")}
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

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
        <div className="sync-secret-field">
          <div className="sync-field-label">
            <span>{t("sync.token")}</span>
            <button
              className="button-link"
              onClick={() => setTokenVisible((visible) => !visible)}
              type="button"
            >
              {t(tokenVisible ? "sync.hideToken" : "sync.showToken")}
            </button>
          </div>
          <input
            aria-label={t("sync.token")}
            onChange={(event) =>
              setConfiguration((current) => ({ ...current, token: event.target.value }))
            }
            type={tokenVisible ? "text" : "password"}
            value={configuration.token}
          />
        </div>
        <button className="button" onClick={() => void saveAndSync()} type="button">
          {t("sync.saveAndTest")}
        </button>
      </section>
    </section>
  );
}
