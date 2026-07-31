import type { ProjectOverview } from "@nextone/application";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

const segmentKeys = ["completed", "doing", "waiting", "ready"] as const;
type SegmentKey = (typeof segmentKeys)[number];

interface ProjectPortfolioOverviewProps {
  projects: readonly ProjectOverview[];
}

export function ProjectPortfolioOverview({ projects }: ProjectPortfolioOverviewProps) {
  const { t } = useTranslation();
  const totals = projects.reduce(
    (summary, { progress }) => {
      for (const key of segmentKeys) {
        summary[key] += progress[key];
      }
      return summary;
    },
    { completed: 0, doing: 0, waiting: 0, ready: 0 } as Record<SegmentKey, number>,
  );

  return (
    <section className="portfolio-overview" aria-labelledby="portfolio-overview-title">
      <header className="portfolio-overview-header">
        <div>
          <p className="eyebrow">{t("project.portfolioEyebrow")}</p>
          <h2 id="portfolio-overview-title">{t("project.portfolioOverviewTitle")}</h2>
          <p>{t("project.portfolioOverviewDescription")}</p>
        </div>
        <ul className="portfolio-overview-summary" aria-label={t("project.progressTitle")}>
          {segmentKeys.map((key) => (
            <li key={key}>
              <span className={`portfolio-status-dot portfolio-status-${key}`} aria-hidden="true" />
              <span>{t(`project.progressStatus.${key}`)}</span>
              <strong>{totals[key]}</strong>
            </li>
          ))}
        </ul>
      </header>

      <div className="portfolio-project-list">
        {projects.map(({ project, progress }) => {
          const summary = t("project.progressSummary", {
            completed: progress.completed,
            total: progress.total,
            percent: progress.completedPercent,
          });
          return (
            <Link className="portfolio-project-row" key={project.id} to={`/projects/${project.id}`}>
              <div className="portfolio-project-row-header">
                <strong>{project.name}</strong>
                <span>{progress.total === 0 ? "—" : `${progress.completedPercent}%`}</span>
              </div>
              <div
                aria-label={summary}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={progress.completedPercent}
                className={`portfolio-project-track${progress.total === 0 ? " is-empty" : ""}`}
                role="progressbar"
              >
                {progress.total === 0
                  ? null
                  : segmentKeys.map((key) =>
                      progress[key] === 0 ? null : (
                        <span
                          aria-hidden="true"
                          className={`portfolio-project-segment portfolio-status-${key}`}
                          key={key}
                          style={{ flexGrow: progress[key] }}
                        />
                      ),
                    )}
              </div>
              <div className="portfolio-project-row-footer">
                <span>
                  {segmentKeys.map((key, index) => (
                    <span key={key}>
                      {index === 0 ? null : " · "}
                      {t(`project.progressStatus.${key}`)} {progress[key]}
                    </span>
                  ))}
                </span>
                <span>{t("project.openProject")} →</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
