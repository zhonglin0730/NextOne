import type { RestorePoint } from "@nextone/storage-contracts";
import { useEffect, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { notifyTasksChanged } from "../tasks/taskService";
import { syncNow } from "../sync/syncService";
import {
  clearLocalCopy,
  createManualRestorePoint,
  downloadJsonExport,
  importSnapshot,
  listRestorePoints,
  previewImport,
  requestAccountDeletion,
  restoreFromPoint,
  type ImportPreview,
} from "./dataManagement";
import { SettingsNav } from "./SettingsNav";

export function DataManagementPage() {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<ImportPreview>();
  const [restorePoints, setRestorePoints] = useState<readonly RestorePoint[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [clearConfirmation, setClearConfirmation] = useState("");
  const [deletionRequest, setDeletionRequest] = useState("");

  const refreshRestorePoints = () => void listRestorePoints().then(setRestorePoints);
  useEffect(refreshRestorePoints, []);

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) {
      return;
    }
    setError("");
    try {
      setPreview(await previewImport(file));
    } catch {
      setPreview(undefined);
      setError(t("data.importInvalid"));
    }
  };

  const confirmImport = async () => {
    if (preview === undefined) {
      return;
    }
    await importSnapshot(preview);
    setPreview(undefined);
    setMessage(t("data.importComplete"));
    refreshRestorePoints();
    notifyTasksChanged();
    void syncNow();
  };

  const createRestorePoint = async () => {
    await createManualRestorePoint();
    setMessage(t("data.restorePointCreated"));
    refreshRestorePoints();
  };

  const restore = async (id: string) => {
    if (!window.confirm(t("data.restoreConfirm"))) {
      return;
    }
    await restoreFromPoint(id);
    setMessage(t("data.restoreComplete"));
    notifyTasksChanged();
    refreshRestorePoints();
    void syncNow();
  };

  const clear = async () => {
    if (clearConfirmation !== "CLEAR LOCAL" || !window.confirm(t("data.clearConfirm"))) {
      return;
    }
    await clearLocalCopy();
    window.location.assign("/today");
  };

  const createDeletionRequest = async () => {
    if (!window.confirm(t("data.account.requestConfirm"))) {
      return;
    }
    try {
      const request = await requestAccountDeletion();
      setDeletionRequest(
        t("data.account.requestCreated", {
          value: new Date(request.expiresAt).toLocaleString(),
        }),
      );
    } catch {
      setError(t("data.account.requestFailed"));
    }
  };

  return (
    <section className="page settings-page data-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("data.eyebrow")}</p>
          <h1>{t("data.title")}</h1>
          <p>{t("data.description")}</p>
        </div>
      </header>
      <SettingsNav />

      {(message || error) && (
        <div className={error ? "sync-error" : "data-success"} role="status">
          {error || message}
        </div>
      )}

      <div className="data-layout">
        <div className="data-main">
          <section className="panel data-section">
            <div>
              <h2>{t("data.exportTitle")}</h2>
              <p>{t("data.exportDescription")}</p>
            </div>
            <button className="button" onClick={() => void downloadJsonExport()} type="button">
              {t("data.exportJson")}
            </button>
          </section>

          <section className="panel data-section data-import">
            <div>
              <h2>{t("data.importTitle")}</h2>
              <p>{t("data.importDescription")}</p>
            </div>
            <label className="button data-file-button">
              {t("data.chooseFile")}
              <input
                accept="application/json,.json"
                onChange={(event) => void chooseFile(event)}
                type="file"
              />
            </label>
            <ol className="import-steps">
              <li>{t("data.steps.parse")}</li>
              <li>{t("data.steps.preview")}</li>
              <li>{t("data.steps.restorePoint")}</li>
              <li>{t("data.steps.confirm")}</li>
            </ol>
            {preview && (
              <div className="import-preview">
                <div>
                  <strong>{t("data.previewTitle")}</strong>
                  <span>{preview.fileName}</span>
                </div>
                <dl>
                  {Object.entries(preview.counts).map(([key, count]) => (
                    <div key={key}>
                      <dt>{t(`data.counts.${key}`)}</dt>
                      <dd>{count}</dd>
                    </div>
                  ))}
                </dl>
                <p>{t("data.replaceWarning")}</p>
                <div className="import-preview-actions">
                  <button
                    className="button button-quiet"
                    onClick={() => setPreview(undefined)}
                    type="button"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    className="button button-primary"
                    onClick={() => void confirmImport()}
                    type="button"
                  >
                    {t("data.confirmImport")}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="panel data-section">
            <div>
              <h2>{t("data.backupTitle")}</h2>
              <p>{t("data.backupDescription")}</p>
            </div>
            <button className="button" onClick={() => void createRestorePoint()} type="button">
              {t("data.createRestorePoint")}
            </button>
            <div className="restore-point-list">
              {restorePoints.length === 0 ? (
                <p className="empty-copy">{t("data.noRestorePoints")}</p>
              ) : (
                restorePoints.slice(0, 5).map((restorePoint) => (
                  <article key={restorePoint.id}>
                    <span>
                      <strong>{t(`data.restoreReason.${restorePoint.reason}`)}</strong>
                      <small>{new Date(restorePoint.createdAt).toLocaleString()}</small>
                    </span>
                    <button
                      className="button button-quiet"
                      onClick={() => void restore(restorePoint.id)}
                      type="button"
                    >
                      {t("data.restore")}
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="panel data-section danger-section">
            <div>
              <h2>{t("data.clearTitle")}</h2>
              <p>{t("data.clearDescription")}</p>
            </div>
            <label>
              <span>{t("data.clearInstruction")}</span>
              <input
                onChange={(event) => setClearConfirmation(event.target.value)}
                placeholder="CLEAR LOCAL"
                value={clearConfirmation}
              />
            </label>
            <button
              className="button danger-button"
              disabled={clearConfirmation !== "CLEAR LOCAL"}
              onClick={() => void clear()}
              type="button"
            >
              {t("data.clearAction")}
            </button>
          </section>
        </div>

        <aside className="panel account-panel">
          <span className="preview-badge">{t("data.account.preview")}</span>
          <h2>{t("data.account.title")}</h2>
          <p>{t("data.account.description")}</p>
          <ul>
            <li>{t("data.account.cloudOnly")}</li>
            <li>{t("data.account.backupFirst")}</li>
            <li>{t("data.account.localSeparate")}</li>
          </ul>
          <button
            className="button danger-button"
            onClick={() => void createDeletionRequest()}
            type="button"
          >
            {t("data.account.requestDeletion")}
          </button>
          {deletionRequest && <strong className="account-request-status">{deletionRequest}</strong>}
          <small>{t("data.account.interfaceOnly")}</small>
        </aside>
      </div>
    </section>
  );
}
