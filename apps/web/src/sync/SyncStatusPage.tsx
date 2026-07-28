import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { SettingsNav } from "../settings/SettingsNav";
import {
  getSyncConfiguration,
  getSyncSummary,
  saveSyncConfiguration,
  subscribeToSyncChanges,
  syncNow,
  type SyncConfiguration,
} from "./syncService";

export function SyncStatusPage() {
  const { t } = useTranslation();
  const [configuration, setConfiguration] = useState<SyncConfiguration>(getSyncConfiguration);
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getSyncSummary>>>();
  const [tokenVisible, setTokenVisible] = useState(false);

  const refresh = () => void getSyncSummary().then(setDetails);
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
