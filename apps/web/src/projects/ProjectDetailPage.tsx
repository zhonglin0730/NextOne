import type { ProjectDetail } from "@nextone/application";
import type { Task, TaskStatus } from "@nextone/domain";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useParams } from "react-router";

import { ActionToast } from "../components/ActionToast";
import { transitionWithWipConfirmation } from "../tasks/taskActions";
import { TaskDrawer } from "../tasks/TaskDrawer";
import {
  notifyTasksChanged,
  projectApplicationService,
  taskApplicationService,
  tasksChangedEvent,
} from "../tasks/taskService";
import { getLocalDate, getTimeZone, getWeekStartsAt } from "../today/date";
import { ProjectProgress } from "./ProjectProgress";

interface ProjectTaskRowProps {
  busy?: boolean;
  focusActionLabel?: string;
  task: Task;
  focusAction?: boolean;
  onContinue?: (task: Task) => void;
  onOpen: (task: Task) => void;
  onReady?: (task: Task) => void;
  onSetFocus: (task: Task) => void;
}

function ProjectTaskRow({
  busy = false,
  focusActionLabel,
  task,
  focusAction = false,
  onContinue,
  onOpen,
  onReady,
  onSetFocus,
}: ProjectTaskRowProps) {
  const { t } = useTranslation();

  return (
    <div className="project-task-row">
      <button onClick={() => onOpen(task)} type="button">
        <strong>{task.title}</strong>
        <span>{t(`status.${task.status}`)}</span>
      </button>
      {focusAction ? (
        <button
          aria-label={t("project.focusTaskAction", {
            action: focusActionLabel ?? t("project.setFocus"),
            title: task.title,
          })}
          className="button button-outline button-small"
          disabled={busy}
          onClick={() => onSetFocus(task)}
          type="button"
        >
          {focusActionLabel ?? t("project.setFocus")}
        </button>
      ) : null}
      {task.status === "WAITING" && onContinue !== undefined && onReady !== undefined ? (
        <div className="project-task-row-actions">
          <button
            className="button button-primary button-small"
            disabled={busy}
            onClick={() => onContinue(task)}
            type="button"
          >
            {t("board.resumeDoing")}
          </button>
          <button
            className="button button-outline button-small"
            disabled={busy}
            onClick={() => onReady(task)}
            type="button"
          >
            {t("action.READY")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ProjectDetailPage() {
  const { i18n, t } = useTranslation();
  const location = useLocation();
  const { projectId } = useParams();
  const weekStartsAt = useMemo(() => getWeekStartsAt(), []);
  const localDate = useMemo(() => getLocalDate(), []);
  const [detail, setDetail] = useState<ProjectDetail | undefined>();
  const [selectedTask, setSelectedTask] = useState<Task | undefined>();
  const [todayTaskIds, setTodayTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [addingTodayTaskId, setAddingTodayTaskId] = useState<string>();
  const [candidateTitle, setCandidateTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string>();
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    if (projectId === undefined) {
      return;
    }

    try {
      const [nextDetail, today] = await Promise.all([
        projectApplicationService.getDetail(projectId, weekStartsAt),
        taskApplicationService.getToday(localDate),
      ]);
      setDetail(nextDetail);
      setTodayTaskIds(new Set([...today.focus, ...today.later].map(({ task }) => task.id)));
      setError("");
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [localDate, projectId, t, weekStartsAt]);

  useEffect(() => {
    void load();
    window.addEventListener(tasksChangedEvent, load);
    return () => window.removeEventListener(tasksChangedEvent, load);
  }, [load]);

  useEffect(() => {
    if (!loading && detail !== undefined && location.hash === "#project-focus") {
      window.requestAnimationFrame(() => {
        document.getElementById("project-focus")?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start",
        });
      });
    }
  }, [detail, loading, location.hash]);

  const setFocus = async (task: Task) => {
    if (projectId === undefined) {
      return;
    }

    const currentFocus = detail?.overview.focusTask;
    if (
      currentFocus !== undefined &&
      currentFocus.id !== task.id &&
      !window.confirm(
        t("project.replaceFocusConfirm", {
          current: currentFocus.title,
          next: task.title,
        }),
      )
    ) {
      return;
    }

    setBusyTaskId(task.id);
    try {
      await projectApplicationService.setFocusTask(projectId, task.id);
      setFeedback(
        currentFocus === undefined
          ? t("project.feedback.focusSet", { title: task.title })
          : t("project.feedback.focusReplaced", {
              current: currentFocus.title,
              next: task.title,
            }),
      );
      notifyTasksChanged();
    } catch {
      setError(t("common.error"));
    } finally {
      setBusyTaskId(undefined);
    }
  };

  const transition = async (task: Task, status: TaskStatus): Promise<Task | undefined> => {
    setBusyTaskId(task.id);
    try {
      const updated = await transitionWithWipConfirmation(task.id, status, (limit) =>
        window.confirm(`${t("wip.title", { limit })}\n\n${t("wip.confirm")}`),
      );
      if (updated !== undefined) {
        const feedbackKey =
          status === "DOING"
            ? "project.feedback.started"
            : status === "READY"
              ? "project.feedback.ready"
              : status === "WAITING"
                ? "project.feedback.waiting"
                : "project.feedback.completed";
        setFeedback(t(feedbackKey, { title: task.title }));
      }
      return updated;
    } catch {
      setError(t("common.error"));
      return undefined;
    } finally {
      setBusyTaskId(undefined);
    }
  };

  const addFocusToday = async (task: Task) => {
    if (todayTaskIds.has(task.id) || addingTodayTaskId !== undefined) {
      return;
    }

    setAddingTodayTaskId(task.id);
    try {
      await taskApplicationService.addToToday(task.id, getLocalDate(), getTimeZone());
      setTodayTaskIds((current) => new Set(current).add(task.id));
      setFeedback(t("project.feedback.addedToday", { title: task.title }));
      notifyTasksChanged();
    } catch {
      setError(t("common.error"));
    } finally {
      setAddingTodayTaskId(undefined);
    }
  };

  const addCandidate = async (event: FormEvent) => {
    event.preventDefault();
    if (projectId === undefined || candidateTitle.trim().length === 0 || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const task = await taskApplicationService.capture({
        title: candidateTitle,
        projectId,
      });
      await taskApplicationService.transition(task.id, "READY");
      setCandidateTitle("");
      notifyTasksChanged();
    } catch {
      setError(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  if (loading) {
    return (
      <section className="page">
        <div className="task-list-skeleton" />
      </section>
    );
  }

  if (detail === undefined) {
    return (
      <section className="page empty-state">
        <h1>{t("project.notFound")}</h1>
        <Link className="button button-outline" to="/projects">
          {t("project.back")}
        </Link>
      </section>
    );
  }

  const { overview } = detail;
  const recommended = overview.focusTask === undefined ? detail.nextCandidates[0] : undefined;
  const visibleCandidates =
    recommended === undefined
      ? detail.nextCandidates
      : detail.nextCandidates.filter((task) => task.id !== recommended.id);

  return (
    <section className="page project-detail-page" aria-labelledby="project-detail-title">
      <Link className="project-back-link" to="/projects">
        ← {t("project.back")}
      </Link>

      <header className="project-detail-header">
        <div>
          <p className="eyebrow">{t("project.eyebrow")}</p>
          <h1 id="project-detail-title">{overview.project.name}</h1>
          <div className="project-outcome">
            <span>{t("project.outcomeLabel")}</span>
            <p>{overview.project.note ?? t("project.outcomeEmpty")}</p>
          </div>
        </div>
        <div className="project-detail-header-actions">
          <span
            className={`project-health ${
              overview.needsFocusDecision ? "project-health-decision" : "project-health-active"
            }`}
          >
            {overview.needsFocusDecision ? t("project.needsDecision") : t("project.active")}
          </span>
          <Link className="button button-outline" to={`/projects/${overview.project.id}/board`}>
            {t("project.boardView")}
          </Link>
        </div>
      </header>

      {error.length > 0 ? <p className="page-error">{error}</p> : null}
      <ActionToast message={feedback} onDismiss={() => setFeedback("")} />

      <ProjectProgress progress={overview.progress} />

      <div className="project-detail-layout">
        <div className="project-detail-main">
          <section className="project-detail-section project-focus-section" id="project-focus">
            <header>
              <div>
                <p className="eyebrow">{t("project.currentFocus")}</p>
                <h2>{t("project.nextStepTitle")}</h2>
                <p className="project-focus-guidance">{t("project.singleFocusDescription")}</p>
              </div>
              {overview.focusTask === undefined ? (
                <span className="project-health project-health-decision">
                  {t("project.needsDecision")}
                </span>
              ) : null}
            </header>

            {overview.focusTask === undefined ? (
              recommended === undefined ? (
                <div className="project-focus-empty">
                  <strong>{t("project.noFocus")}</strong>
                  <p>{t("project.noCandidateDescription")}</p>
                </div>
              ) : (
                <div className="project-recommendation">
                  <span>{t("project.recommendedNext")}</span>
                  <button onClick={() => setSelectedTask(recommended)} type="button">
                    {recommended.title}
                  </button>
                  <button
                    aria-label={t("project.focusTaskAction", {
                      action: t("project.makeFocus"),
                      title: recommended.title,
                    })}
                    className="button button-primary button-small"
                    disabled={busyTaskId === recommended.id}
                    onClick={() => void setFocus(recommended)}
                    type="button"
                  >
                    {busyTaskId === recommended.id
                      ? t("project.settingFocus")
                      : t("project.makeFocus")}
                  </button>
                </div>
              )
            ) : (
              <div className="project-focus-active">
                <button onClick={() => setSelectedTask(overview.focusTask)} type="button">
                  <strong>{overview.focusTask.title}</strong>
                  <span>{t(`status.${overview.focusTask.status}`)}</span>
                </button>
                <div className="card-actions">
                  {overview.focusTask.status === "READY" ? (
                    <button
                      className="button button-primary button-small"
                      disabled={busyTaskId === overview.focusTask.id}
                      onClick={() => void transition(overview.focusTask!, "DOING")}
                      type="button"
                    >
                      {t("action.DOING")}
                    </button>
                  ) : null}
                  {overview.focusTask.status === "DOING" ? (
                    <button
                      className="button button-primary button-small"
                      disabled={busyTaskId === overview.focusTask.id}
                      onClick={() => void transition(overview.focusTask!, "COMPLETED")}
                      type="button"
                    >
                      {t("action.COMPLETED")}
                    </button>
                  ) : null}
                  {overview.focusTask.status === "DOING" ? (
                    <button
                      className="button button-outline button-small"
                      disabled={busyTaskId === overview.focusTask.id}
                      onClick={() => void transition(overview.focusTask!, "READY")}
                      type="button"
                    >
                      {t("action.pause")}
                    </button>
                  ) : null}
                  {overview.focusTask.status === "READY" ? (
                    <button
                      className="button button-outline button-small"
                      disabled={
                        todayTaskIds.has(overview.focusTask.id) ||
                        addingTodayTaskId === overview.focusTask.id
                      }
                      onClick={() => void addFocusToday(overview.focusTask!)}
                      type="button"
                    >
                      {addingTodayTaskId === overview.focusTask.id
                        ? t("project.addingToday")
                        : todayTaskIds.has(overview.focusTask.id)
                          ? t("project.addedToday")
                          : t("project.addToday")}
                    </button>
                  ) : null}
                  <button
                    className="button button-outline button-small"
                    disabled={busyTaskId === overview.focusTask.id}
                    onClick={() => void transition(overview.focusTask!, "WAITING")}
                    type="button"
                  >
                    {t("action.WAITING")}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="project-detail-section">
            <header>
              <div>
                <p className="eyebrow">{t("project.candidateCount")}</p>
                <h2>
                  {recommended === undefined
                    ? t("project.nextCandidates")
                    : t("project.otherCandidates")}
                </h2>
              </div>
              <span className="count-pill">{visibleCandidates.length}</span>
            </header>

            {visibleCandidates.length === 0 ? (
              <p className="inline-empty">
                {recommended === undefined
                  ? t("project.noCandidates")
                  : t("project.noOtherCandidates")}
              </p>
            ) : (
              <div className="project-task-list">
                {visibleCandidates.map((task) => (
                  <ProjectTaskRow
                    busy={busyTaskId === task.id}
                    focusAction={overview.focusTask?.id !== task.id}
                    focusActionLabel={
                      overview.focusTask === undefined
                        ? t("project.setFocus")
                        : t("project.replaceFocus")
                    }
                    key={task.id}
                    onOpen={setSelectedTask}
                    onSetFocus={(candidate) => void setFocus(candidate)}
                    task={task}
                  />
                ))}
              </div>
            )}

            <form className="project-candidate-form" onSubmit={addCandidate}>
              <input
                aria-label={t("project.candidatePlaceholder")}
                onChange={(event) => setCandidateTitle(event.target.value)}
                placeholder={t("project.candidatePlaceholder")}
                value={candidateTitle}
              />
              <button
                className="button button-outline"
                disabled={candidateTitle.trim().length === 0 || submitting}
                type="submit"
              >
                {t("project.addCandidate")}
              </button>
            </form>
          </section>

          {detail.doing.length > 0 ? (
            <section className="project-detail-section">
              <header>
                <h2>{t("project.doing")}</h2>
                <span className="count-pill">{detail.doing.length}</span>
              </header>
              <div className="project-task-list">
                {detail.doing.map((task) => (
                  <ProjectTaskRow
                    busy={busyTaskId === task.id}
                    focusAction
                    focusActionLabel={
                      overview.focusTask === undefined
                        ? t("project.setFocus")
                        : t("project.replaceFocus")
                    }
                    key={task.id}
                    onOpen={setSelectedTask}
                    onSetFocus={(candidate) => void setFocus(candidate)}
                    task={task}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {detail.waiting.length > 0 ? (
            <section className="project-detail-section">
              <header>
                <h2>{t("project.waiting")}</h2>
                <span className="count-pill">{detail.waiting.length}</span>
              </header>
              <div className="project-task-list">
                {detail.waiting.map((task) => (
                  <ProjectTaskRow
                    busy={busyTaskId === task.id}
                    key={task.id}
                    onContinue={(waitingTask) => void transition(waitingTask, "DOING")}
                    onOpen={setSelectedTask}
                    onReady={(waitingTask) => void transition(waitingTask, "READY")}
                    onSetFocus={(candidate) => void setFocus(candidate)}
                    task={task}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="project-detail-aside">
          <section className="project-summary-card">
            <h2>{t("project.summary")}</h2>
            <dl className="project-summary-list">
              <div>
                <dt>{t("project.completedThisWeek")}</dt>
                <dd>{overview.completedThisWeek}</dd>
              </div>
              <div>
                <dt>{t("project.waitingCount")}</dt>
                <dd>{overview.waitingCount}</dd>
              </div>
              <div>
                <dt>{t("project.candidateCount")}</dt>
                <dd>{overview.nextCandidateCount}</dd>
              </div>
            </dl>
          </section>

          <section className="project-summary-card">
            <h2>{t("project.recentActivity")}</h2>
            {detail.recentActivity.length === 0 ? (
              <p className="muted">{t("project.noProgress")}</p>
            ) : (
              <ol className="project-activity-list">
                {detail.recentActivity.map(({ event, task }) => (
                  <li key={event.id}>
                    <span className="activity-dot" aria-hidden="true" />
                    <div>
                      <strong>{task.title}</strong>
                      <span>{t(`event.${event.type}`)}</span>
                      <time dateTime={event.occurredAt}>
                        {formatter.format(new Date(event.occurredAt))}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {detail.recentlyCompleted.length > 0 ? (
            <section className="project-summary-card">
              <h2>{t("project.recentlyCompleted")}</h2>
              <ul className="project-completed-list">
                {detail.recentlyCompleted.map((task) => (
                  <li key={task.id}>✓ {task.title}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      {selectedTask === undefined ? null : (
        <TaskDrawer
          onClose={() => setSelectedTask(undefined)}
          onTaskChanged={(task) => {
            setSelectedTask(task);
          }}
          task={selectedTask}
        />
      )}
    </section>
  );
}
