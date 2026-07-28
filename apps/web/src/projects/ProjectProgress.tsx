import type { ProjectProgress as ProjectProgressData } from "@nextone/application";
import { useTranslation } from "react-i18next";

interface ProjectProgressProps {
  compact?: boolean;
  progress: ProjectProgressData;
}

const segmentKeys = ["completed", "doing", "waiting", "ready"] as const;

export function ProjectProgress({ compact = false, progress }: ProjectProgressProps) {
  const { t } = useTranslation();
  const summary =
    progress.total === 0
      ? t("project.progressEmpty")
      : t("project.progressSummary", {
          completed: progress.completed,
          total: progress.total,
          percent: progress.completedPercent,
        });

  return (
    <section
      className={`project-progress${compact ? " project-progress-compact" : ""}`}
      aria-label={t("project.progressTitle")}
    >
      <header>
        <div>
          <span>{t("project.progressTitle")}</span>
          {compact ? null : <small>{t("project.progressDescription")}</small>}
        </div>
        {progress.total === 0 ? null : <strong>{progress.completedPercent}%</strong>}
      </header>

      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress.completedPercent}
        aria-valuetext={summary}
        className={`project-progress-track${progress.total === 0 ? " is-empty" : ""}`}
        role="progressbar"
      >
        {progress.total === 0
          ? null
          : segmentKeys.map((key) =>
              progress[key] === 0 ? null : (
                <span
                  aria-hidden="true"
                  className={`project-progress-segment project-progress-${key}`}
                  key={key}
                  style={{ flexGrow: progress[key] }}
                />
              ),
            )}
      </div>

      {progress.total === 0 ? (
        <p className="project-progress-empty">{summary}</p>
      ) : compact ? (
        <p>
          {t("project.progressCount", { completed: progress.completed, total: progress.total })}
        </p>
      ) : (
        <ul className="project-progress-legend">
          {segmentKeys.map((key) => (
            <li key={key}>
              <span className={`project-progress-dot project-progress-${key}`} aria-hidden="true" />
              <span>{t(`project.progressStatus.${key}`)}</span>
              <strong>{progress[key]}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
