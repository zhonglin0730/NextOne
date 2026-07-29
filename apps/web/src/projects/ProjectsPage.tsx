import type { ProjectOverview } from "@nextone/application";
import type { Task } from "@nextone/domain";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
import { ProjectProgress } from "./ProjectProgress";

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

  const openCreate = () => {
    setName("");
    setNote("");
    setError("");
    setDialogOpen(true);
  };

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length === 0 || submitting) {
      return;
    }

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
      setSubmitting(false);
    }
  };

  const startFocusTask = async (task: Task) => {
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

  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "zh-CN", {
    dateStyle: "medium",
  });
  const primaryProject =
    projects.find(({ focusTask }) => focusTask?.status === "DOING") ??
    projects.find(({ focusTask }) => focusTask !== undefined) ??
    projects[0];
  const attentionProjects = projects.filter(
    ({ needsFocusDecision, project }) =>
      needsFocusDecision && project.id !== primaryProject?.project.id,
  );
  const portfolioProjects = projects.filter(
    ({ project }) => project.id !== primaryProject?.project.id,
  );
  const needsDecisionCount = attentionProjects.length;

  return (
    <section className="page projects-page" aria-labelledby="projects-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("project.dashboardEyebrow")}</p>
          <h1 id="projects-title">{t("project.dashboardTitle")}</h1>
          <p>{t("project.dashboardDescription")}</p>
        </div>
        <button className="button button-primary" onClick={openCreate} type="button">
          ＋ {t("project.create")}
        </button>
      </header>

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
          {primaryProject === undefined ? null : (
            <section
              className="project-cockpit-hero"
              aria-labelledby="project-cockpit-primary-title"
            >
              <div className="project-cockpit-project">
                <p className="eyebrow">{t("project.primaryProject")}</p>
                <h2 id="project-cockpit-primary-title">
                  <Link to={`/projects/${primaryProject.project.id}`}>
                    {primaryProject.project.name}
                  </Link>
                </h2>
                <p>{primaryProject.project.note ?? t("project.outcomeEmpty")}</p>
                <span className="project-last-progress">
                  {primaryProject.lastProgressAt === undefined
                    ? t("project.noProgress")
                    : t("project.lastProgress", {
                        date: formatter.format(new Date(primaryProject.lastProgressAt)),
                      })}
                </span>
              </div>

              <div className="project-cockpit-next">
                <span>{t("project.currentNext")}</span>
                <strong>{primaryProject.focusTask?.title ?? t("project.noFocus")}</strong>
                <p>
                  {primaryProject.focusTask === undefined
                    ? t("project.noFocusGuidance")
                    : t("project.focusGuidance")}
                </p>
                <div className="project-cockpit-actions">
                  {primaryProject.focusTask === undefined ? (
                    <Link
                      className="button button-primary"
                      to={`/projects/${primaryProject.project.id}#project-focus`}
                    >
                      {t("project.decideNext")}
                    </Link>
                  ) : primaryProject.focusTask.status === "DOING" ? (
                    <Link
                      className="button button-primary"
                      to={`/projects/${primaryProject.project.id}#project-focus`}
                    >
                      {t("project.continueProject")}
                    </Link>
                  ) : (
                    <button
                      className="button button-primary"
                      disabled={startingTaskId === primaryProject.focusTask.id}
                      onClick={() => void startFocusTask(primaryProject.focusTask!)}
                      type="button"
                    >
                      {startingTaskId === primaryProject.focusTask.id
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
                  <Link key={project.id} to={`/projects/${project.id}#project-focus`}>
                    <span>{project.name}</span>
                    <strong>{t("project.decideNext")} →</strong>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div className="project-section-heading">
            <div>
              <p className="eyebrow">{t("project.portfolioEyebrow")}</p>
              <h2>{t("project.otherActiveProjects")}</h2>
            </div>
            <span className="count-pill">{portfolioProjects.length}</span>
          </div>

          <div className="project-grid">
            {portfolioProjects.map((overview) => (
              <article
                className={`project-card ${
                  overview.needsFocusDecision ? "project-card-needs-focus" : ""
                }`}
                key={overview.project.id}
              >
                <header>
                  <div>
                    <span className="project-icon" aria-hidden="true">
                      ◇
                    </span>
                    <div>
                      <h2>
                        <Link to={`/projects/${overview.project.id}`}>{overview.project.name}</Link>
                      </h2>
                      {overview.project.note === undefined ? null : <p>{overview.project.note}</p>}
                    </div>
                  </div>
                  <span
                    className={`project-health ${
                      overview.needsFocusDecision
                        ? "project-health-decision"
                        : "project-health-active"
                    }`}
                  >
                    {overview.needsFocusDecision ? t("project.needsDecision") : t("project.active")}
                  </span>
                </header>

                <div className="project-focus-card">
                  <span>{t("project.currentNext")}</span>
                  <strong>{overview.focusTask?.title ?? t("project.noFocus")}</strong>
                </div>

                <ProjectProgress compact progress={overview.progress} />

                <dl className="project-metrics">
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

                <footer>
                  <span>
                    {overview.lastProgressAt === undefined
                      ? t("project.noProgress")
                      : t("project.lastProgress", {
                          date: formatter.format(new Date(overview.lastProgressAt)),
                        })}
                  </span>
                  <Link to={`/projects/${overview.project.id}`}>{t("project.openProject")} →</Link>
                </footer>
              </article>
            ))}
            <button className="project-create-card" onClick={openCreate} type="button">
              <span aria-hidden="true">＋</span>
              <strong>{t("project.create")}</strong>
              <small>{t("project.createHint")}</small>
            </button>
          </div>
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
