import type { Task } from "@nextone/domain";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { TaskDrawer } from "./TaskDrawer";
import { notifyTasksChanged, taskApplicationService, tasksChangedEvent } from "./taskService";

interface InboxPageProps {
  onOpenCapture: () => void;
}

export function InboxPage({ onOpenCapture }: InboxPageProps) {
  const { i18n, t } = useTranslation();
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [movedTaskTitle, setMovedTaskTitle] = useState("");

  const loadTasks = useCallback(async () => {
    try {
      setTasks(await taskApplicationService.listInbox());
      setError("");
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadTasks();
    window.addEventListener(tasksChangedEvent, loadTasks);
    return () => window.removeEventListener(tasksChangedEvent, loadTasks);
  }, [loadTasks]);

  const clarify = async (task: Task) => {
    try {
      await taskApplicationService.transition(task.id, "READY");
      setMovedTaskTitle(task.title);
      notifyTasksChanged();
    } catch {
      setError(t("common.error"));
    }
  };

  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="page inbox-page" aria-labelledby="inbox-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("app.tagline")}</p>
          <h1 id="inbox-title">{t("inbox.title")}</h1>
          <p>{t("inbox.description")}</p>
        </div>
        <span className="count-pill">{t("inbox.count", { count: tasks.length })}</span>
      </header>

      {error.length > 0 ? <p className="page-error">{error}</p> : null}
      {movedTaskTitle.length > 0 ? (
        <div aria-live="polite" className="page-feedback inbox-move-feedback" role="status">
          <span>{t("inbox.movedToReady", { title: movedTaskTitle })}</span>
          <Link to="/board">{t("inbox.viewBoard")}</Link>
        </div>
      ) : null}

      {loading ? (
        <div className="task-list-skeleton" aria-hidden="true" />
      ) : tasks.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">
            ✓
          </span>
          <h2>{t("inbox.emptyTitle")}</h2>
          <p>{t("inbox.emptyDescription")}</p>
          <button className="button button-primary" onClick={onOpenCapture} type="button">
            {t("inbox.emptyAction")}
          </button>
        </div>
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <article className="task-row" key={task.id}>
              <button
                aria-label={`${t("inbox.openTask")}：${task.title}`}
                className="task-row-main"
                onClick={() => setSelectedTask(task)}
                type="button"
              >
                <span className="task-checkbox" aria-hidden="true" />
                <span className="task-copy">
                  <strong>{task.title}</strong>
                  <span>
                    <time dateTime={task.createdAt}>
                      {formatter.format(new Date(task.createdAt))}
                    </time>
                    <span aria-hidden="true"> · </span>
                    {t("inbox.source")}
                  </span>
                </span>
              </button>
              <div className="task-row-actions">
                <button
                  className="button button-outline"
                  onClick={() => void clarify(task)}
                  type="button"
                >
                  {t("inbox.clarify")}
                </button>
                <button
                  className="button button-quiet"
                  onClick={() => setSelectedTask(task)}
                  type="button"
                >
                  {t("inbox.organize")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <button className="inbox-composer" onClick={onOpenCapture} type="button">
        <span aria-hidden="true">＋</span>
        <span>{t("inbox.quickPlaceholder")}</span>
        <small>{t("inbox.quickHint")}</small>
      </button>

      {selectedTask === undefined ? null : (
        <TaskDrawer
          onClose={() => setSelectedTask(undefined)}
          onTaskChanged={(task) => {
            setSelectedTask(task.status === "INBOX" ? task : undefined);
            void loadTasks();
          }}
          task={selectedTask}
        />
      )}
    </section>
  );
}
