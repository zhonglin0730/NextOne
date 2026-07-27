import type { Task } from "@nextone/domain";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { calculateDailyCapacity } from "./capacity";

interface DailyCapacityProps {
  tasks: readonly Task[];
  capacityMinutes: number;
}

export function DailyCapacity({ tasks, capacityMinutes }: DailyCapacityProps) {
  const { t } = useTranslation();
  const capacity = useMemo(
    () => calculateDailyCapacity(tasks, capacityMinutes),
    [capacityMinutes, tasks],
  );

  if (capacity.level === "EMPTY") {
    return null;
  }

  const progress = Math.min(100, Math.round(capacity.ratio * 100));

  return (
    <section
      className={`capacity-strip capacity-${capacity.level.toLowerCase()}`}
      aria-label={t("capacity.title")}
    >
      <div className="capacity-copy">
        <span>{t("capacity.title")}</span>
        <strong>
          {t("capacity.summary", {
            estimated: capacity.estimatedMinutes,
            capacity: capacity.capacityMinutes,
          })}
        </strong>
      </div>
      <div className="capacity-meter">
        <div
          aria-label={t("capacity.progress")}
          aria-valuemax={capacity.capacityMinutes}
          aria-valuemin={0}
          aria-valuenow={capacity.estimatedMinutes}
          className="capacity-track"
          role="progressbar"
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="capacity-message">
          <span>{t(`capacity.level.${capacity.level}`)}</span>
          {capacity.unestimatedCount > 0 ? (
            <small>{t("capacity.unestimated", { count: capacity.unestimatedCount })}</small>
          ) : null}
        </div>
      </div>
    </section>
  );
}
