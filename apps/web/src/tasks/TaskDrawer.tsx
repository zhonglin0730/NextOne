import {
  allowedTaskTransitions,
  type EnergyLevel,
  type Project,
  type Task,
  type TaskEvent,
  type TaskStatus,
} from "@nextone/domain";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { getLocalDate, getTimeZone } from "../today/date";
import { transitionWithWipConfirmation } from "./taskActions";
import {
  notifyTasksChanged,
  projectApplicationService,
  taskApplicationService,
} from "./taskService";

interface TaskDrawerProps {
  task: Task;
  onClose: () => void;
  onTaskChanged: (task: Task) => void;
}

export function TaskDrawer({ task, onClose, onTaskChanged }: TaskDrawerProps) {
  const { i18n, t } = useTranslation();
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [parentTaskId, setParentTaskId] = useState(task.parentTaskId ?? "");
  const [deadlineAt, setDeadlineAt] = useState(task.deadlineAt ?? "");
  const [reviewAt, setReviewAt] = useState(task.reviewAt ?? "");
  const [estimateMinutes, setEstimateMinutes] = useState(task.estimateMinutes?.toString() ?? "");
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | "">(task.energyLevel ?? "");
  const [waitingFor, setWaitingFor] = useState(task.waitingFor ?? "");
  const [events, setEvents] = useState<readonly TaskEvent[]>([]);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [workPackages, setWorkPackages] = useState<readonly Task[]>([]);
  const [addedToday, setAddedToday] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const loadEvents = async () => {
    setEvents(await taskApplicationService.listTaskEvents(task.id));
  };

  const loadTodayMembership = async () => {
    setAddedToday(await taskApplicationService.isInTodayPlan(task.id, getLocalDate()));
  };

  useEffect(() => {
    setTitle(task.title);
    setNote(task.note ?? "");
    setProjectId(task.projectId ?? "");
    setParentTaskId(task.parentTaskId ?? "");
    setDeadlineAt(task.deadlineAt ?? "");
    setReviewAt(task.reviewAt ?? "");
    setEstimateMinutes(task.estimateMinutes?.toString() ?? "");
    setEnergyLevel(task.energyLevel ?? "");
    setWaitingFor(task.waitingFor ?? "");
    void loadEvents();
    void loadTodayMembership();
    void projectApplicationService.listProjects("ACTIVE").then(setProjects);
  }, [task]);

  useEffect(() => {
    if (projectId.length === 0) {
      setWorkPackages([]);
      return;
    }
    void taskApplicationService
      .listProjectWorkPackages(projectId)
      .then((packages) => setWorkPackages(packages.filter((item) => item.id !== task.id)));
  }, [projectId, task.id]);

  useEffect(() => {
    setDirty(false);
    setSaved(false);
  }, [task.id]);

  const markDirty = () => {
    setDirty(true);
    setSaved(false);
  };

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm(t("task.discardChangesConfirm"))) {
      return;
    }
    onClose();
  }, [dirty, onClose, t]);

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [requestClose]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const updated = await taskApplicationService.updateDetails(task.id, {
        title,
        note: note.trim().length === 0 ? null : note,
        projectId: projectId.length === 0 ? null : projectId,
        parentTaskId: parentTaskId.length === 0 ? null : parentTaskId,
        deadlineAt: deadlineAt.length === 0 ? null : deadlineAt,
        reviewAt: reviewAt.length === 0 ? null : reviewAt,
        estimateMinutes: estimateMinutes.length === 0 ? null : Number.parseInt(estimateMinutes, 10),
        energyLevel: energyLevel === "" ? null : energyLevel,
        waitingFor: waitingFor.trim().length === 0 ? null : waitingFor,
      });
      onTaskChanged(updated);
      notifyTasksChanged();
      await loadEvents();
      setDirty(false);
      setSaved(true);
      window.setTimeout(onClose, 450);
    } catch {
      setError(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (status: TaskStatus) => {
    if (status === "CANCELED" && !window.confirm(t("task.abandonConfirm"))) {
      return;
    }
    if (dirty && !window.confirm(t("task.discardChangesForStatusConfirm"))) {
      return;
    }

    setSubmitting(true);
    setSaved(false);
    setError("");

    try {
      const updated = await transitionWithWipConfirmation(task.id, status, (limit) =>
        window.confirm(`${t("wip.title", { limit })}\n\n${t("wip.confirm")}`),
      );
      if (updated === undefined) {
        return;
      }
      onTaskChanged(updated);
      await loadEvents();
      setDirty(false);
    } catch {
      setError(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const addToday = async () => {
    if (addedToday) {
      return;
    }

    setSubmitting(true);
    setSaved(false);
    setError("");

    try {
      await taskApplicationService.addToToday(task.id, getLocalDate(), getTimeZone());
      setAddedToday(true);
      notifyTasksChanged();
      await loadEvents();
    } catch {
      setError(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const availableTransitions = [...allowedTaskTransitions[task.status]];
  const visibleTransitions = availableTransitions.filter((status) => {
    if (status === "CANCELED") {
      return false;
    }
    if (task.status === "INBOX") {
      return status === "READY";
    }
    if (task.status === "WAITING") {
      return status === "READY" || status === "DOING" || status === "COMPLETED";
    }
    return (
      status === "READY" || status === "DOING" || status === "WAITING" || status === "COMPLETED"
    );
  });
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={requestClose}>
      <aside
        aria-labelledby="task-drawer-title"
        aria-modal="true"
        className="task-drawer"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <p className="eyebrow">{t("task.details")}</p>
            <h2 id="task-drawer-title">{task.title}</h2>
          </div>
          <button
            aria-label={t("common.close")}
            className="icon-button"
            onClick={requestClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="status-strip">
          <span className={`status-badge status-${task.status.toLowerCase()}`}>
            {t(`status.${task.status}`)}
          </span>
          <div className="status-actions">
            {task.status === "READY" ? (
              <button
                className="button button-outline"
                disabled={submitting || addedToday}
                onClick={() => void addToday()}
                type="button"
              >
                {addedToday ? t("task.addedToday") : t("task.addToday")}
              </button>
            ) : null}
            {visibleTransitions.map((status) => (
              <button
                className={`button ${status === "DOING" ? "button-primary" : "button-quiet"}`}
                disabled={submitting}
                key={status}
                onClick={() => void changeStatus(status)}
                type="button"
              >
                {status === "DOING" && task.status === "WAITING"
                  ? t("board.resumeDoing")
                  : t(`action.${status}`)}
              </button>
            ))}
          </div>
        </div>

        {task.status === "WAITING" ? (
          <p className="waiting-workflow-hint">{t("task.waitingTodayHint")}</p>
        ) : null}

        <form className="task-form" onSubmit={save}>
          <label className="form-field details-span">
            <span>{t("task.title")}</span>
            <input
              onChange={(event) => {
                setTitle(event.target.value);
                markDirty();
              }}
              required
              value={title}
            />
          </label>
          <label className="form-field details-span">
            <span>{t("task.note")}</span>
            <textarea
              onChange={(event) => {
                setNote(event.target.value);
                markDirty();
              }}
              rows={4}
              value={note}
            />
          </label>
          <label className="form-field details-span">
            <span>{t("task.project")}</span>
            <select
              onChange={(event) => {
                setProjectId(event.target.value);
                setParentTaskId("");
                markDirty();
              }}
              value={projectId}
            >
              <option value="">{t("project.noProject")}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          {projectId.length === 0 ? null : (
            <label className="form-field details-span">
              <span>{t("task.workPackage")}</span>
              <select
                onChange={(event) => {
                  setParentTaskId(event.target.value);
                  markDirty();
                }}
                value={parentTaskId}
              >
                <option value="">{t("task.workPackageRoot")}</option>
                {workPackages.map((workPackage) => (
                  <option key={workPackage.id} value={workPackage.id}>
                    {workPackage.title}
                  </option>
                ))}
              </select>
              <small>{t("task.workPackageHint")}</small>
            </label>
          )}
          <label className="form-field">
            <span>{t("task.deadline")}</span>
            <input
              onChange={(event) => {
                setDeadlineAt(event.target.value);
                markDirty();
              }}
              type="date"
              value={deadlineAt}
            />
          </label>
          <label className="form-field">
            <span>{t(task.status === "WAITING" ? "task.followUpAt" : "task.reviewAt")}</span>
            <input
              onChange={(event) => {
                setReviewAt(event.target.value);
                markDirty();
              }}
              required={task.status === "WAITING"}
              type="date"
              value={reviewAt}
            />
            <small>
              {t(task.status === "WAITING" ? "task.followUpAtHint" : "task.reviewAtHint")}
            </small>
          </label>
          <label className="form-field">
            <span>{t("task.estimate")}</span>
            <input
              min="1"
              onChange={(event) => {
                setEstimateMinutes(event.target.value);
                markDirty();
              }}
              type="number"
              value={estimateMinutes}
            />
          </label>
          <label className="form-field">
            <span>{t("task.energy")}</span>
            <select
              onChange={(event) => {
                setEnergyLevel(event.target.value as EnergyLevel | "");
                markDirty();
              }}
              value={energyLevel}
            >
              <option value="">{t("capture.energyNone")}</option>
              <option value="LOW">{t("capture.energyLow")}</option>
              <option value="MEDIUM">{t("capture.energyMedium")}</option>
              <option value="HIGH">{t("capture.energyHigh")}</option>
            </select>
          </label>
          {task.status === "WAITING" ? (
            <label className="form-field details-span">
              <span>{t("task.waitingFor")}</span>
              <input
                onChange={(event) => {
                  setWaitingFor(event.target.value);
                  markDirty();
                }}
                placeholder={t("task.waitingForPlaceholder")}
                required
                value={waitingFor}
              />
              <small>{t("task.waitingForHint")}</small>
            </label>
          ) : null}

          {error.length > 0 ? <p className="form-error details-span">{error}</p> : null}

          <div className="drawer-form-actions details-span">
            {availableTransitions.includes("CANCELED") ? (
              <button
                className="button button-danger"
                disabled={submitting}
                onClick={() => void changeStatus("CANCELED")}
                type="button"
              >
                {t("task.abandon")}
              </button>
            ) : (
              <span />
            )}
            <div className="drawer-save-actions">
              <span aria-live="polite" className="save-status" role="status">
                {saved ? `✓ ${t("task.saved")}` : ""}
              </span>
              <button
                className="button button-primary"
                disabled={title.trim().length === 0 || submitting || !dirty}
                type="submit"
              >
                {submitting ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </div>
        </form>

        <section className="activity-section" aria-labelledby="activity-title">
          <h3 id="activity-title">{t("task.activity")}</h3>
          {events.length === 0 ? (
            <p className="muted">{t("task.noActivity")}</p>
          ) : (
            <ol className="activity-list">
              {events.map((event) => (
                <li key={event.id}>
                  <span className="activity-dot" aria-hidden="true" />
                  <div>
                    <strong>{t(`event.${event.type}`)}</strong>
                    <time dateTime={event.occurredAt}>
                      {formatter.format(new Date(event.occurredAt))}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}
