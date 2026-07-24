import {
  allowedTaskTransitions,
  type EnergyLevel,
  type Task,
  type TaskEvent,
  type TaskStatus,
} from "@nextone/domain";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { notifyTasksChanged, taskApplicationService } from "./taskService";

interface TaskDrawerProps {
  task: Task;
  onClose: () => void;
  onTaskChanged: (task: Task) => void;
}

export function TaskDrawer({ task, onClose, onTaskChanged }: TaskDrawerProps) {
  const { i18n, t } = useTranslation();
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");
  const [deadlineAt, setDeadlineAt] = useState(task.deadlineAt ?? "");
  const [reviewAt, setReviewAt] = useState(task.reviewAt ?? "");
  const [estimateMinutes, setEstimateMinutes] = useState(task.estimateMinutes?.toString() ?? "");
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | "">(task.energyLevel ?? "");
  const [waitingFor, setWaitingFor] = useState(task.waitingFor ?? "");
  const [events, setEvents] = useState<readonly TaskEvent[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const loadEvents = async () => {
    setEvents(await taskApplicationService.listTaskEvents(task.id));
  };

  useEffect(() => {
    setTitle(task.title);
    setNote(task.note ?? "");
    setDeadlineAt(task.deadlineAt ?? "");
    setReviewAt(task.reviewAt ?? "");
    setEstimateMinutes(task.estimateMinutes?.toString() ?? "");
    setEnergyLevel(task.energyLevel ?? "");
    setWaitingFor(task.waitingFor ?? "");
    void loadEvents();
  }, [task]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const updated = await taskApplicationService.updateDetails(task.id, {
        title,
        note: note.trim().length === 0 ? null : note,
        deadlineAt: deadlineAt.length === 0 ? null : deadlineAt,
        reviewAt: reviewAt.length === 0 ? null : reviewAt,
        estimateMinutes: estimateMinutes.length === 0 ? null : Number.parseInt(estimateMinutes, 10),
        energyLevel: energyLevel === "" ? null : energyLevel,
        waitingFor: waitingFor.trim().length === 0 ? null : waitingFor,
      });
      onTaskChanged(updated);
      notifyTasksChanged();
      await loadEvents();
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

    setSubmitting(true);
    setError("");

    try {
      const updated = await taskApplicationService.transition(task.id, status);
      onTaskChanged(updated);
      notifyTasksChanged();
      await loadEvents();
    } catch {
      setError(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const availableTransitions = [...allowedTaskTransitions[task.status]];
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
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
            onClick={onClose}
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
            {availableTransitions
              .filter((status) => status !== "CANCELED")
              .map((status) => (
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
          </div>
        </div>

        <form className="task-form" onSubmit={save}>
          <label className="form-field details-span">
            <span>{t("task.title")}</span>
            <input onChange={(event) => setTitle(event.target.value)} required value={title} />
          </label>
          <label className="form-field details-span">
            <span>{t("task.note")}</span>
            <textarea onChange={(event) => setNote(event.target.value)} rows={4} value={note} />
          </label>
          <label className="form-field">
            <span>{t("task.deadline")}</span>
            <input
              onChange={(event) => setDeadlineAt(event.target.value)}
              type="date"
              value={deadlineAt}
            />
          </label>
          <label className="form-field">
            <span>{t("task.reviewAt")}</span>
            <input
              onChange={(event) => setReviewAt(event.target.value)}
              type="date"
              value={reviewAt}
            />
          </label>
          <label className="form-field">
            <span>{t("task.estimate")}</span>
            <input
              min="1"
              onChange={(event) => setEstimateMinutes(event.target.value)}
              type="number"
              value={estimateMinutes}
            />
          </label>
          <label className="form-field">
            <span>{t("task.energy")}</span>
            <select
              onChange={(event) => setEnergyLevel(event.target.value as EnergyLevel | "")}
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
              <input onChange={(event) => setWaitingFor(event.target.value)} value={waitingFor} />
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
            <button
              className="button button-primary"
              disabled={title.trim().length === 0 || submitting}
              type="submit"
            >
              {submitting ? t("common.saving") : t("common.save")}
            </button>
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
