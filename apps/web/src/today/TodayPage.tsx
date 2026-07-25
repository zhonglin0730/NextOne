import type { TodayTask, TodayView } from "@nextone/application";
import type { Task, TaskStatus } from "@nextone/domain";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { transitionWithWipConfirmation } from "../tasks/taskActions";
import {
  notifyTasksChanged,
  taskApplicationService,
  tasksChangedEvent,
} from "../tasks/taskService";
import { getLocalDate } from "./date";

function TodayTaskCard({
  entry,
  onRemove,
  onTransition,
}: {
  entry: TodayTask;
  onRemove: (task: Task) => void;
  onTransition: (task: Task, status: TaskStatus) => void;
}) {
  const { t } = useTranslation();
  const { task } = entry;

  return (
    <article className="today-task-card">
      <div>
        <span className={`status-badge status-${task.status.toLowerCase()}`}>
          {t(`status.${task.status}`)}
        </span>
        <h3>{task.title}</h3>
        {task.estimateMinutes === undefined ? null : (
          <p>{t("today.minutes", { count: task.estimateMinutes })}</p>
        )}
      </div>
      <div className="card-actions">
        {task.status === "INBOX" ? (
          <button
            className="button button-quiet button-small"
            onClick={() => onTransition(task, "READY")}
            type="button"
          >
            {t("inbox.clarify")}
          </button>
        ) : null}
        {task.status === "READY" || task.status === "WAITING" ? (
          <button
            className="button button-primary button-small"
            onClick={() => onTransition(task, "DOING")}
            type="button"
          >
            {t("action.DOING")}
          </button>
        ) : null}
        {task.status === "DOING" ? (
          <button
            className="button button-quiet button-small"
            onClick={() => onTransition(task, "READY")}
            type="button"
          >
            {t("action.pause")}
          </button>
        ) : null}
        {task.status === "DOING" || task.status === "READY" ? (
          <button
            className="button button-quiet button-small"
            onClick={() => onTransition(task, "WAITING")}
            type="button"
          >
            {t("action.WAITING")}
          </button>
        ) : null}
        {task.status !== "INBOX" ? (
          <button
            className="button button-quiet button-small"
            onClick={() => onTransition(task, "COMPLETED")}
            type="button"
          >
            {t("action.COMPLETED")}
          </button>
        ) : null}
        <button
          className="button button-quiet button-small"
          onClick={() => onRemove(task)}
          type="button"
        >
          {t("action.removeToday")}
        </button>
      </div>
    </article>
  );
}

export function TodayPage() {
  const { i18n, t } = useTranslation();
  const localDate = useMemo(() => getLocalDate(), []);
  const [view, setView] = useState<TodayView>({
    plan: undefined,
    focus: [],
    later: [],
    doing: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setView(await taskApplicationService.getToday(localDate));
      setError("");
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [localDate, t]);

  useEffect(() => {
    void load();
    window.addEventListener(tasksChangedEvent, load);
    return () => window.removeEventListener(tasksChangedEvent, load);
  }, [load]);

  const confirmOverride = (limit: number) =>
    window.confirm(`${t("wip.title", { limit })}\n\n${t("wip.confirm")}`);

  const transition = async (task: Task, status: TaskStatus) => {
    try {
      await transitionWithWipConfirmation(task.id, status, confirmOverride);
      await load();
    } catch {
      setError(t("common.error"));
    }
  };

  const remove = async (task: Task) => {
    try {
      await taskApplicationService.removeFromToday(task.id, localDate);
      notifyTasksChanged();
      await load();
    } catch {
      setError(t("common.error"));
    }
  };

  const dateFormatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "zh-CN", {
    dateStyle: "full",
  });

  return (
    <section className="page today-page" aria-labelledby="today-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("today.dateLabel")}</p>
          <h1 id="today-title">{t("today.title")}</h1>
          <p>{t("today.description")}</p>
        </div>
        <div className="page-header-actions">
          <time className="date-pill" dateTime={localDate}>
            {dateFormatter.format(new Date(`${localDate}T12:00:00`))}
          </time>
          <Link className="button button-outline" to="/review/daily">
            {t("dailyClose.open")}
          </Link>
        </div>
      </header>

      {error.length > 0 ? <p className="page-error">{error}</p> : null}

      <div className="today-grid">
        <section className="today-section today-focus" aria-labelledby="focus-title">
          <header className="section-heading">
            <div>
              <h2 id="focus-title">{t("today.focus")}</h2>
              <p>{t("today.focusDescription")}</p>
            </div>
            <span className="count-pill">
              {t("today.focusCount", { count: view.focus.length })}
            </span>
          </header>
          {loading ? (
            <div className="mini-skeleton" />
          ) : view.focus.length === 0 ? (
            <div className="section-empty">
              <strong>{t("today.emptyFocus")}</strong>
              <p>{t("today.emptyFocusDescription")}</p>
              <Link className="button button-outline" to="/board">
                {t("today.openBoard")}
              </Link>
            </div>
          ) : (
            <div className="today-task-list">
              {view.focus.map((entry) => (
                <TodayTaskCard
                  entry={entry}
                  key={entry.item.id}
                  onRemove={(task) => void remove(task)}
                  onTransition={(task, status) => void transition(task, status)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="today-section" aria-labelledby="doing-title">
          <header className="section-heading">
            <div>
              <h2 id="doing-title">{t("today.doing")}</h2>
              <p>{t("today.doingDescription")}</p>
            </div>
            <span className="count-pill">{view.doing.length}/3</span>
          </header>
          {view.doing.length === 0 ? (
            <p className="inline-empty">{t("today.emptyDoing")}</p>
          ) : (
            <div className="doing-list">
              {view.doing.map((task) => (
                <article className="doing-row" key={task.id}>
                  <span className="doing-indicator" aria-hidden="true" />
                  <strong>{task.title}</strong>
                  <div className="card-actions">
                    <button
                      className="button button-quiet button-small"
                      onClick={() => void transition(task, "READY")}
                      type="button"
                    >
                      {t("action.pause")}
                    </button>
                    <button
                      className="button button-quiet button-small"
                      onClick={() => void transition(task, "WAITING")}
                      type="button"
                    >
                      {t("action.WAITING")}
                    </button>
                    <button
                      className="button button-primary button-small"
                      onClick={() => void transition(task, "COMPLETED")}
                      type="button"
                    >
                      {t("action.COMPLETED")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="today-section today-later" aria-labelledby="later-title">
          <header className="section-heading">
            <div>
              <h2 id="later-title">{t("today.later")}</h2>
              <p>{t("today.laterDescription")}</p>
            </div>
          </header>
          {view.later.length === 0 ? (
            <p className="inline-empty">{t("today.emptyLater")}</p>
          ) : (
            <div className="today-task-list">
              {view.later.map((entry) => (
                <TodayTaskCard
                  entry={entry}
                  key={entry.item.id}
                  onRemove={(task) => void remove(task)}
                  onTransition={(task, status) => void transition(task, status)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
