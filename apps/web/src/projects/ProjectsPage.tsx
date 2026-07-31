import type { ProjectOverview } from "@nextone/application";
import type { Task } from "@nextone/domain";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import {
  notifyTasksChanged,
  projectApplicationService,
  taskApplicationService,
  tasksChangedEvent,
} from "../tasks/taskService";
import { transitionWithWipConfirmation } from "../tasks/taskActions";
import { getWeekStartsAt } from "../today/date";
import { ProjectPortfolioOverview } from "./ProjectPortfolioOverview";

export function ProjectsPage() {
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const weekStartsAt = useMemo(() => getWeekStartsAt(), []);
  const [projects, setProjects] = useState<readonly ProjectOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [startingTaskId, setStartingTaskId] = useState<string>();
  const [error, setError] = useState("");
  const [showWorkflowGuide, setShowWorkflowGuide] = useState(
    () => window.localStorage.getItem("nextone.project-workflow.dismissed") !== "1",
  );
  const createSubmittingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setProjects(await projectApplicationService.listOverview(weekStartsAt));
      setError("");
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t, weekStartsAt]);

  useEffect(() => {
    void load();
    window.addEventListener(tasksChangedEvent, load);
    return () => window.removeEventListener(tasksChangedEvent, load);
  }, [load]);

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setDialogOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialogOpen]);

  const openCreate = () => {
    setName("");
    setNote("");
    setError("");
    setDialogOpen(true);
  };

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length === 0 || createSubmittingRef.current) {
      return;
    }

    createSubmittingRef.current = true;
    setSubmitting(true);
    try {
      const project = await projectApplicationService.create({
        name,
        ...(note.trim().length === 0 ? {} : { note }),
      });
      notifyTasksChanged();
      setDialogOpen(false);
      navigate(`/projects/${project.id}`);
    } catch {
      setError(t("common.error"));
    } finally {
      createSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const startTask = async (task: Task) => {
    setStartingTaskId(task.id);
    setError("");
    try {
      await transitionWithWipConfirmation(task.id, "DOING", (limit) =>
        window.confirm(`${t("wip.title", { limit })}\n\n${t("wip.confirm")}`),
      );
    } catch {
      setError(t("common.error"));
    } finally {
      setStartingTaskId(undefined);
    }
  };

  const dismissWorkflowGuide = () => {
    window.localStorage.setItem("nextone.project-workflow.dismissed", "1");
    setShowWorkflowGuide(false);
  };

  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "zh-CN", {
    dateStyle: "medium",
  });
  const doingProjects = projects.filter(({ doingTasks }) => doingTasks.length > 0);
  const readyProjects =
    doingProjects.length === 0
      ? projects.filter(({ nextReadyTask }) => nextReadyTask !== undefined)
      : [];
  const overviewProjects =
    doingProjects.length > 1 ? doingProjects : readyProjects.length > 1 ? readyProjects : [];
  const overviewMode = doingProjects.length > 1 ? "doing" : "ready";
  const suggestedProject =
    doingProjects.length === 0 && readyProjects.length <= 1
      ? (readyProjects[0] ?? (projects.length === 1 ? projects[0] : undefined))
      : undefined;
  const singleDoingProject = doingProjects.length === 1 ? doingProjects[0] : undefined;
  const spotlightProject = singleDoingProject ?? suggestedProject;
  const attentionProjects = projects.filter(({ needsFocusDecision }) => needsFocusDecision);
  const needsDecisionCount = attentionProjects.length;

  return (
    <section className="page projects-page" aria-labelledby="projects-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("project.dashboardEyebrow")}</p>
          <h1 id="projects-title">{t("project.dashboardTitle")}</h1>
          <p>{t("project.dashboardDescription")}</p>
        </div>
        <div className="page-header-actions">
          <Link className="button button-outline" to="/board">
            {t("project.allTasksBoard")}
          </Link>
          <button className="button button-primary" onClick={openCreate} type="button">
            ＋ {t("project.create")}
          </button>
        </div>
      </header>

      {showWorkflowGuide ? (
        <section className="project-workflow-guide" aria-labelledby="project-workflow-title">
          <div>
            <p className="eyebrow">{t("project.workflowEyebrow")}</p>
            <h2 id="project-workflow-title">{t("project.workflowTitle")}</h2>
            <p>{t("project.workflowDescription")}</p>
          </div>
          <ol>
            {(
              [
                ["capture", "/inbox"],
                ["project", "/projects"],
                ["board", "/board"],
                ["today", "/today"],
                ["review", "/review"],
              ] as const
            ).map(([step, to], index) => (
              <li key={step}>
                <Link to={to}>
                  <span>{index + 1}</span>
                  {t(`project.workflow.${step}`)}
                </Link>
              </li>
            ))}
          </ol>
          <button
            aria-label={t("project.dismissWorkflow")}
            className="project-workflow-dismiss"
            onClick={dismissWorkflowGuide}
            title={t("project.dismissWorkflow")}
            type="button"
          >
            ×
          </button>
        </section>
      ) : null}

      {error.length > 0 ? <p className="page-error">{error}</p> : null}

      {loading ? (
        <div className="task-list-skeleton" />
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">
            ◇
          </span>
          <h2>{t("project.emptyTitle")}</h2>
          <p>{t("project.emptyDescription")}</p>
          <button className="button button-primary" onClick={openCreate} type="button">
            {t("project.createFirst")}
          </button>
        </div>
      ) : (
        <>
          {overviewProjects.length > 1 ? (
            <section className="project-active-section" aria-labelledby="project-active-title">
              <header>
                <div>
                  <p className="eyebrow">
                    {t(
                      overviewMode === "doing"
                        ? "project.activeProjectsEyebrow"
                        : "project.readyProjectsEyebrow",
                    )}
                  </p>
                  <h2 id="project-active-title">
                    {t(
                      overviewMode === "doing"
                        ? "project.activeProjectsTitle"
                        : "project.readyProjectsTitle",
                      { count: overviewProjects.length },
                    )}
                  </h2>
                </div>
                <p>
                  {t(
                    overviewMode === "doing"
                      ? "project.activeProjectsDescription"
                      : "project.readyProjectsDescription",
                  )}
                </p>
              </header>
              <div className="project-active-grid">
                {overviewProjects.map((overview) => (
                  <Link
                    className="project-active-card"
                    key={overview.project.id}
                    to={`/projects/${overview.project.id}`}
                  >
                    <header>
                      <strong>{overview.project.name}</strong>
                      <span>{overview.progress.completedPercent}%</span>
                    </header>
                    <ul>
                      {(overview.doingTasks.length > 0
                        ? overview.doingTasks
                        : overview.nextReadyTask === undefined
                          ? []
                          : [overview.nextReadyTask]
                      ).map((task) => (
                        <li key={task.id}>{task.title}</li>
                      ))}
                    </ul>
                    <footer>
                      <span>
                        {overview.waitingCount > 0
                          ? t("project.waitingSummary", { count: overview.waitingCount })
                          : t("project.noWaiting")}
                      </span>
                      <strong>{t("project.continueProject")} →</strong>
                    </footer>
                  </Link>
                ))}
              </div>
            </section>
          ) : spotlightProject === undefined ? null : (
            <section
              className="project-cockpit-hero"
              aria-labelledby="project-cockpit-primary-title"
            >
              <div className="project-cockpit-project">
                <p className="eyebrow">
                  {singleDoingProject === undefined
                    ? t("project.suggestedProject")
                    : t("project.activeProject")}
                </p>
                <h2 id="project-cockpit-primary-title">
                  <Link to={`/projects/${spotlightProject.project.id}`}>
                    {spotlightProject.project.name}
                  </Link>
                </h2>
                <p>{spotlightProject.project.note ?? t("project.outcomeEmpty")}</p>
                <span className="project-last-progress">
                  {spotlightProject.lastProgressAt === undefined
                    ? t("project.noProgress")
                    : t("project.lastProgress", {
                        date: formatter.format(new Date(spotlightProject.lastProgressAt)),
                      })}
                </span>
              </div>

              <div className="project-cockpit-next">
                <span>
                  {spotlightProject.doingTasks.length > 0
                    ? t("project.doingSummary", { count: spotlightProject.doingTasks.length })
                    : t("project.nextReadyTitle")}
                </span>
                {spotlightProject.doingTasks.length > 0 ? (
                  <ul className="project-cockpit-task-list">
                    {spotlightProject.doingTasks.map((task) => (
                      <li key={task.id}>{task.title}</li>
                    ))}
                  </ul>
                ) : (
                  <strong>{spotlightProject.nextReadyTask?.title ?? t("project.noFocus")}</strong>
                )}
                <p>
                  {spotlightProject.doingTasks.length > 0
                    ? t("project.doingSummaryDescription")
                    : spotlightProject.nextReadyTask === undefined
                      ? t("project.noFocusGuidance")
                      : t("project.nextReadyDescription")}
                </p>
                <div className="project-cockpit-actions">
                  {spotlightProject.doingTasks.length > 0 ? (
                    <Link
                      className="button button-primary"
                      to={`/projects/${spotlightProject.project.id}`}
                    >
                      {t("project.continueProject")}
                    </Link>
                  ) : spotlightProject.nextReadyTask === undefined ? (
                    <Link
                      className="button button-primary"
                      to={`/projects/${spotlightProject.project.id}`}
                    >
                      {t("project.decideNext")}
                    </Link>
                  ) : (
                    <button
                      className="button button-primary"
                      disabled={startingTaskId === spotlightProject.nextReadyTask.id}
                      onClick={() => void startTask(spotlightProject.nextReadyTask!)}
                      type="button"
                    >
                      {startingTaskId === spotlightProject.nextReadyTask.id
                        ? t("common.saving")
                        : t("project.startNext")}
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

          {needsDecisionCount > 0 ? (
            <section
              className="project-attention-section"
              aria-labelledby="project-attention-title"
            >
              <header>
                <div>
                  <p className="eyebrow">{t("project.attentionEyebrow")}</p>
                  <h2 id="project-attention-title">
                    {t("project.decisionTitle", { count: needsDecisionCount })}
                  </h2>
                </div>
                <p>{t("project.decisionDescription")}</p>
              </header>
              <div className="project-attention-list">
                {attentionProjects.map(({ project }) => (
                  <Link key={project.id} to={`/projects/${project.id}`}>
                    <span>{project.name}</span>
                    <strong>{t("project.decideNext")} →</strong>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <ProjectPortfolioOverview projects={projects} />
        </>
      )}

      {dialogOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setDialogOpen(false)}
        >
          <section
            aria-labelledby="project-create-title"
            aria-modal="true"
            className="capture-dialog project-dialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="dialog-header">
              <div>
                <p className="eyebrow">{t("project.createEyebrow")}</p>
                <h2 id="project-create-title">{t("project.create")}</h2>
              </div>
              <button
                aria-label={t("common.close")}
                className="icon-button"
                onClick={() => setDialogOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <form onSubmit={createProject}>
              <label className="form-field">
                <span>{t("project.name")}</span>
                <input
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("project.namePlaceholder")}
                  required
                  value={name}
                />
              </label>
              <label className="form-field project-note-field">
                <span>{t("project.note")}</span>
                <textarea
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t("project.notePlaceholder")}
                  rows={5}
                  value={note}
                />
              </label>
              {error.length > 0 ? <p className="form-error">{error}</p> : null}
              <footer className="dialog-actions">
                <button
                  className="button button-secondary"
                  onClick={() => setDialogOpen(false)}
                  type="button"
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="button button-primary"
                  disabled={name.trim().length === 0 || submitting}
                  type="submit"
                >
                  {submitting ? t("common.saving") : t("project.create")}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
