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

  return (
    <div className="sync-indicator">
      <button
        className={`sync-status sync-status-${status.toLowerCase()}`}
        disabled={status === "SYNCING"}
        onClick={() => void syncNow()}
        type="button"
      >
        <span aria-hidden="true">●</span>
        {t(`sync.status.${status}`)}
        {(summary?.pendingCount ?? 0) > 0 && ` · ${summary?.pendingCount}`}
      </button>
      {needsAttention > 0 && (
        <Link className="sync-attention" to="/settings/sync">
          {t("sync.needsAttention", { count: needsAttention })}
        </Link>
      )}
    </div>
  );
}
