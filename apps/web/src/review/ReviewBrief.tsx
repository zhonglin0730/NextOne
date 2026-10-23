import type { ReviewCenterView } from "@nextone/application";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { reviewApplicationService, tasksChangedEvent } from "../tasks/taskService";

export function ReviewBrief() {
  const { t } = useTranslation();
  const [view, setView] = useState<ReviewCenterView>();
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      setView(await reviewApplicationService.getCenter(new Date().toISOString()));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
    window.addEventListener(tasksChangedEvent, load);
    return () => window.removeEventListener(tasksChangedEvent, load);
  }, [load]);
  return (
    <section className="today-context-card review-brief">
      <h2>{t("shell.attention")}</h2>
      {failed ? (
        <p role="alert">{t("common.error")}</p>
      ) : view === undefined ? (
        <div className="mini-skeleton" />
      ) : view.items.length === 0 && view.focuslessProjects.length === 0 ? (
        <p className="muted">{t("shell.attentionEmpty")}</p>
      ) : (
        <ul>
          {view.items.slice(0, 3).map(({ task, reasons }) => (
            <li key={task.id}>
              <Link to="/review">
                <span>{task.title}</span>
                <small>{reasons.map((reason) => t(`review.reason.${reason}`)).join(" · ")}</small>
              </Link>
            </li>
          ))}
          {view.focuslessProjects.slice(0, Math.max(0, 3 - view.items.length)).map((project) => (
            <li key={project.id}>
              <Link to={`/projects/${project.id}`}>
                <span>{project.name}</span>
                <small>{t("review.reason.FOCUSLESS_PROJECT")}</small>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link className="brief-link" to="/review">
        {t("shell.viewReview")} →
      </Link>
    </section>
  );
}
