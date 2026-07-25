import { WipLimitExceededError, type BoardColumn } from "@nextone/application";
import type { Task, TaskStatus } from "@nextone/domain";
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";

import { TaskDrawer } from "../tasks/TaskDrawer";
import { transitionWithWipConfirmation } from "../tasks/taskActions";
import {
  notifyTasksChanged,
  taskApplicationService,
  tasksChangedEvent,
} from "../tasks/taskService";
import { getLocalDate, getTimeZone } from "../today/date";

const columns: readonly BoardColumn[] = ["READY", "DOING", "WAITING", "SOMEDAY"];

export function BoardPage() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | undefined>();
  const [todayTaskIds, setTodayTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState("");
  const localDate = useMemo(() => getLocalDate(), []);

  const load = useCallback(async () => {
    try {
      const [boardTasks, today] = await Promise.all([
        taskApplicationService.listBoardTasks(),
        taskApplicationService.getToday(localDate),
      ]);
      setTasks(boardTasks);
      setTodayTaskIds(new Set([...today.focus, ...today.later].map(({ task }) => task.id)));
      setError("");
    } catch {
      setError(t("common.error"));
    }
  }, [localDate, t]);

  useEffect(() => {
    void load();
    window.addEventListener(tasksChangedEvent, load);
    return () => window.removeEventListener(tasksChangedEvent, load);
  }, [load]);

  const confirmOverride = (limit: number) =>
    window.confirm(`${t("wip.title", { limit })}\n\n${t("wip.confirm")}`);

  const moveTask = async (taskId: string, column: BoardColumn) => {
    try {
      const current = tasks.find((task) => task.id === taskId);

      if (current === undefined) {
        return;
      }

      try {
        await taskApplicationService.moveToBoardColumn(current.id, column);
      } catch (error) {
        if (!(error instanceof WipLimitExceededError)) {
          throw error;
        }

        if (!confirmOverride(error.limit)) {
          return;
        }

        await taskApplicationService.moveToBoardColumn(current.id, column, {
          allowWipOverride: true,
        });
      }

      notifyTasksChanged();
      await load();
    } catch {
      setError(t("common.error"));
    }
  };

  const transition = async (task: Task, status: TaskStatus) => {
    try {
      await transitionWithWipConfirmation(task.id, status, confirmOverride);
      await load();
    } catch {
      setError(t("common.error"));
    }
  };

  const addToday = async (task: Task) => {
    try {
      await taskApplicationService.addToToday(task.id, localDate, getTimeZone());
      notifyTasksChanged();
      await load();
    } catch {
      setError(t("common.error"));
    }
  };

  const tasksForColumn = (column: BoardColumn) =>
    tasks.filter((task) =>
      column === "SOMEDAY"
        ? task.visibility === "SOMEDAY"
        : task.visibility !== "SOMEDAY" && task.status === column,
    );

  const handleDragStart = (event: DragEvent, taskId: string) => {
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (event: DragEvent, column: BoardColumn) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (taskId.length > 0) {
      void moveTask(taskId, column);
    }
  };

  const doingCount = tasksForColumn("DOING").length;

  return (
    <section className="page board-page" aria-labelledby="board-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("app.tagline")}</p>
          <h1 id="board-title">{t("board.title")}</h1>
          <p>{t("board.description")}</p>
        </div>
        <span className="count-pill">{t("board.wip", { count: doingCount, limit: 3 })}</span>
      </header>

      {error.length > 0 ? <p className="page-error">{error}</p> : null}
      <p className="board-hint">{t("board.dragHint")}</p>

      <div className="board-columns">
        {columns.map((column) => {
          const columnTasks = tasksForColumn(column);
          return (
            <section
              className={`board-column board-column-${column.toLowerCase()}`}
              key={column}
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
                      className="board-card"
                      draggable
                      key={task.id}
                      onDragStart={(event) => handleDragStart(event, task.id)}
                    >
                      <button
                        className="board-card-title"
                        onClick={() => setSelectedTask(task)}
                        type="button"
                      >
                        {task.title}
                      </button>
                      {task.status === "WAITING" && task.waitingFor !== undefined ? (
                        <p>{task.waitingFor}</p>
                      ) : null}
                      {task.reviewAt === undefined ? null : (
                        <time dateTime={task.reviewAt}>{task.reviewAt}</time>
                      )}
                      <div className="board-card-actions">
                        {column !== "DOING" ? (
                          <button onClick={() => void moveTask(task.id, "DOING")} type="button">
                            {t("action.DOING")}
                          </button>
                        ) : (
                          <button onClick={() => void transition(task, "READY")} type="button">
                            {t("action.pause")}
                          </button>
                        )}
                        {column !== "WAITING" ? (
                          <button onClick={() => void moveTask(task.id, "WAITING")} type="button">
                            {t("action.WAITING")}
                          </button>
                        ) : null}
                        {column !== "SOMEDAY" ? (
                          <button onClick={() => void moveTask(task.id, "SOMEDAY")} type="button">
                            {t("action.someday")}
                          </button>
                        ) : (
                          <button onClick={() => void moveTask(task.id, "READY")} type="button">
                            {t("action.READY")}
                          </button>
                        )}
                        <button onClick={() => void transition(task, "COMPLETED")} type="button">
                          {t("action.COMPLETED")}
                        </button>
                        <button
                          disabled={todayTaskIds.has(task.id)}
                          onClick={() => void addToday(task)}
                          type="button"
                        >
                          {todayTaskIds.has(task.id) ? t("board.addedToday") : t("board.addToday")}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

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
