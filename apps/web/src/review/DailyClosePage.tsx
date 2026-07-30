import type { DailyCloseTask, DailyCloseView } from "@nextone/application";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import {
  notifyTasksChanged,
  reviewApplicationService,
  taskApplicationService,
} from "../tasks/taskService";
import { loadActionRules } from "../settings/preferences";
import { getLocalDate, getTimeZone } from "../today/date";

function addLocalDays(localDate: string, days: number): string {
  const date = new Date(`${localDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function DailyClosePage() {
  const { t } = useTranslation();
  const localDate = useMemo(() => getLocalDate(), []);
  const tomorrow = useMemo(() => addLocalDays(localDate, 1), [localDate]);
  const [view, setView] = useState<DailyCloseView>();
  const [tomorrowCount, setTomorrowCount] = useState(0);
  const [focusLimit, setFocusLimit] = useState(3);
  const [processed, setProcessed] = useState<ReadonlySet<string>>(new Set());
  const [canceled, setCanceled] = useState<readonly DailyCloseTask[]>([]);
  const [reviewDates, setReviewDates] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [close, tomorrowView, rules] = await Promise.all([
        reviewApplicationService.getDailyClose(localDate, getTimeZone()),
        taskApplicationService.getToday(tomorrow),
        loadActionRules(),
      ]);
      setView(close);
      setTomorrowCount(tomorrowView.focus.length);
      setFocusLimit(rules.focusLimit);
      setError("");
    } catch {
      setError(t("common.error"));
    }
  }, [localDate, t, tomorrow]);

  useEffect(() => {
    void load();
  }, [load]);

  const markProcessed = (taskId: string) =>
    setProcessed((current) => new Set([...current, taskId]));

  const continueTomorrow = async (entry: DailyCloseTask) => {
    try {
      const section = tomorrowCount < focusLimit ? "FOCUS" : "LATER";
      await taskApplicationService.continueTomorrow(
        entry.task.id,
        localDate,
        tomorrow,
        getTimeZone(),
        section,
      );
      markProcessed(entry.task.id);
      notifyTasksChanged();
      await load();
    } catch {
      setError(t("common.error"));
    }
  };

  const removeToday = async (entry: DailyCloseTask) => {
    try {
      if (entry.task.status === "DOING") {
        await taskApplicationService.transition(entry.task.id, "READY");
      }
      await taskApplicationService.removeFromToday(entry.task.id, localDate);
      markProcessed(entry.task.id);
      notifyTasksChanged();
      await load();
    } catch {
      setError(t("common.error"));
    }
  };

  const move = async (entry: DailyCloseTask, action: "WAITING" | "SOMEDAY" | "CANCELED") => {
    if (action === "CANCELED" && !window.confirm(t("task.abandonConfirm"))) {
      return;
    }
    try {
      if (action === "SOMEDAY") {
        await taskApplicationService.moveToBoardColumn(entry.task.id, "SOMEDAY");
      } else {
        await taskApplicationService.transition(entry.task.id, action);
      }
      if (action === "CANCELED") {
        setCanceled((current) => [...current, entry]);
      }
      markProcessed(entry.task.id);
      notifyTasksChanged();
      await load();
    } catch {
      setError(t("common.error"));
    }
  };

  const snooze = async (entry: DailyCloseTask) => {
    const date = reviewDates[entry.task.id];
    if (date === undefined || date.length === 0) {
      return;
    }
    try {
      if (entry.task.status === "INBOX" || entry.task.status === "DOING") {
        await taskApplicationService.transition(entry.task.id, "READY");
      }
      await taskApplicationService.setReviewDate(entry.task.id, date);
      await taskApplicationService.removeFromToday(entry.task.id, localDate);
      markProcessed(entry.task.id);
      notifyTasksChanged();
      await load();
    } catch {
      setError(t("common.error"));
    }
  };

  const unfinished = view?.unfinished.filter(({ task }) => !processed.has(task.id)) ?? [];
  const canceledInClose = [
    ...(view?.canceled ?? []),
    ...canceled.filter(({ task }) => !view?.canceled.some((entry) => entry.task.id === task.id)),
  ];

  return (
    <section className="page daily-close-page" aria-labelledby="daily-close-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("dailyClose.eyebrow")}</p>
          <h1 id="daily-close-title">{t("dailyClose.title")}</h1>
          <p>{t("dailyClose.description")}</p>
        </div>
        <span className="count-pill">
          {t("dailyClose.tomorrowCount", { count: tomorrowCount, limit: focusLimit })}
        </span>
      </header>

      {error.length > 0 ? <p className="page-error">{error}</p> : null}

      <section className="daily-close-section">
        <header>
          <span>1</span>
          <div>
            <h2>{t("dailyClose.completed")}</h2>
            <p>{t("dailyClose.completedDescription")}</p>
          </div>
        </header>
        {view === undefined || view.completed.length === 0 ? (
          <p className="inline-empty">{t("dailyClose.noCompleted")}</p>
        ) : (
          <ul className="daily-close-simple-list">
            {view.completed.map(({ task }) => (
              <li key={task.id}>✓ {task.title}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="daily-close-section">
        <header>
          <span>2</span>
          <div>
            <h2>{t("dailyClose.unfinished")}</h2>
            <p>{t("dailyClose.unfinishedDescription")}</p>
          </div>
        </header>
        {unfinished.length === 0 ? (
          <p className="daily-close-done">{t("dailyClose.allProcessed")}</p>
        ) : (
          <div className="daily-close-task-list">
            {unfinished.map((entry) => (
              <article key={entry.task.id}>
                <strong>{entry.task.title}</strong>
                <span>{t(`status.${entry.task.status}`)}</span>
                <div className="card-actions">
                  <button
                    className="button button-primary button-small"
                    onClick={() => void continueTomorrow(entry)}
                  >
                    {t("dailyClose.continueTomorrow")}
                  </button>
                  <button
                    className="button button-outline button-small"
                    onClick={() => void removeToday(entry)}
                  >
                    {t("dailyClose.removeToday")}
                  </button>
                  <button
                    className="button button-quiet button-small"
                    onClick={() => void move(entry, "WAITING")}
                  >
                    {t("action.WAITING")}
                  </button>
                  <button
                    className="button button-quiet button-small"
                    onClick={() => void move(entry, "SOMEDAY")}
                  >
                    {t("action.someday")}
                  </button>
                  <button
                    className="button button-danger button-small"
                    onClick={() => void move(entry, "CANCELED")}
                  >
                    {t("action.CANCELED")}
                  </button>
                </div>
                <div className="review-date-action">
                  <input
                    aria-label={t("review.setReviewDate")}
                    min={tomorrow}
                    onChange={(event) =>
                      setReviewDates((current) => ({
                        ...current,
                        [entry.task.id]: event.target.value,
                      }))
                    }
                    type="date"
                    value={reviewDates[entry.task.id] ?? ""}
                  />
                  <button
                    className="button button-outline button-small"
                    disabled={(reviewDates[entry.task.id] ?? "").length === 0}
                    onClick={() => void snooze(entry)}
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

      <section className="daily-close-section">
        <header>
          <span>3</span>
          <div>
            <h2>{t("dailyClose.abandoned")}</h2>
            <p>{t("dailyClose.abandonedDescription")}</p>
          </div>
        </header>
        {canceledInClose.length === 0 ? (
          <p className="inline-empty">{t("dailyClose.noAbandoned")}</p>
        ) : (
          <ul className="daily-close-simple-list daily-close-canceled">
            {canceledInClose.map(({ task }) => (
              <li key={task.id}>× {task.title}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="daily-close-section">
        <header>
          <span>4</span>
          <div>
            <h2>{t("dailyClose.tomorrow", { limit: focusLimit })}</h2>
            <p>{t("dailyClose.tomorrowDescription", { limit: focusLimit })}</p>
          </div>
        </header>
        <p className="daily-close-tomorrow-note">
          {t("dailyClose.tomorrowSelected", { count: tomorrowCount })}
        </p>
      </section>

      <footer className="daily-close-footer">
        <Link className="button button-primary" to="/today">
          {unfinished.length === 0 ? t("dailyClose.finish") : t("dailyClose.saveExit")}
        </Link>
      </footer>
    </section>
  );
}
