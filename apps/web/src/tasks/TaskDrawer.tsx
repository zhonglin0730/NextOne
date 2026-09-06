import {
  allowedTaskTransitions,
  type EnergyLevel,
  type Project,
  type Task,
  type TaskEvent,
  type TaskStatus,
  type WorkPackage,
} from "@nextone/domain";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { getDateOnly, getLocalDate, getTimeZone } from "../today/date";
import { transitionWithWipConfirmation } from "./taskActions";
import { ResumeNote } from "./ResumeNote";
import {
  notifyTasksChanged,
  projectApplicationService,
  taskApplicationService,
} from "./taskService";

interface TaskDrawerProps {
  task: Task;
  initialAction?: "WAITING" | undefined;
  onClose: () => void;
  onTaskChanged: (task: Task) => void | Promise<void>;
}

const primaryTaskActions: Readonly<Record<TaskStatus, { labelKey: string; status: TaskStatus }>> = {
  INBOX: { labelKey: "inbox.clarify", status: "READY" },
  READY: { labelKey: "action.DOING", status: "DOING" },
  DOING: { labelKey: "action.COMPLETED", status: "COMPLETED" },
  WAITING: { labelKey: "board.resumeDoing", status: "DOING" },
  COMPLETED: { labelKey: "board.reopen", status: "READY" },
  CANCELED: { labelKey: "board.reopen", status: "READY" },
};

export function TaskDrawer({ task, initialAction, onClose, onTaskChanged }: TaskDrawerProps) {
  const { i18n, t } = useTranslation();
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [workPackageId, setWorkPackageId] = useState(task.workPackageId ?? "");
  const [deadlineAt, setDeadlineAt] = useState(getDateOnly(task.deadlineAt));
  const [reviewAt, setReviewAt] = useState(getDateOnly(task.reviewAt));
  const [estimateMinutes, setEstimateMinutes] = useState(task.estimateMinutes?.toString() ?? "");
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | "">(task.energyLevel ?? "");
  const [waitingFor, setWaitingFor] = useState(task.waitingFor ?? "");
  const [events, setEvents] = useState<readonly TaskEvent[]>([]);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [workPackages, setWorkPackages] = useState<readonly WorkPackage[]>([]);
  const [addedToday, setAddedToday] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [waitingIntent, setWaitingIntent] = useState(
    initialAction === "WAITING" && task.status !== "WAITING",
  );
  const isWaitingForm = task.status === "WAITING" || waitingIntent;

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
    setWorkPackageId(task.workPackageId ?? "");
    setDeadlineAt(getDateOnly(task.deadlineAt));
    setReviewAt(getDateOnly(task.reviewAt));
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
    void taskApplicationService.listProjectWorkPackages(projectId).then(setWorkPackages);
  }, [projectId, task.id]);

  useEffect(() => {
    setDirty(false);
    setSaved(false);
  }, [task.id]);

  useEffect(() => {
    const shouldWait = initialAction === "WAITING" && task.status !== "WAITING";
    setWaitingIntent(shouldWait);
    setPlanningOpen(false);
  }, [initialAction, task.id, task.status]);

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

    if (isWaitingForm && (waitingFor.trim().length === 0 || reviewAt.length === 0)) {
      setError(t("task.waitingDetailsMissing"));
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      let updated = await taskApplicationService.updateDetails(task.id, {
        title,
        note: note.trim().length === 0 ? null : note,
        projectId: projectId.length === 0 ? null : projectId,
        workPackageId: workPackageId.length === 0 ? null : workPackageId,
        deadlineAt: deadlineAt.length === 0 ? null : deadlineAt,
        reviewAt: reviewAt.length === 0 ? null : reviewAt,
        estimateMinutes: estimateMinutes.length === 0 ? null : Number.parseInt(estimateMinutes, 10),
        energyLevel: energyLevel === "" ? null : energyLevel,
        waitingFor: waitingFor.trim().length === 0 ? null : waitingFor,
      });
      if (waitingIntent) {
        const waitingTask = await transitionWithWipConfirmation(
          updated.id,
          "WAITING",
          () => false,
          false,
        );
        if (waitingTask === undefined) {
          return;
        }
        updated = waitingTask;
        setWaitingIntent(false);
        setAddedToday(false);
      }
      await onTaskChanged(updated);
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
    if (status === "WAITING") {
      setWaitingIntent(true);
      setSaved(false);
      setError("");
      return;
    }
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
      setWaitingIntent(false);
      await onTaskChanged(updated);
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
  const primaryAction = primaryTaskActions[task.status];
  const secondaryTransitions = visibleTransitions.filter(
    (status) => status !== primaryAction.status,
  );
  const canAddToday = task.status === "READY" || task.status === "DOING";
  const canCancel = availableTransitions.includes("CANCELED");
  const hasMoreActions = canAddToday || canCancel || secondaryTransitions.length > 0;
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
          {waitingIntent ? null : (
            <div className="status-actions">
              <button
                className="button button-primary"
                disabled={submitting}
                onClick={() => void changeStatus(primaryAction.status)}
                type="button"
              >
                {t(primaryAction.labelKey)}
              </button>
              {hasMoreActions ? (
                <details className="task-more-actions">
                  <summary aria-label={t("board.moreActionsFor", { title: task.title })}>
                    {t("board.moreActions")}
                  </summary>
                  <div className="status-actions">
                    {canAddToday && !addedToday ? (
                      <button
                        className="button button-quiet"
                        disabled={submitting}
                        onClick={() => void addToday()}
                        type="button"
                      >
                        {t("task.addToday")}
                      </button>
                    ) : null}
                    {secondaryTransitions.map((status) => (
                      <button
                        className="button button-quiet"
                        disabled={submitting}
                        key={status}
                        onClick={() => void changeStatus(status)}
                        type="button"
                      >
                        {t(`action.${status}`)}
                      </button>
                    ))}
                    {canCancel ? (
                      <button
                        className="button button-danger"
                        disabled={submitting}
                        onClick={() => void changeStatus("CANCELED")}
                        type="button"
                      >
                        {t("task.abandon")}
                      </button>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>
          )}
        </div>

        <ResumeNote task={task} editable />
        {(task.focusSessionCount ?? 0) > 0 ? (
          <p className="task-focus-summary">
            {t("task.focusSummary", {
              sessions: task.focusSessionCount ?? 0,
              minutes: task.focusMinutes ?? 0,
            })}
          </p>
        ) : null}

        {isWaitingForm ? (
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
                setWorkPackageId("");
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
          {isWaitingForm ? (
            <div className="details-grid waiting-details-fields details-span">
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
              <label className="form-field details-span">
                <span>{t("task.followUpAt")}</span>
                <input
                  aria-required="true"
                  min={getLocalDate()}
                  onChange={(event) => {
                    setReviewAt(event.target.value);
                    markDirty();
                  }}
                  required
                  type="date"
                  value={reviewAt}
                />
                <small>{t("task.followUpAtHint")}</small>
              </label>
            </div>
          ) : null}
          <details
            className="task-advanced details-span"
            onToggle={(event) => setPlanningOpen(event.currentTarget.open)}
            open={planningOpen}
          >
            <summary>{t("capture.advanced")}</summary>
            <div className="details-grid">
              {projectId.length === 0 ? null : (
                <label className="form-field details-span">
                  <span>{t("task.workPackage")}</span>
                  <select
                    onChange={(event) => {
                      setWorkPackageId(event.target.value);
                      markDirty();
                    }}
                    value={workPackageId}
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
              {isWaitingForm ? null : (
                <label className="form-field">
                  <span>{t("task.reviewAt")}</span>
                  <input
                    onChange={(event) => {
                      setReviewAt(event.target.value);
                      markDirty();
                    }}
                    type="date"
                    value={reviewAt}
                  />
                  <small>{t("task.reviewAtHint")}</small>
                </label>
              )}
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
                <small>{t("task.estimateHint")}</small>
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
                <small>{t("task.energyHint")}</small>
              </label>
            </div>
          </details>
          {error.length > 0 ? <p className="form-error details-span">{error}</p> : null}

          <div className="drawer-form-actions details-span">
            <span />
            <div className="drawer-save-actions">
              <span aria-live="polite" className="save-status" role="status">
                {saved ? `✓ ${t("task.saved")}` : ""}
              </span>
              <button
                className="button button-primary"
                disabled={
                  title.trim().length === 0 ||
                  submitting ||
                  (!dirty && !waitingIntent) ||
                  (isWaitingForm && (waitingFor.trim().length === 0 || reviewAt.length === 0))
                }
                type="submit"
              >
                {submitting
                  ? t("common.saving")
                  : waitingIntent
                    ? t("task.confirmWaiting")
                    : t("common.save")}
              </button>
            </div>
          </div>
        </form>

        <details className="activity-section task-advanced">
          <summary id="activity-title">{t("task.activity")}</summary>
          {events.length === 0 ? (
            <p className="muted">{t("task.noActivity")}</p>
          ) : (
            <ol className="activity-list">
              {events.map((event) => (
                <li key={event.id}>
                  <span className="activity-dot" aria-hidden="true" />
                  <div>
                    <strong>{t(`event.${event.type}`)}</strong>
                    {event.type === "FOCUS_SESSION_COMPLETED" &&
                    event.metadata.durationMinutes !== undefined ? (
                      <span>
                        {t("task.focusEventDuration", {
                          count: event.metadata.durationMinutes,
                        })}
                      </span>
                    ) : null}
                    <time dateTime={event.occurredAt}>
                      {formatter.format(new Date(event.occurredAt))}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </details>
      </aside>
    </div>
  );
}
