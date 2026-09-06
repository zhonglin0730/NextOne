import { WipLimitExceededError, type BoardColumn } from "@nextone/application";
import type { Project, Task, TaskStatus } from "@nextone/domain";
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { ActionToast } from "../components/ActionToast";
import { loadActionRules, preferencesChangedEvent } from "../settings/preferences";
import { TaskDrawer } from "../tasks/TaskDrawer";
import { transitionWithWipConfirmation } from "../tasks/taskActions";
import {
  notifyTasksChanged,
  projectApplicationService,
  taskApplicationService,
  tasksChangedEvent,
} from "../tasks/taskService";
import { getDateOnly, getLocalDate, getTimeZone } from "../today/date";
import { ProjectViewNav } from "../projects/ProjectViewNav";
import { ResumeNote } from "../tasks/ResumeNote";
import { requestResumeNote } from "../tasks/ResumeNoteDialog";

type VisibleBoardColumn = Exclude<BoardColumn, "SOMEDAY"> | "COMPLETED";

const columns: readonly VisibleBoardColumn[] = ["READY", "DOING", "WAITING", "COMPLETED"];
const projectColumns: readonly VisibleBoardColumn[] = ["DOING", "READY", "WAITING"];

export function BoardPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [project, setProject] = useState<Project>();
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const [projectNames, setProjectNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [selectedTask, setSelectedTask] = useState<Task | undefined>();
  const [drawerTask, setDrawerTask] = useState<Task | undefined>();
  const [drawerTaskAction, setDrawerTaskAction] = useState<"WAITING">();
  const [todayTaskIds, setTodayTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [wipLimit, setWipLimit] = useState(3);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState<string>();
  const [dragOverColumn, setDragOverColumn] = useState<VisibleBoardColumn>();
  const localDate = useMemo(() => getLocalDate(), []);

  const load = useCallback(async () => {
    try {
      const [boardTasks, today, projects, rules] = await Promise.all([
        taskApplicationService.listBoardTasks(),
        taskApplicationService.getToday(localDate),
        projectApplicationService.listProjects(),
        loadActionRules(),
      ]);
      setTasks(boardTasks);
      setProject(projects.find((candidate) => candidate.id === projectId));
      setSelectedTask((current) => {
        if (projectId === undefined) {
          return undefined;
        }

        const projectTasks = boardTasks.filter((task) => task.projectId === projectId);
        const currentTask = projectTasks.find((task) => task.id === current?.id);
        return (
          currentTask ??
          projectTasks.find((task) => task.visibility === "ACTIVE" && task.status === "DOING") ??
          projectTasks.find((task) => task.visibility === "ACTIVE" && task.status === "READY") ??
          projectTasks.find((task) => task.visibility === "ACTIVE" && task.status === "WAITING")
        );
      });
      setProjectNames(new Map(projects.map((candidate) => [candidate.id, candidate.name])));
      setTodayTaskIds(new Set(today.planned.map(({ task }) => task.id)));
      setWipLimit(rules.wipLimit);
      setError("");
    } catch {
      setProject(undefined);
      setError(t("common.error"));
    } finally {
      setLoadedProjectId(projectId ?? "");
    }
  }, [localDate, projectId, t]);

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

  const openTaskEditor = (task: Task, action?: "WAITING") => {
    setDrawerTaskAction(action);
    setDrawerTask(task);
    setSelectedTask(task);
  };

  const selectTask = (task: Task) => {
    if (projectId === undefined || window.matchMedia("(max-width: 680px)").matches) {
      openTaskEditor(task);
      return;
    }
    setSelectedTask(task);
  };

  const moveTask = async (taskId: string, column: BoardColumn) => {
    try {
      const current = tasks.find((task) => task.id === taskId);

      if (current === undefined) {
        return;
      }

      if (column === "WAITING") {
        openTaskEditor(current, "WAITING");
        return;
      }

      if (column === "READY" && current.status === "DOING") {
        const paused = await requestResumeNote(current.id, true);
        if (paused) setFeedback(t("board.feedback.ready", { title: current.title }));
        return;
      }

      try {
        if (column === "DOING") {
          await taskApplicationService.startTaskForToday(current.id, localDate, getTimeZone());
        } else {
          await taskApplicationService.moveToBoardColumn(current.id, column);
        }
      } catch (error) {
        if (!(error instanceof WipLimitExceededError)) {
          throw error;
        }

        if (!confirmOverride(error.limit)) {
          return;
        }

        if (column === "DOING") {
          await taskApplicationService.startTaskForToday(current.id, localDate, getTimeZone(), {
            allowWipOverride: true,
          });
        } else {
          await taskApplicationService.moveToBoardColumn(current.id, column, {
            allowWipOverride: true,
          });
        }
      }
      if (column === "SOMEDAY" && todayTaskIds.has(current.id)) {
        await taskApplicationService.removeFromToday(current.id, localDate);
      }

      notifyTasksChanged();
      const feedbackKey =
        column === "DOING"
          ? "board.feedback.started"
          : column === "SOMEDAY"
            ? "board.feedback.someday"
            : current.status === "COMPLETED"
              ? "board.feedback.reopened"
              : "board.feedback.ready";
      setFeedback(t(feedbackKey, { title: current.title }));
    } catch {
      setError(t("common.error"));
    }
  };

  const transition = async (task: Task, status: TaskStatus) => {
    try {
      const updated = await transitionWithWipConfirmation(task.id, status, confirmOverride);
      if (updated !== undefined) {
        setFeedback(
          t(
            status === "COMPLETED"
              ? "board.feedback.completed"
              : status === "READY"
                ? "board.feedback.ready"
                : "board.feedback.started",
            { title: task.title },
          ),
        );
      }
    } catch {
      setError(t("common.error"));
    }
  };

  const addToday = async (task: Task) => {
    try {
      await taskApplicationService.addToToday(task.id, localDate, getTimeZone());
      notifyTasksChanged();
      setFeedback(t("board.feedback.addedToday", { title: task.title }));
    } catch {
      setError(t("common.error"));
    }
  };

  const visibleTasks =
    projectId === undefined ? tasks : tasks.filter((task) => task.projectId === projectId);
  const somedayTasks = visibleTasks.filter(
    (task) =>
      task.visibility === "SOMEDAY" && task.status !== "COMPLETED" && task.status !== "CANCELED",
  );

  const tasksForColumn = (column: VisibleBoardColumn) =>
    visibleTasks.filter((task) => {
      if (column === "COMPLETED") {
        return task.status === "COMPLETED";
      }
      return task.visibility === "ACTIVE" && task.status === column;
    });

  const handleDragStart = (event: DragEvent, taskId: string) => {
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
    setDraggedTaskId(taskId);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(undefined);
    setDragOverColumn(undefined);
  };

  const handleDrop = (event: DragEvent, column: VisibleBoardColumn) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    setDraggedTaskId(undefined);
    setDragOverColumn(undefined);
    if (taskId.length > 0) {
      if (column === "COMPLETED") {
        const task = tasks.find((candidate) => candidate.id === taskId);
        if (task !== undefined) {
          void transition(task, "COMPLETED");
        }
      } else {
        void moveTask(taskId, column);
      }
    }
  };

  const globalDoingCount = tasks.filter(
    (task) => task.visibility === "ACTIVE" && task.status === "DOING",
  ).length;
  const projectDoingCount = visibleTasks.filter(
    (task) => task.visibility === "ACTIVE" && task.status === "DOING",
  ).length;
  const projectPlannedTasks = visibleTasks.filter(
    (task) => task.visibility === "ACTIVE" && task.status !== "CANCELED" && task.status !== "INBOX",
  );
  const projectCompletedCount = projectPlannedTasks.filter(
    (task) => task.status === "COMPLETED",
  ).length;
  const projectProgress =
    projectPlannedTasks.length === 0
      ? 0
      : Math.round((projectCompletedCount / projectPlannedTasks.length) * 100);
  const displayedColumns = projectId === undefined ? columns : projectColumns;
  const completedTasks = tasksForColumn("COMPLETED");

  const runSelectedPrimaryAction = () => {
    if (selectedTask === undefined) {
      return;
    }
    if (selectedTask.status === "DOING") {
      void transition(selectedTask, "COMPLETED");
      return;
    }
    if (selectedTask.status === "COMPLETED" || selectedTask.status === "CANCELED") {
      void moveTask(selectedTask.id, "READY");
      return;
    }
    void moveTask(selectedTask.id, "DOING");
  };

  const selectedPrimaryLabel =
    selectedTask?.status === "DOING"
      ? t("action.COMPLETED")
      : selectedTask?.status === "WAITING"
        ? t("board.resumeDoing")
        : selectedTask?.status === "COMPLETED" || selectedTask?.status === "CANCELED"
          ? t("board.reopen")
          : t("action.DOING");

  if (loadedProjectId !== (projectId ?? "")) {
    return (
      <section className="page board-page">
        <div className="mini-skeleton" />
      </section>
    );
  }

  if (projectId !== undefined && project === undefined) {
    return (
      <section className="page empty-state">
        {error.length > 0 ? (
          <p className="page-error">{error}</p>
        ) : (
          <h1>{t("project.notFound")}</h1>
        )}
        <Link className="button button-outline" to="/projects">
          {t("project.back")}
        </Link>
      </section>
    );
  }

  return (
    <section
      className={`page board-page ${projectId === undefined ? "" : "project-workspace-page"}`}
      aria-labelledby="board-title"
    >
      <header className="page-header">
        <div>
          {projectId === undefined ? (
            <p className="eyebrow">{t("board.secondaryEyebrow")}</p>
          ) : (
            <Link className="project-back-link board-project-back" to="/projects">
              ← {t("project.back")}
            </Link>
          )}
          <h1 id="board-title">{project === undefined ? t("board.title") : project.name}</h1>
          <p>{project === undefined ? t("board.description") : t("board.projectDescription")}</p>
          {project === undefined ? null : (
            <div className="project-board-outcome">
              <span>{t("project.outcomeLabel")}</span>
              <strong>{project.note ?? t("project.outcomeEmpty")}</strong>
            </div>
          )}
        </div>
        <div className="board-wip-summary">
          {projectId === undefined ? null : (
            <span className="count-pill">
              {t("board.projectDoing", { count: projectDoingCount })}
            </span>
          )}
          <span className="count-pill count-pill-muted">
            {t("board.globalWip", { count: globalDoingCount, limit: wipLimit })}
          </span>
        </div>
      </header>

      {projectId === undefined ? null : <ProjectViewNav projectId={projectId} />}

      {projectId === undefined ? null : (
        <section className="project-board-progress" aria-label={t("project.progressTitle")}>
          <div>
            <strong>{projectProgress}%</strong>
            <span>
              {t("project.progressCount", {
                completed: projectCompletedCount,
                total: projectPlannedTasks.length,
              })}
            </span>
          </div>
          <div
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={projectProgress}
            className="project-board-progress-track"
            role="progressbar"
          >
            <span style={{ width: `${projectProgress}%` }} />
          </div>
        </section>
      )}

      {error.length > 0 ? <p className="page-error">{error}</p> : null}
      <ActionToast message={feedback} onDismiss={() => setFeedback("")} />
      {projectId !== undefined &&
      tasks.some(
        (task) =>
          task.projectId === projectId &&
          task.status === "READY" &&
          task.visibility === "ACTIVE" &&
          task.resumeNote,
      ) ? (
        <section className="project-resume-list" aria-labelledby="project-resume-title">
          <h2 id="project-resume-title">{t("resume.projectTitle")}</h2>
          {tasks
            .filter(
              (task) =>
                task.projectId === projectId &&
                task.status === "READY" &&
                task.visibility === "ACTIVE" &&
                task.resumeNote,
            )
            .map((task) => (
              <article key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <ResumeNote task={task} editable />
                </div>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void moveTask(task.id, "DOING")}
                >
                  {t("resume.continue")}
                </button>
              </article>
            ))}
        </section>
      ) : null}
      <p className="board-hint">{t("board.dragHint")}</p>

      <div className="board-columns">
        {displayedColumns.map((column) => {
          const columnTasks = tasksForColumn(column);
          return (
            <section
              className={`board-column board-column-${column.toLowerCase()} ${
                dragOverColumn === column ? "board-column-drag-over" : ""
              }`}
              key={column}
              onDragEnter={() => setDragOverColumn(column)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, column)}
            >
              <header>
                <h2>{t(`board.columns.${column}`)}</h2>
                <span>{columnTasks.length}</span>
              </header>
              <div className="board-card-list">
                {columnTasks.length === 0 ? (
                  <p className="column-empty">{t("board.emptyColumn")}</p>
                ) : (
                  columnTasks.map((task) => (
                    <article
                      className={`board-card ${
                        draggedTaskId === task.id ? "board-card-dragging" : ""
                      } ${selectedTask?.id === task.id ? "board-card-selected" : ""}`}
                      draggable
                      key={task.id}
                      onDragEnd={handleDragEnd}
                      onDragStart={(event) => handleDragStart(event, task.id)}
                    >
                      <span
                        aria-hidden="true"
                        className="board-card-drag-handle"
                        title={t("board.dragTask", { title: task.title })}
                      >
                        ⠿
                      </span>
                      <button
                        className="board-card-title"
                        onClick={() => selectTask(task)}
                        type="button"
                      >
                        {task.title}
                      </button>
                      {projectId === undefined ? (
                        <span className="board-card-project">
                          {task.projectId === undefined
                            ? t("project.noProject")
                            : (projectNames.get(task.projectId) ?? t("project.unknownProject"))}
                        </span>
                      ) : null}
                      <ResumeNote task={task} compact />
                      {task.status === "WAITING" ? (
                        <p
                          className={
                            task.waitingFor === undefined || task.reviewAt === undefined
                              ? "waiting-detail-missing"
                              : undefined
                          }
                        >
                          {task.waitingFor === undefined
                            ? t("task.waitingDetailsMissing")
                            : t("task.waitingForSummary", { value: task.waitingFor })}
                        </p>
                      ) : null}
                      {task.reviewAt === undefined ? null : (
                        <time dateTime={task.reviewAt}>
                          {t(
                            task.status === "WAITING"
                              ? "task.followUpSummary"
                              : "task.reviewSummary",
                            { date: getDateOnly(task.reviewAt) },
                          )}
                        </time>
                      )}
                      <div className="board-card-actions">
                        {column === "READY" ? (
                          <button
                            className="board-card-primary-action"
                            onClick={() => void moveTask(task.id, "DOING")}
                            type="button"
                          >
                            {t("action.DOING")}
                          </button>
                        ) : column === "DOING" ? (
                          <button
                            className="board-card-primary-action"
                            onClick={() => void transition(task, "COMPLETED")}
                            type="button"
                          >
                            {t("action.COMPLETED")}
                          </button>
                        ) : column === "WAITING" ? (
                          <button
                            className="board-card-primary-action"
                            onClick={() => void moveTask(task.id, "DOING")}
                            type="button"
                          >
                            {t("board.resumeDoing")}
                          </button>
                        ) : (
                          <button
                            className="board-card-primary-action"
                            onClick={() => void moveTask(task.id, "READY")}
                            type="button"
                          >
                            {t("board.reopen")}
                          </button>
                        )}
                        {column === "WAITING" ? (
                          <button
                            className="board-card-follow-up-action"
                            onClick={() => openTaskEditor(task)}
                            type="button"
                          >
                            {task.waitingFor === undefined || task.reviewAt === undefined
                              ? t("task.setFollowUp")
                              : t("task.editFollowUp")}
                          </button>
                        ) : null}
                        {column !== "COMPLETED" ? (
                          <details className="board-card-more">
                            <summary
                              aria-label={t("board.moreActionsFor", { title: task.title })}
                              title={t("board.moreActionsFor", { title: task.title })}
                            >
                              {t("board.moreActions")}
                            </summary>
                            <div>
                              {(task.status === "READY" || task.status === "DOING") &&
                              task.visibility !== "SOMEDAY" &&
                              !todayTaskIds.has(task.id) ? (
                                <button onClick={() => void addToday(task)} type="button">
                                  {t("board.addToday")}
                                </button>
                              ) : null}
                              {column === "READY" || column === "DOING" ? (
                                <button
                                  onClick={() => void moveTask(task.id, "WAITING")}
                                  type="button"
                                >
                                  {t("action.WAITING")}
                                </button>
                              ) : null}
                              {column === "DOING" ? (
                                <button
                                  onClick={() => void transition(task, "READY")}
                                  type="button"
                                >
                                  {t("action.pause")}
                                </button>
                              ) : null}
                              {column === "WAITING" ? (
                                <button
                                  onClick={() => void moveTask(task.id, "READY")}
                                  type="button"
                                >
                                  {t("action.READY")}
                                </button>
                              ) : null}
                              <button
                                onClick={() => void moveTask(task.id, "SOMEDAY")}
                                type="button"
                              >
                                {t("action.someday")}
                              </button>
                              {column !== "DOING" ? (
                                <button
                                  onClick={() => void transition(task, "COMPLETED")}
                                  type="button"
                                >
                                  {t("action.COMPLETED")}
                                </button>
                              ) : null}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {projectId === undefined ? null : (
        <details className="project-completed-pool">
          <summary>
            <span>
              <strong>{t("project.completedTasks", { count: completedTasks.length })}</strong>
              <small>{t("project.completedTasksDescription")}</small>
            </span>
            <span aria-hidden="true">＋</span>
          </summary>
          {completedTasks.length === 0 ? (
            <p className="column-empty">{t("board.emptyColumn")}</p>
          ) : (
            <div className="project-completed-list">
              {completedTasks.map((task) => (
                <button key={task.id} onClick={() => selectTask(task)} type="button">
                  <span>{task.title}</span>
                  <small>{t("status.COMPLETED")}</small>
                </button>
              ))}
            </div>
          )}
        </details>
      )}

      <details className="board-someday-pool">
        <summary>
          <span>
            <strong>{t("board.columns.SOMEDAY")}</strong>
            <small>{t("board.somedayDescription")}</small>
          </span>
          <span className="count-pill">{somedayTasks.length}</span>
        </summary>
        {somedayTasks.length === 0 ? (
          <p className="column-empty">{t("board.emptyColumn")}</p>
        ) : (
          <div className="board-someday-list">
            {somedayTasks.map((task) => (
              <article className="board-card" key={task.id}>
                <button className="board-card-title" onClick={() => selectTask(task)} type="button">
                  {task.title}
                </button>
                <div className="board-card-actions">
                  <button onClick={() => void moveTask(task.id, "READY")} type="button">
                    {t("action.READY")}
                  </button>
                  <button onClick={() => void transition(task, "COMPLETED")} type="button">
                    {t("action.COMPLETED")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </details>

      {projectId === undefined ? null : selectedTask === undefined ? (
        <aside className="project-task-inspector project-task-inspector-empty">
          <header>
            <span>{t("task.details")}</span>
          </header>
          <div>
            <strong>{t("project.inspectorEmptyTitle")}</strong>
            <p>{t("project.inspectorEmptyDescription")}</p>
          </div>
        </aside>
      ) : (
        <aside className="project-task-inspector" aria-labelledby="project-task-inspector-title">
          <header>
            <span>{t("task.details")}</span>
            <button onClick={() => openTaskEditor(selectedTask)} type="button">
              {t("task.editDetails")}
            </button>
          </header>
          <div className="project-task-inspector-content">
            <div
              className={`project-task-inspector-status project-task-inspector-status-${selectedTask.status.toLowerCase()}`}
            >
              <i aria-hidden="true" />
              <span>{t(`status.${selectedTask.status}`)}</span>
            </div>
            <h2 id="project-task-inspector-title">{selectedTask.title}</h2>
            <p className="project-task-inspector-note">{selectedTask.note ?? t("zen.noNote")}</p>

            <section className="project-task-context">
              <span>{t("project.whyNow")}</span>
              <strong>{t(`project.whyNowByStatus.${selectedTask.status}`)}</strong>
              <small>{project?.note ?? t("project.outcomeEmpty")}</small>
            </section>

            <dl className="project-task-meta">
              <div>
                <dt>{t("task.status")}</dt>
                <dd>{t(`status.${selectedTask.status}`)}</dd>
              </div>
              <div>
                <dt>{t("task.estimate")}</dt>
                <dd>
                  {selectedTask.estimateMinutes === undefined
                    ? t("common.emptyValue")
                    : t("today.minutes", { count: selectedTask.estimateMinutes })}
                </dd>
              </div>
              <div>
                <dt>{t("nav.today")}</dt>
                <dd>
                  {todayTaskIds.has(selectedTask.id)
                    ? t("task.addedToday")
                    : t("common.emptyValue")}
                </dd>
              </div>
            </dl>

            {selectedTask.status !== "WAITING" ? null : (
              <section className="project-task-waiting">
                <span>{t("task.waitingFor")}</span>
                <strong>{selectedTask.waitingFor ?? t("task.waitingDetailsMissing")}</strong>
                <small>
                  {selectedTask.reviewAt === undefined
                    ? t("task.setFollowUp")
                    : t("task.followUpSummary", { date: getDateOnly(selectedTask.reviewAt) })}
                </small>
              </section>
            )}
          </div>
          <footer>
            {selectedTask.status === "WAITING" ? (
              <button
                className="button button-quiet"
                onClick={() => openTaskEditor(selectedTask)}
                type="button"
              >
                {t("task.editFollowUp")}
              </button>
            ) : selectedTask.status === "READY" && !todayTaskIds.has(selectedTask.id) ? (
              <button
                className="button button-quiet"
                onClick={() => void addToday(selectedTask)}
                type="button"
              >
                {t("board.addToday")}
              </button>
            ) : null}
            {selectedTask.status === "DOING" ? (
              <>
                <button
                  className="button button-outline"
                  onClick={() => void transition(selectedTask, "COMPLETED")}
                  type="button"
                >
                  {t("action.COMPLETED")}
                </button>
                <Link className="button button-primary" to="/today">
                  {t("zen.open")}
                </Link>
              </>
            ) : (
              <button
                className="button button-primary"
                onClick={runSelectedPrimaryAction}
                type="button"
              >
                {selectedPrimaryLabel}
              </button>
            )}
          </footer>
        </aside>
      )}

      {drawerTask === undefined ? null : (
        <TaskDrawer
          initialAction={drawerTaskAction}
          onClose={() => {
            setDrawerTask(undefined);
            setDrawerTaskAction(undefined);
          }}
          onTaskChanged={(task) => {
            setDrawerTaskAction(undefined);
            setDrawerTask(task);
            setSelectedTask(task);
            void load();
          }}
          task={drawerTask}
        />
      )}
    </section>
  );
}
