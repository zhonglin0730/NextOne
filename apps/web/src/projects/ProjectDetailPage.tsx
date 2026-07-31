import type { ProjectDetail } from "@nextone/application";
import type { Task, TaskStatus } from "@nextone/domain";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { ActionToast } from "../components/ActionToast";
import { transitionWithWipConfirmation } from "../tasks/taskActions";
import { TaskDrawer } from "../tasks/TaskDrawer";
import {
  notifyTasksChanged,
  projectApplicationService,
  taskApplicationService,
  tasksChangedEvent,
} from "../tasks/taskService";
import { getDateOnly, getLocalDate, getTimeZone, getWeekStartsAt } from "../today/date";
import { ProjectProgress } from "./ProjectProgress";

interface ProjectTaskRowProps {
  busy?: boolean;
  task: Task;
  onContinue?: (task: Task) => void;
  onOpen: (task: Task) => void;
  onReady?: (task: Task) => void;
}

function ProjectTaskRow({ busy = false, task, onContinue, onOpen, onReady }: ProjectTaskRowProps) {
  const { t } = useTranslation();
  const waitingDetailsMissing =
    task.status === "WAITING" && (task.waitingFor === undefined || task.reviewAt === undefined);

  return (
    <div className="project-task-row">
      <button onClick={() => onOpen(task)} type="button">
        <strong>{task.title}</strong>
        <span>{t(`status.${task.status}`)}</span>
        {task.status === "WAITING" ? (
          <small
            className={
              waitingDetailsMissing ? "waiting-detail waiting-detail-missing" : "waiting-detail"
            }
          >
            {task.waitingFor === undefined
              ? t("task.waitingDetailsMissing")
              : t("task.waitingForSummary", { value: task.waitingFor })}
            {task.reviewAt === undefined
              ? null
              : ` · ${t("task.followUpSummary", { date: getDateOnly(task.reviewAt) })}`}
          </small>
        ) : null}
      </button>
      {task.status === "WAITING" && onContinue !== undefined && onReady !== undefined ? (
        <div className="project-task-row-actions">
          <button
            className="button button-quiet button-small"
            disabled={busy}
            onClick={() => onOpen(task)}
            type="button"
          >
            {waitingDetailsMissing ? t("task.setFollowUp") : t("task.editFollowUp")}
          </button>
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
  const candidateSubmittingRef = useRef(false);

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
      setTodayTaskIds(new Set(today.planned.map(({ task }) => task.id)));
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

  const addToday = async (task: Task) => {
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
    if (
      projectId === undefined ||
      candidateTitle.trim().length === 0 ||
      candidateSubmittingRef.current
    ) {
      return;
    }

    candidateSubmittingRef.current = true;
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
      candidateSubmittingRef.current = false;
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
  const doingTasks = overview.doingTasks;
  const nextReadyTask = overview.nextReadyTask;
  const visibleCandidates = detail.nextCandidates;

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
          <Link className="button button-primary" to={`/projects/${overview.project.id}/structure`}>
            {t("project.structureView")}
          </Link>
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
          <section className="project-detail-section project-focus-section">
            <header>
              <div>
                <p className="eyebrow">{t("project.executionEyebrow")}</p>
                <h2>{t("project.doingTitle", { count: doingTasks.length })}</h2>
                <p className="project-focus-guidance">{t("project.doingGuidance")}</p>
              </div>
              <span className="count-pill">{doingTasks.length}</span>
            </header>

            {doingTasks.length === 0 ? (
              <p className="inline-empty">{t("project.noDoing")}</p>
            ) : (
              <div className="project-active-task-list">
                {doingTasks.map((task) => (
                  <div className="project-focus-active" key={task.id}>
                    <button onClick={() => setSelectedTask(task)} type="button">
                      <strong>{task.title}</strong>
                      <span>{t(`status.${task.status}`)}</span>
                    </button>
                    <div className="card-actions">
                      <button
                        className="button button-primary button-small"
                        disabled={busyTaskId === task.id}
                        onClick={() => void transition(task, "COMPLETED")}
                        type="button"
                      >
                        {t("action.COMPLETED")}
                      </button>
                      <button
                        className="button button-outline button-small"
                        disabled={todayTaskIds.has(task.id) || addingTodayTaskId === task.id}
                        onClick={() => void addToday(task)}
                        type="button"
                      >
                        {addingTodayTaskId === task.id
                          ? t("project.addingToday")
                          : todayTaskIds.has(task.id)
                            ? t("project.addedToday")
                            : t("project.addToday")}
                      </button>
                      <button
                        className="button button-outline button-small"
                        disabled={busyTaskId === task.id}
                        onClick={() => void transition(task, "READY")}
                        type="button"
                      >
                        {t("action.pause")}
                      </button>
                      <button
                        className="button button-outline button-small"
                        disabled={busyTaskId === task.id}
                        onClick={() => void transition(task, "WAITING")}
                        type="button"
                      >
                        {t("action.WAITING")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="project-detail-section project-next-ready-section">
            <header>
              <div>
                <p className="eyebrow">{t("project.nextReadyEyebrow")}</p>
                <h2>{t("project.nextReadyTitle")}</h2>
                <p>{t("project.nextReadyDescription")}</p>
              </div>
            </header>

            {nextReadyTask === undefined ? (
              <p className="inline-empty">{t("project.noNextReady")}</p>
            ) : (
              <div className="project-focus-active">
                <button onClick={() => setSelectedTask(nextReadyTask)} type="button">
                  <strong>{nextReadyTask.title}</strong>
                  <span>{t(`status.${nextReadyTask.status}`)}</span>
                </button>
                <div className="card-actions">
                  <button
                    className="button button-primary button-small"
                    disabled={busyTaskId === nextReadyTask.id}
                    onClick={() => void transition(nextReadyTask, "DOING")}
                    type="button"
                  >
                    {t("action.DOING")}
                  </button>
                  <button
                    className="button button-outline button-small"
                    disabled={
                      todayTaskIds.has(nextReadyTask.id) || addingTodayTaskId === nextReadyTask.id
                    }
                    onClick={() => void addToday(nextReadyTask)}
                    type="button"
                  >
                    {addingTodayTaskId === nextReadyTask.id
                      ? t("project.addingToday")
                      : todayTaskIds.has(nextReadyTask.id)
                        ? t("project.addedToday")
                        : t("project.addToday")}
                  </button>
                  <button
                    className="button button-outline button-small"
                    disabled={busyTaskId === nextReadyTask.id}
                    onClick={() => void transition(nextReadyTask, "WAITING")}
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
                <h2>{t("project.nextCandidates")}</h2>
              </div>
              <span className="count-pill">{visibleCandidates.length}</span>
            </header>

            {visibleCandidates.length === 0 ? (
              <p className="inline-empty">{t("project.noCandidates")}</p>
            ) : (
              <div className="project-task-list">
                {visibleCandidates.map((task) => (
                  <ProjectTaskRow
                    busy={busyTaskId === task.id}
                    key={task.id}
                    onOpen={setSelectedTask}
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
