import type { ProjectOverview } from "@nextone/application";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import {
  notifyTasksChanged,
  projectApplicationService,
  tasksChangedEvent,
} from "../tasks/taskService";
import { getWeekStartsAt } from "../today/date";

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

  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "zh-CN", {
    dateStyle: "medium",
  });
  const needsDecisionCount = projects.filter(({ needsFocusDecision }) => needsFocusDecision).length;

  return (
    <section className="page projects-page" aria-labelledby="projects-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("project.eyebrow")}</p>
          <h1 id="projects-title">{t("project.title")}</h1>
          <p>{t("project.description")}</p>
        </div>
        <button className="button button-primary" onClick={openCreate} type="button">
          ＋ {t("project.create")}
        </button>
      </header>

      {error.length > 0 ? <p className="page-error">{error}</p> : null}

      {needsDecisionCount > 0 ? (
        <div className="project-decision-banner">
          <span aria-hidden="true">◎</span>
          <div>
            <strong>{t("project.decisionTitle", { count: needsDecisionCount })}</strong>
            <p>{t("project.decisionDescription")}</p>
          </div>
        </div>
      ) : null}

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
        <div className="project-grid">
          {projects.map((overview) => (
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

              <Link className="project-focus-card" to={`/projects/${overview.project.id}`}>
                <span>{t("project.currentFocus")}</span>
                <strong>{overview.focusTask?.title ?? t("project.noFocus")}</strong>
                <span aria-hidden="true">›</span>
              </Link>

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
                {overview.lastProgressAt === undefined
                  ? t("project.noProgress")
                  : t("project.lastProgress", {
                      date: formatter.format(new Date(overview.lastProgressAt)),
                    })}
              </footer>
            </article>
          ))}
          <button className="project-create-card" onClick={openCreate} type="button">
            <span aria-hidden="true">＋</span>
            <strong>{t("project.create")}</strong>
            <small>{t("project.createHint")}</small>
          </button>
        </div>
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
