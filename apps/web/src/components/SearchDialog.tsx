import type { Task } from "@nextone/domain";
import type { ProjectOverview } from "@nextone/application";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { projectApplicationService, taskApplicationService } from "../tasks/taskService";
import { TaskDrawer } from "../tasks/TaskDrawer";
import { getWeekStartsAt } from "../today/date";

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<readonly Task[]>([]);
  const [projects, setProjects] = useState<readonly ProjectOverview[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) {
      dialog.current?.close();
      return;
    }
    dialog.current?.showModal();
    input.current?.focus();
    setLoading(true);
    setError(false);
    let active = true;
    void Promise.all([
      projectApplicationService.listOverview(getWeekStartsAt()),
      taskApplicationService.listInbox(),
      taskApplicationService.listBoardTasks(),
    ])
      .then(([overviews, inbox, board]) => {
        if (!active) return;
        setProjects(overviews);
        setTasks([...new Map([...inbox, ...board].map((task) => [task.id, task])).values()]);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, attempt]);
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  const needle = query.trim().toLocaleLowerCase();
  const matchingProjects = needle
    ? projects
        .filter(({ project }) => project.name.toLocaleLowerCase().includes(needle))
        .slice(0, 6)
    : [];
  const matchingTasks = needle
    ? tasks.filter((task) => task.title.toLocaleLowerCase().includes(needle)).slice(0, 12)
    : [];
  return (
    <>
      <dialog
        ref={dialog}
        className="search-dialog"
        onCancel={onClose}
        aria-label={t("shell.searchTitle")}
      >
        <header className="dialog-header">
          <h2>{t("shell.searchTitle")}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <input
          ref={input}
          type="search"
          aria-label={t("shell.search")}
          placeholder={t("shell.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "ArrowDown" ||
              (event.key === "Enter" && !event.nativeEvent.isComposing)
            ) {
              const first =
                dialog.current?.querySelector<HTMLButtonElement>(".search-results button");
              if (first) {
                event.preventDefault();
                first.focus();
              }
            }
          }}
        />
        {loading ? (
          <p role="status">{t("shell.searchLoading")}</p>
        ) : error ? (
          <div>
            <p role="alert">{t("common.error")}</p>
            <button
              type="button"
              className="button button-outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {t("shell.searchRetry")}
            </button>
          </div>
        ) : !needle ? (
          <p className="muted">{t("shell.searchHint")}</p>
        ) : (
          <div className="search-results">
            {matchingProjects.map(({ project }) => (
              <button
                type="button"
                key={project.id}
                onClick={() => {
                  onClose();
                  navigate(`/projects/${project.id}`);
                }}
              >
                <span>{project.name}</span>
                <small>{t("nav.projects")}</small>
              </button>
            ))}
            {matchingTasks.map((task) => (
              <button
                type="button"
                key={task.id}
                onClick={() => {
                  onClose();
                  setSelectedTask(task);
                }}
              >
                <span>{task.title}</span>
                <small>
                  {projects.find(({ project }) => project.id === task.projectId)?.project.name ??
                    t("task.noProject")}{" "}
                  · {t(`status.${task.status}`)}
                </small>
              </button>
            ))}
            {matchingProjects.length + matchingTasks.length === 0 ? (
              <p className="muted" role="status">
                {t("shell.searchEmpty")}
              </p>
            ) : null}
          </div>
        )}
      </dialog>
      {selectedTask ? (
        <TaskDrawer
          task={selectedTask}
          onClose={() => setSelectedTask(undefined)}
          onTaskChanged={setSelectedTask}
        />
      ) : null}
    </>
  );
}
