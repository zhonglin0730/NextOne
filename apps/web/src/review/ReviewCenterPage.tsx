import type { ReviewCenterView, ReviewReason } from "@nextone/application";
import type { Task, TaskStatus } from "@nextone/domain";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { ActionToast } from "../components/ActionToast";
import { transitionWithWipConfirmation } from "../tasks/taskActions";
import {
  notifyTasksChanged,
  reviewApplicationService,
  taskApplicationService,
  tasksChangedEvent,
} from "../tasks/taskService";
import { getLocalDate, getTimeZone } from "../today/date";

const reasons: readonly (ReviewReason | "FOCUSLESS_PROJECT")[] = [
  "STALE",
  "WAITING_OVERDUE",
  "DEADLINE_SOON",
  "REVIEW_DUE",
  "LONG_DOING",
  "FOCUSLESS_PROJECT",
];

export function ReviewCenterPage() {
  const { i18n, t } = useTranslation();
  const [view, setView] = useState<ReviewCenterView>();
  const [activity, setActivity] = useState<
    Awaited<ReturnType<typeof reviewApplicationService.getActivity>>
  >([]);
  const [reviewDates, setReviewDates] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    try {
      const [center, log] = await Promise.all([
        reviewApplicationService.getCenter(new Date().toISOString()),
        reviewApplicationService.getActivity(),
      ]);
      setView(center);
      setActivity(log);
      setError("");
    } catch {
      setError(t("common.error"));
    }
  }, [t]);

  useEffect(() => {
    void load();
    window.addEventListener(tasksChangedEvent, load);
    return () => window.removeEventListener(tasksChangedEvent, load);
  }, [load]);

  const transition = async (task: Task, status: TaskStatus) => {
    if (status === "CANCELED" && !window.confirm(t("task.abandonConfirm"))) {
      return;
    }
    try {
      setFeedback("");
      const updated = await transitionWithWipConfirmation(
        task.id,
        status,
        (limit) => window.confirm(`${t("wip.title", { limit })}\n\n${t("wip.confirm")}`),
        false,
      );
      if (
        updated !== undefined &&
        updated.status !== "COMPLETED" &&
        updated.status !== "CANCELED"
      ) {
        await taskApplicationService.acknowledgeReview(updated.id);
      }
      if (updated !== undefined) {
        const feedbackKey =
          status === "WAITING"
            ? "review.feedback.waiting"
            : status === "READY"
              ? "review.feedback.resumed"
              : status === "DOING"
                ? "review.feedback.started"
                : "review.feedback.canceled";
        setFeedback(t(feedbackKey, { title: task.title }));
        notifyTasksChanged();
      }
    } catch {
      setError(t("common.error"));
    }
  };

  const keepReady = async (task: Task) => {
    try {
      setFeedback("");
      await taskApplicationService.keepReadyAfterReview(task.id);
      notifyTasksChanged();
      setFeedback(t("review.feedback.keptReady", { title: task.title }));
    } catch {
      setError(t("common.error"));
    }
  };

  const acknowledge = async (task: Task, feedbackKey: string) => {
    try {
      setFeedback("");
      await taskApplicationService.acknowledgeReview(task.id);
      notifyTasksChanged();
      setFeedback(t(feedbackKey, { title: task.title }));
    } catch {
      setError(t("common.error"));
    }
  };

  const addToday = async (task: Task) => {
    try {
      setFeedback("");
      await taskApplicationService.addToToday(task.id, getLocalDate(), getTimeZone());
      await taskApplicationService.acknowledgeReview(task.id);
      notifyTasksChanged();
      setFeedback(t("review.feedback.addedToday", { title: task.title }));
    } catch {
      setError(t("common.error"));
    }
  };

  const someday = async (task: Task) => {
    try {
      setFeedback("");
      const updated = await taskApplicationService.moveToBoardColumn(task.id, "SOMEDAY");
      await taskApplicationService.acknowledgeReview(updated.id);
      notifyTasksChanged();
      setFeedback(t("review.feedback.someday", { title: task.title }));
    } catch {
      setError(t("common.error"));
    }
  };

  const setReviewDate = async (task: Task) => {
    const reviewAt = reviewDates[task.id];
    if (reviewAt === undefined || reviewAt.length === 0) {
      return;
    }
    try {
      setFeedback("");
      await taskApplicationService.setReviewDate(task.id, reviewAt);
      notifyTasksChanged();
      setFeedback(t("review.feedback.reviewDateSet", { title: task.title, date: reviewAt }));
    } catch {
      setError(t("common.error"));
    }
  };

  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section className="page review-page" aria-labelledby="review-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("review.eyebrow")}</p>
          <h1 id="review-title">{t("review.title")}</h1>
          <p>{t("review.description")}</p>
        </div>
        <Link className="button button-primary" to="/review/daily">
          {t("dailyClose.open")}
        </Link>
      </header>

      {error.length > 0 ? <p className="page-error">{error}</p> : null}
      <ActionToast message={feedback} onDismiss={() => setFeedback("")} />

      <div className="review-summary-grid">
        {reasons.map((reason) => (
          <article className="review-summary-card" key={reason}>
            <span>{t(`review.reason.${reason}`)}</span>
            <strong>{view?.counts[reason] ?? 0}</strong>
          </article>
        ))}
      </div>

      <section className="review-section">
        <header>
          <div>
            <h2>{t("review.queue")}</h2>
            <p>{t("review.queueDescription")}</p>
          </div>
          <span className="count-pill">{view?.items.length ?? 0}</span>
        </header>

        {view === undefined || view.items.length === 0 ? (
          <p className="inline-empty">{t("review.emptyQueue")}</p>
        ) : (
          <div className="review-decision-list">
            {view.items.map(({ task, reasons: itemReasons }) => (
              <article className="review-decision-card" key={task.id}>
                <div>
                  <div className="review-reason-list">
                    {itemReasons.map((reason) => (
                      <span key={reason}>{t(`review.reason.${reason}`)}</span>
                    ))}
                  </div>
                  <h3>{task.title}</h3>
                  <p>{t(`status.${task.status}`)}</p>
                </div>
                <div className="review-actions">
                  {task.status === "READY" ? (
                    <>
                      <button
                        className="button button-primary button-small"
                        onClick={() => void addToday(task)}
                        type="button"
                      >
                        {t("task.addToday")}
                      </button>
                      <button
                        className="button button-outline button-small"
                        onClick={() => void transition(task, "DOING")}
                        type="button"
                      >
                        {t("action.DOING")}
                      </button>
                      <button
                        className="button button-quiet button-small"
                        onClick={() => void keepReady(task)}
                        title={t("review.keepReadyDescription")}
                        type="button"
                      >
                        {t("review.keepReady")}
                      </button>
                    </>
                  ) : null}
                  {task.status === "DOING" ? (
                    <button
                      className="button button-primary button-small"
                      onClick={() => void acknowledge(task, "review.feedback.continueDoing")}
                      type="button"
                    >
                      {t("review.continueDoing")}
                    </button>
                  ) : null}
                  {task.status === "WAITING" ? (
                    <>
                      <button
                        className="button button-primary button-small"
                        onClick={() => void transition(task, "READY")}
                        type="button"
                      >
                        {t("review.resumeReady")}
                      </button>
                      <button
                        className="button button-outline button-small"
                        onClick={() => void acknowledge(task, "review.feedback.continueWaiting")}
                        type="button"
                      >
                        {t("review.continueWaiting")}
                      </button>
                    </>
                  ) : null}
                  <details className="review-more-actions">
                    <summary>{t("review.moreActions")}</summary>
                    <div>
                      {task.status !== "WAITING" ? (
                        <button
                          className="button button-quiet button-small"
                          onClick={() => void transition(task, "WAITING")}
                          type="button"
                        >
                          {t("action.WAITING")}
                        </button>
                      ) : null}
                      <button
                        className="button button-quiet button-small"
                        onClick={() => void someday(task)}
                        type="button"
                      >
                        {t("action.someday")}
                      </button>
                      <button
                        className="button button-danger button-small"
                        onClick={() => void transition(task, "CANCELED")}
                        type="button"
                      >
                        {t("action.CANCELED")}
                      </button>
                    </div>
                  </details>
                </div>
                <div className="review-date-action">
                  <div className="review-date-copy">
                    <strong>{t("review.remindLater")}</strong>
                    <span>{t("review.reviewDateDescription")}</span>
                  </div>
                  <input
                    aria-label={t("review.setReviewDate")}
                    min={getLocalDate()}
                    onChange={(event) =>
                      setReviewDates((current) => ({ ...current, [task.id]: event.target.value }))
                    }
                    type="date"
                    value={reviewDates[task.id] ?? ""}
                  />
                  <button
                    className="button button-outline button-small"
                    disabled={(reviewDates[task.id] ?? "").length === 0}
                    onClick={() => void setReviewDate(task)}
                    type="button"
                  >
                    {t("review.setReviewDate")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {view !== undefined && view.focuslessProjects.length > 0 ? (
        <section className="review-section">
          <header>
            <h2>{t("review.focuslessProjects")}</h2>
          </header>
          <div className="review-project-list">
            {view.focuslessProjects.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`}>
                <strong>{project.name}</strong>
                <span>{t("project.needsDecision")} →</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="review-section">
        <header>
          <div>
            <h2>{t("review.activity")}</h2>
            <p>{t("review.activityDescription")}</p>
          </div>
        </header>
        {activity.length === 0 ? (
          <p className="inline-empty">{t("review.emptyActivity")}</p>
        ) : (
          <ol className="review-activity-log">
            {activity.slice(0, 30).map((entry) => (
              <li key={entry.id}>
                <span className="activity-dot" aria-hidden="true" />
                <div>
                  <strong>{entry.task?.title ?? entry.project?.name}</strong>
                  <span>{t(`event.${entry.type}`)}</span>
                  <time dateTime={entry.occurredAt}>
                    {formatter.format(new Date(entry.occurredAt))}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
