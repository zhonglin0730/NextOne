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

type VisibleBoardColumn = Exclude<BoardColumn, "SOMEDAY"> | "COMPLETED";

const columns: readonly VisibleBoardColumn[] = ["READY", "DOING", "WAITING", "COMPLETED"];

export function BoardPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [project, setProject] = useState<Project>();
  const [projectNames, setProjectNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [selectedTask, setSelectedTask] = useState<Task | undefined>();
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
      setProjectNames(new Map(projects.map((candidate) => [candidate.id, candidate.name])));
      setTodayTaskIds(new Set(today.planned.map(({ task }) => task.id)));
      setWipLimit(rules.wipLimit);
      setError("");
    } catch {
      setError(t("common.error"));
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

  const moveTask = async (
    taskId: string,
    column: BoardColumn,
    options: { openWaitingDetails?: boolean } = {},
  ) => {
    try {
      const current = tasks.find((task) => task.id === taskId);

      if (current === undefined) {
        return;
      }

      try {
        const updated = await taskApplicationService.moveToBoardColumn(current.id, column);
        if (column === "WAITING" && options.openWaitingDetails) {
          setSelectedTask(updated);
        }
      } catch (error) {
        if (!(error instanceof WipLimitExceededError)) {
          throw error;
        }

        if (!confirmOverride(error.limit)) {
          return;
        }

        const updated = await taskApplicationService.moveToBoardColumn(current.id, column, {
          allowWipOverride: true,
        });
        if (column === "WAITING" && options.openWaitingDetails) {
          setSelectedTask(updated);
        }
      }
      if ((column === "WAITING" || column === "SOMEDAY") && todayTaskIds.has(current.id)) {
        await taskApplicationService.removeFromToday(current.id, localDate);
      }

      notifyTasksChanged();
      const feedbackKey =
        column === "DOING"
          ? "board.feedback.started"
          : column === "WAITING"
            ? "board.feedback.waiting"
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
        void moveTask(taskId, column, { openWaitingDetails: column === "WAITING" });
      }
    }
  };

  const globalDoingCount = tasks.filter(
    (task) => task.visibility === "ACTIVE" && task.status === "DOING",
  ).length;
  const projectDoingCount = visibleTasks.filter(
    (task) => task.visibility === "ACTIVE" && task.status === "DOING",
  ).length;

  return (
    <section className="page board-page" aria-labelledby="board-title">
      <header className="page-header">
        <div>
          {projectId === undefined ? (
            <p className="eyebrow">{t("board.secondaryEyebrow")}</p>
          ) : (
            <Link className="project-back-link board-project-back" to="/projects">
              ← {t("project.back")}
            </Link>
          )}
          <h1 id="board-title">
            {project === undefined
              ? t("board.title")
              : t("board.projectTitle", { name: project.name })}
          </h1>
          <p>{project === undefined ? t("board.description") : t("board.projectDescription")}</p>
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

      {error.length > 0 ? <p className="page-error">{error}</p> : null}
      <ActionToast message={feedback} onDismiss={() => setFeedback("")} />
      <p className="board-hint">{t("board.dragHint")}</p>

      <div className="board-columns">
        {columns.map((column) => {
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
                      }`}
                      key={task.id}
                    >
                      <span
                        aria-hidden="true"
                        className="board-card-drag-handle"
                        draggable
                        onDragEnd={handleDragEnd}
                        onDragStart={(event) => handleDragStart(event, task.id)}
                        title={t("board.dragTask", { title: task.title })}
                      >
                        ⠿
                      </span>
                      <button
                        className="board-card-title"
                        onClick={() => setSelectedTask(task)}
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
                            onClick={() => setSelectedTask(task)}
                            type="button"
                          >
                            {task.waitingFor === undefined || task.reviewAt === undefined
                              ? t("task.setFollowUp")
                              : t("task.editFollowUp")}
                          </button>
                        ) : null}
                        {(task.status === "READY" || task.status === "DOING") &&
                        task.visibility !== "SOMEDAY" ? (
                          <button
                            disabled={todayTaskIds.has(task.id)}
                            onClick={() => void addToday(task)}
                            type="button"
                          >
                            {todayTaskIds.has(task.id)
                              ? t("board.addedToday")
                              : t("board.addToday")}
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
                <button
                  className="board-card-title"
                  onClick={() => setSelectedTask(task)}
                  type="button"
                >
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

      {selectedTask === undefined ? null : (
        <TaskDrawer
          onClose={() => setSelectedTask(undefined)}
          onTaskChanged={(task) => {
            setSelectedTask(task);
            void load();
          }}
          task={selectedTask}
        />
      )}
    </section>
  );
}
