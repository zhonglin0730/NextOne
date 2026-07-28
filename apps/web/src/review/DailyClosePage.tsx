import type { DailyCloseView, TodayTask } from "@nextone/application";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import {
  notifyTasksChanged,
  reviewApplicationService,
  taskApplicationService,
} from "../tasks/taskService";
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
  const [processed, setProcessed] = useState<ReadonlySet<string>>(new Set());
  const [canceled, setCanceled] = useState<readonly TodayTask[]>([]);
  const [reviewDates, setReviewDates] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [close, tomorrowView] = await Promise.all([
        reviewApplicationService.getDailyClose(localDate),
        taskApplicationService.getToday(tomorrow),
      ]);
      setView(close);
      setTomorrowCount(tomorrowView.focus.length);
      setProcessed(
        (current) =>
          new Set([
            ...current,
            ...tomorrowView.focus.map(({ task }) => task.id),
            ...tomorrowView.later.map(({ task }) => task.id),
          ]),
      );
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

  const continueTomorrow = async (entry: TodayTask) => {
    try {
      const section = tomorrowCount < 3 ? "FOCUS" : "LATER";
      const actionableTask =
        entry.task.status === "INBOX"
          ? await taskApplicationService.transition(entry.task.id, "READY")
          : entry.task;
      await taskApplicationService.addToToday(actionableTask.id, tomorrow, getTimeZone(), section);
      if (section === "FOCUS") {
        setTomorrowCount((count) => count + 1);
      }
      markProcessed(entry.task.id);
      notifyTasksChanged();
    } catch {
      setError(t("common.error"));
    }
  };

  const removeToday = async (entry: TodayTask) => {
    try {
      await taskApplicationService.removeFromToday(entry.task.id, localDate);
      markProcessed(entry.task.id);
      notifyTasksChanged();
      await load();
    } catch {
      setError(t("common.error"));
    }
  };

  const move = async (entry: TodayTask, action: "WAITING" | "SOMEDAY" | "CANCELED") => {
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

  const snooze = async (entry: TodayTask) => {
    const date = reviewDates[entry.task.id];
    if (date === undefined || date.length === 0) {
      return;
    }
    try {
      await taskApplicationService.setReviewDate(entry.task.id, date);
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
          {t("dailyClose.tomorrowCount", { count: tomorrowCount })}
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
            <h2>{t("dailyClose.tomorrow")}</h2>
            <p>{t("dailyClose.tomorrowDescription")}</p>
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
