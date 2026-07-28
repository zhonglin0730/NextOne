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
import { loadPreferences, preferencesChangedEvent } from "../settings/preferences";
import { DailyCapacity } from "./DailyCapacity";
import { getLocalDate, getTimeZone } from "./date";
import { MorningKickoff } from "./MorningKickoff";
import { ZenMode } from "./ZenMode";

const defaultDailyCapacityMinutes = 240;

function candidateRank(task: Task): number {
  return task.status === "DOING"
    ? 0
    : task.status === "READY"
      ? 1
      : task.status === "INBOX"
        ? 2
        : 3;
}

function sortKickoffCandidates(tasks: readonly Task[]): readonly Task[] {
  return [...new Map(tasks.map((task) => [task.id, task])).values()]
    .filter((task) => task.status === "INBOX" || task.status === "READY")
    .sort(
      (left, right) =>
        candidateRank(left) - candidateRank(right) ||
        (left.deadlineAt ?? "9999").localeCompare(right.deadlineAt ?? "9999") ||
        left.sortKey.localeCompare(right.sortKey),
    )
    .slice(0, 18);
}

function TodayTaskCard({
  entry,
  isCompleting,
  onComplete,
  onRemove,
  onTransition,
  variant,
}: {
  entry: TodayTask;
  isCompleting: boolean;
  onComplete: (task: Task) => void;
  onRemove: (task: Task) => void;
  onTransition: (task: Task, status: TaskStatus) => void;
  variant: "focus" | "later";
}) {
  const { t } = useTranslation();
  const { task } = entry;

  return (
    <article
      className={`today-task-card today-task-card-${variant} ${isCompleting ? "task-completing" : ""}`}
    >
      <div className="task-card-main">
        {variant === "focus" && task.status !== "INBOX" ? (
          <button
            aria-label={t("action.completeTask", { title: task.title })}
            className="task-checkbox"
            disabled={isCompleting}
            onClick={() => onComplete(task)}
            title={t("action.completeTask", { title: task.title })}
            type="button"
          >
            <span aria-hidden="true" className="checkbox-inner">
              ✓
            </span>
          </button>
        ) : null}
        <div>
          <span className={`status-badge status-${task.status.toLowerCase()}`}>
            {t(`status.${task.status}`)}
          </span>
          <h3>{task.title}</h3>
          {task.estimateMinutes === undefined ? null : (
            <p>{t("today.minutes", { count: task.estimateMinutes })}</p>
          )}
        </div>
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
        {task.status === "READY" ? (
          <button
            className="button button-primary button-small"
            onClick={() => onTransition(task, "DOING")}
            type="button"
          >
            {t("action.DOING")}
          </button>
        ) : null}
        <div className="card-actions-secondary">
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
          {variant === "later" && task.status !== "INBOX" ? (
            <button
              aria-label={t("action.completeTask", { title: task.title })}
              className="button button-quiet button-small"
              disabled={isCompleting}
              onClick={() => onComplete(task)}
              title={t("action.completeTask", { title: task.title })}
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
  const [kickoffCandidates, setKickoffCandidates] = useState<readonly Task[]>([]);
  const [kickoffOpen, setKickoffOpen] = useState(false);
  const [dailyCapacityMinutes, setDailyCapacityMinutes] = useState(defaultDailyCapacityMinutes);
  const [zenTask, setZenTask] = useState<Task>();
  const [completingIds, setCompletingIds] = useState<ReadonlySet<string>>(new Set());
  const kickoffStorageKey = `nextone.kickoff.${localDate}`;

  const load = useCallback(async () => {
    try {
      const [today, inbox, board, preferences] = await Promise.all([
        taskApplicationService.getToday(localDate),
        taskApplicationService.listInbox(),
        taskApplicationService.listBoardTasks(),
        loadPreferences(),
      ]);
      const plannedIds = new Set([...today.focus, ...today.later].map(({ task }) => task.id));
      const candidates = sortKickoffCandidates(
        [...inbox, ...board].filter((task) => !plannedIds.has(task.id)),
      );
      setView(today);
      setKickoffCandidates(candidates);
      setDailyCapacityMinutes(preferences.dailyCapacityMinutes ?? defaultDailyCapacityMinutes);
      if (
        today.focus.length === 0 &&
        candidates.length > 0 &&
        localStorage.getItem(kickoffStorageKey) === null
      ) {
        setKickoffOpen(true);
      }
      setError("");
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [kickoffStorageKey, localDate, t]);

  useEffect(() => {
    void load();
    window.addEventListener(tasksChangedEvent, load);
    window.addEventListener(preferencesChangedEvent, load);
    return () => {
      window.removeEventListener(tasksChangedEvent, load);
      window.removeEventListener(preferencesChangedEvent, load);
    };
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

  const handleComplete = async (task: Task) => {
    if (completingIds.has(task.id)) return;
    setCompletingIds((current) => new Set([...current, task.id]));
    try {
      await taskApplicationService.transition(task.id, "COMPLETED");
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        notifyTasksChanged();
        setCompletingIds((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
      } else {
        setTimeout(() => {
          notifyTasksChanged();
          setCompletingIds((current) => {
            const next = new Set(current);
            next.delete(task.id);
            return next;
          });
        }, 320);
      }
    } catch {
      setCompletingIds((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
      setError(t("common.error"));
    }
  };

  const dismissKickoff = useCallback(() => {
    localStorage.setItem(kickoffStorageKey, "later");
    setKickoffOpen(false);
  }, [kickoffStorageKey]);

  const startDay = async (tasks: readonly Task[]) => {
    try {
      for (const task of tasks) {
        const actionableTask =
          task.status === "INBOX"
            ? await taskApplicationService.transition(task.id, "READY")
            : task;
        await taskApplicationService.addToToday(
          actionableTask.id,
          localDate,
          getTimeZone(),
          "FOCUS",
        );
      }
      localStorage.setItem(kickoffStorageKey, "started");
      setKickoffOpen(false);
      notifyTasksChanged();
      await load();
    } catch {
      setError(t("common.error"));
    }
  };

  const capacityTasks = useMemo(
    () => [
      ...view.focus.map(({ task }) => task),
      ...view.later.map(({ task }) => task),
      ...view.doing,
    ],
    [view.doing, view.focus, view.later],
  );

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
              <div className="section-empty-actions">
                {kickoffCandidates.length > 0 ? (
                  <button
                    className="button button-primary"
                    onClick={() => setKickoffOpen(true)}
                    type="button"
                  >
                    {t("kickoff.open")}
                  </button>
                ) : null}
                <Link className="button button-outline" to="/board">
                  {t("today.openBoard")}
                </Link>
              </div>
            </div>
          ) : (
            <div className="today-task-list">
              {view.focus.map((entry) => (
                <TodayTaskCard
                  entry={entry}
                  isCompleting={completingIds.has(entry.task.id)}
                  key={entry.item.id}
                  onComplete={(task) => void handleComplete(task)}
                  onRemove={(task) => void remove(task)}
                  onTransition={(task, status) => void transition(task, status)}
                  variant="focus"
                />
              ))}
            </div>
          )}
          <DailyCapacity capacityMinutes={dailyCapacityMinutes} tasks={capacityTasks} />
        </section>

        <section className="today-section today-doing" aria-labelledby="doing-title">
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
                <article
                  className={`doing-row ${completingIds.has(task.id) ? "task-completing" : ""}`}
                  key={task.id}
                >
                  <button
                    aria-label={t("action.completeTask", { title: task.title })}
                    className="task-checkbox"
                    disabled={completingIds.has(task.id)}
                    onClick={() => void handleComplete(task)}
                    title={t("action.completeTask", { title: task.title })}
                    type="button"
                  >
                    <span aria-hidden="true" className="checkbox-inner">
                      ✓
                    </span>
                  </button>
                  <span aria-hidden="true" className="doing-indicator" />
                  <strong>{task.title}</strong>
                  <div className="card-actions">
                    <button
                      className="button button-quiet button-small"
                      onClick={() => setZenTask(task)}
                      type="button"
                    >
                      {t("zen.open")}
                    </button>
                    <div className="card-actions-secondary">
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
                    </div>
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
                  isCompleting={completingIds.has(entry.task.id)}
                  key={entry.item.id}
                  onComplete={(task) => void handleComplete(task)}
                  onRemove={(task) => void remove(task)}
                  onTransition={(task, status) => void transition(task, status)}
                  variant="later"
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {kickoffOpen ? (
        <MorningKickoff
          candidates={kickoffCandidates}
          capacityMinutes={dailyCapacityMinutes}
          onDismiss={dismissKickoff}
          onStart={startDay}
        />
      ) : null}
      {zenTask === undefined ? null : (
        <ZenMode
          onClose={() => setZenTask(undefined)}
          onTransition={(status) => transition(zenTask, status)}
          task={zenTask}
        />
      )}
    </section>
  );
}
