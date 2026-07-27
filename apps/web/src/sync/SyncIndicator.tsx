import type { SyncSummary } from "@nextone/sync-core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { getSyncSummary, subscribeToSyncChanges, syncNow } from "./syncService";

export function SyncIndicator() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<SyncSummary>();

  const refresh = () => {
    void getSyncSummary().then(setSummary);
  };

  useEffect(() => {
    refresh();
    return subscribeToSyncChanges(refresh);
  }, []);

  const status = summary?.state.status ?? "OFFLINE";
  const needsAttention = summary?.conflictCount ?? 0;
  const pendingCount = summary?.pendingCount ?? 0;
  const quiet = status === "UP_TO_DATE" && needsAttention === 0 && pendingCount === 0;
  const label = `${t(`sync.status.${status}`)}${pendingCount > 0 ? ` · ${pendingCount}` : ""}`;

  return (
    <div className={`sync-indicator${quiet ? " sync-indicator-quiet" : ""}`}>
      <button
        aria-label={label}
        className={`sync-status sync-status-${status.toLowerCase()}`}
        disabled={status === "SYNCING"}
        onClick={() => void syncNow()}
        title={label}
        type="button"
      >
        <span aria-hidden="true">●</span>
        <span className="sync-status-label">{label}</span>
      </button>
      {needsAttention > 0 && (
        <Link className="sync-attention" to="/settings/sync">
          {t("sync.needsAttention", { count: needsAttention })}
        </Link>
      )}
    </div>
  );
}
