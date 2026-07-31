import type { TodayView } from "@nextone/application";
import type { Task } from "@nextone/domain";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { ActionToast } from "../components/ActionToast";
import { TaskDrawer } from "../tasks/TaskDrawer";
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
import { getTodayTransitionFeedbackKey, type TodayTransitionStatus } from "./transitionFeedback";
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
    .filter(
      (task) =>
        task.status === "INBOX" || task.status === "READY" || task.status === "DOING",
    )
    .sort(
      (left, right) =>
        candidateRank(left) - candidateRank(right) ||
        (left.deadlineAt ?? "9999").localeCompare(right.deadlineAt ?? "9999") ||
        left.sortKey.localeCompare(right.sortKey),
    )
    .slice(0, 18);
}

interface TodayCommitment {
  task: Task;
}

function TodayTaskCard({
  commitment,
  isCompleting,
  onComplete,
  onOpen,
  onRemove,
  onTransition,
  onZen,
}: {
  commitment: TodayCommitment;
  isCompleting: boolean;
  onComplete: (task: Task) => void;
  onOpen: (task: Task) => void;
  onRemove: (task: Task) => void;
  onTransition: (task: Task, status: TodayTransitionStatus) => void;
  onZen: (task: Task) => void;
}) {
  const { t } = useTranslation();
  const { task } = commitment;

  return (
    <article
      className={`today-task-card today-task-card-focus ${task.status === "DOING" ? "today-task-card-doing" : ""} ${isCompleting ? "task-completing" : ""}`}
    >
      <div className="task-card-main">
        {task.status !== "INBOX" ? (
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
          <h3>
            <button className="today-task-title" onClick={() => onOpen(task)} type="button">
              {task.title}
            </button>
          </h3>
          {task.estimateMinutes === undefined ? null : (
            <p className="task-meta">
              {t("today.minutes", { count: task.estimateMinutes })}
            </p>
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
        {task.status === "DOING" ? (
          <button
            className="button button-primary button-small"
            onClick={() => onZen(task)}
            type="button"
          >
            {t("zen.open")}
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
    planned: [],
    focus: [],
    later: [],
    doing: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [kickoffCandidates, setKickoffCandidates] = useState<readonly Task[]>([]);
  const [kickoffOpen, setKickoffOpen] = useState(false);
  const [dailyCapacityMinutes, setDailyCapacityMinutes] = useState(defaultDailyCapacityMinutes);
  const [focusLimit, setFocusLimit] = useState(3);
  const [wipLimit, setWipLimit] = useState(3);
  const [zenTask, setZenTask] = useState<Task>();
  const [selectedTask, setSelectedTask] = useState<Task>();
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
      const plannedIds = new Set(today.planned.map(({ task }) => task.id));
      const candidates = sortKickoffCandidates(
        [...inbox, ...board].filter((task) => !plannedIds.has(task.id)),
      );
      setView(today);
      setKickoffCandidates(candidates);
      setDailyCapacityMinutes(preferences.dailyCapacityMinutes ?? defaultDailyCapacityMinutes);
      setFocusLimit(preferences.focusLimit);
      setWipLimit(preferences.wipLimit);
      if (
        today.planned.length === 0 &&
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

  const transition = async (task: Task, status: TodayTransitionStatus): Promise<boolean> => {
    try {
      const updated =
        status === "READY" && task.status === "DOING"
          ? await taskApplicationService.pauseAndKeepToday(task.id, localDate, getTimeZone())
          : await transitionWithWipConfirmation(task.id, status, confirmOverride);
      if (status === "READY" && task.status === "DOING") {
        notifyTasksChanged();
      }
      if (updated !== undefined) {
        setFeedback(t(getTodayTransitionFeedbackKey(status), { title: task.title }));
        return true;
      }
      return false;
    } catch {
      setError(t("common.error"));
      return false;
    }
  };

  const remove = async (task: Task) => {
    try {
      await taskApplicationService.removeFromToday(task.id, localDate);
      notifyTasksChanged();
      setFeedback(t("today.feedback.removed", { title: task.title }));
    } catch {
      setError(t("common.error"));
    }
  };

  const handleComplete = async (task: Task) => {
    if (completingIds.has(task.id)) return;
    setCompletingIds((current) => new Set([...current, task.id]));
    try {
      await taskApplicationService.transition(task.id, "COMPLETED");
      setFeedback(t("today.feedback.completed", { title: task.title }));
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
    } catch {
      setError(t("common.error"));
    }
  };

  const commitments = useMemo<readonly TodayCommitment[]>(() => {
    return view.planned.map(({ task }) => ({ task }));
  }, [view.planned]);
  const doingCommitmentCount = commitments.filter(
    ({ task }) => task.status === "DOING",
  ).length;
  const capacityTasks = useMemo(
    () => commitments.map(({ task }) => task),
    [commitments],
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
      <ActionToast message={feedback} onDismiss={() => setFeedback("")} />

      <DailyCapacity capacityMinutes={dailyCapacityMinutes} tasks={capacityTasks} />

      <div className="today-grid">
        <section className="today-section today-planned" aria-labelledby="commitments-title">
          <header className="section-heading">
            <div>
              <h2 id="commitments-title">{t("today.commitments")}</h2>
              <p>{t("today.commitmentsDescription")}</p>
            </div>
            <span
              className="count-pill"
              title={t("today.doingCount", { count: doingCommitmentCount, limit: wipLimit })}
            >
              {commitments.length}
            </span>
          </header>
          {loading ? (
            <div className="mini-skeleton" />
          ) : commitments.length === 0 ? (
            <div className="section-empty">
              <strong>{t("today.emptyPlanned")}</strong>
              <p>{t("today.emptyPlannedDescription")}</p>
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
                  {t("today.openBoardForToday")}
                </Link>
              </div>
            </div>
          ) : (
            <div className="today-task-list">
              {commitments.map((commitment) => (
                <TodayTaskCard
                  commitment={commitment}
                  isCompleting={completingIds.has(commitment.task.id)}
                  key={commitment.task.id}
                  onComplete={(task) => void handleComplete(task)}
                  onOpen={setSelectedTask}
                  onRemove={(task) => void remove(task)}
                  onTransition={(task, status) => void transition(task, status)}
                  onZen={setZenTask}
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
          focusLimit={focusLimit}
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
      {selectedTask === undefined ? null : (
        <TaskDrawer
          onClose={() => setSelectedTask(undefined)}
          onTaskChanged={setSelectedTask}
          task={selectedTask}
        />
      )}
    </section>
  );
}
