import type { EnergyLevel } from "@nextone/domain";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { notifyTasksChanged, taskApplicationService } from "./taskService";

interface CaptureDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CaptureDialog({ open, onClose }: CaptureDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [reviewAt, setReviewAt] = useState("");
  const [estimateMinutes, setEstimateMinutes] = useState("");
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setNote("");
      setDeadlineAt("");
      setReviewAt("");
      setEstimateMinutes("");
      setEnergyLevel("");
      setError("");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const submit = async () => {
    if (title.trim().length === 0 || submitting) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await taskApplicationService.capture({
        title,
        ...(note.trim().length === 0 ? {} : { note }),
        ...(deadlineAt.length === 0 ? {} : { deadlineAt }),
        ...(reviewAt.length === 0 ? {} : { reviewAt }),
        ...(estimateMinutes.length === 0
          ? {}
          : { estimateMinutes: Number.parseInt(estimateMinutes, 10) }),
        ...(energyLevel === "" ? {} : { energyLevel }),
      });
      notifyTasksChanged();
      onClose();
    } catch {
      setError(t("common.error"));
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
          <h2 id="capture-title">{t("capture.title")}</h2>
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
          <textarea
            autoFocus
            className="capture-title-input"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder={t("capture.placeholder")}
            rows={3}
            value={title}
          />
          <p className="field-hint">{t("capture.hint")}</p>

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
              {submitting ? t("common.saving") : t("capture.submit")}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
