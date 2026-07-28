import type { EnergyLevel, Project } from "@nextone/domain";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { getLocalDate, getTimeZone } from "../today/date";
import {
  notifyTasksChanged,
  projectApplicationService,
  taskApplicationService,
} from "./taskService";

interface CaptureDialogProps {
  defaultDestination: CaptureDestination;
  open: boolean;
  onClose: () => void;
}

type CaptureDestination = "INBOX" | "TODAY";

export function CaptureDialog({ defaultDestination, open, onClose }: CaptureDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [projectId, setProjectId] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [reviewAt, setReviewAt] = useState("");
  const [estimateMinutes, setEstimateMinutes] = useState("");
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | "">("");
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [destination, setDestination] = useState<CaptureDestination>(defaultDestination);
  const [capturedTaskId, setCapturedTaskId] = useState<string>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setNote("");
      setProjectId("");
      setDeadlineAt("");
      setReviewAt("");
      setEstimateMinutes("");
      setEnergyLevel("");
      setDestination(defaultDestination);
      setCapturedTaskId(undefined);
      setError("");
      void projectApplicationService.listProjects("ACTIVE").then(setProjects);
    }
  }, [defaultDestination, open]);

  if (!open) {
    return null;
  }

  const submit = async () => {
    if (title.trim().length === 0 || submitting) {
      return;
    }

    setSubmitting(true);
    setError("");
    let taskWasCaptured = capturedTaskId !== undefined;

    try {
      let taskId = capturedTaskId;
      if (taskId === undefined) {
        const task = await taskApplicationService.capture({
          title,
          ...(note.trim().length === 0 ? {} : { note }),
          ...(projectId.length === 0 ? {} : { projectId }),
          ...(deadlineAt.length === 0 ? {} : { deadlineAt }),
          ...(reviewAt.length === 0 ? {} : { reviewAt }),
          ...(estimateMinutes.length === 0
            ? {}
            : { estimateMinutes: Number.parseInt(estimateMinutes, 10) }),
          ...(energyLevel === "" ? {} : { energyLevel }),
        });
        taskId = task.id;
        taskWasCaptured = true;
        setCapturedTaskId(task.id);
      }
      if (destination === "TODAY") {
        await taskApplicationService.addToToday(taskId, getLocalDate(), getTimeZone());
      }
      notifyTasksChanged();
      onClose();
    } catch {
      setError(
        taskWasCaptured && destination === "TODAY" ? t("capture.todayFallback") : t("common.error"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="capture-title"
        aria-modal="true"
        className="capture-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id="capture-title">
            {t(destination === "TODAY" ? "capture.todayTitle" : "capture.title")}
          </h2>
          <button
            aria-label={t("common.close")}
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <fieldset className="capture-destination">
            <legend>{t("capture.destination")}</legend>
            <label>
              <input
                checked={destination === "TODAY"}
                onChange={() => setDestination("TODAY")}
                type="radio"
              />
              <span>{t("capture.destinationToday")}</span>
            </label>
            <label>
              <input
                checked={destination === "INBOX"}
                onChange={() => setDestination("INBOX")}
                type="radio"
              />
              <span>{t("capture.destinationInbox")}</span>
            </label>
          </fieldset>
          <textarea
            autoFocus
            className="capture-title-input"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder={t("capture.placeholder")}
            rows={3}
            value={title}
          />
          <p className="field-hint">
            {t(destination === "TODAY" ? "capture.todayHint" : "capture.hint")}
          </p>

          <details className="capture-details">
            <summary>{t("capture.details")}</summary>
            <div className="details-grid">
              <label className="form-field details-span">
                <span>{t("capture.note")}</span>
                <textarea
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t("capture.notePlaceholder")}
                  rows={3}
                  value={note}
                />
              </label>
              <label className="form-field details-span">
                <span>{t("task.project")}</span>
                <select onChange={(event) => setProjectId(event.target.value)} value={projectId}>
                  <option value="">{t("project.noProject")}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>{t("capture.deadline")}</span>
                <input
                  onChange={(event) => setDeadlineAt(event.target.value)}
                  type="date"
                  value={deadlineAt}
                />
              </label>
              <label className="form-field">
                <span>{t("capture.reviewAt")}</span>
                <input
                  onChange={(event) => setReviewAt(event.target.value)}
                  type="date"
                  value={reviewAt}
                />
              </label>
              <label className="form-field">
                <span>{t("capture.estimate")}</span>
                <input
                  min="1"
                  onChange={(event) => setEstimateMinutes(event.target.value)}
                  type="number"
                  value={estimateMinutes}
                />
              </label>
              <label className="form-field">
                <span>{t("capture.energy")}</span>
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
            </div>
          </details>

          {error.length > 0 ? <p className="form-error">{error}</p> : null}

          <footer className="dialog-actions">
            <button className="button button-secondary" onClick={onClose} type="button">
              {t("common.cancel")}
            </button>
            <button
              className="button button-primary"
              disabled={title.trim().length === 0 || submitting}
              type="submit"
            >
              {submitting
                ? t("common.saving")
                : t(destination === "TODAY" ? "capture.submitToday" : "capture.submit")}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
