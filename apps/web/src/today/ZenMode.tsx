import type { Task } from "@nextone/domain";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { TodayTransitionStatus } from "./transitionFeedback";

interface ZenModeProps {
  task: Task;
  onClose(): void;
  onTransition(status: Extract<TodayTransitionStatus, "READY" | "COMPLETED">): Promise<boolean>;
}

export function ZenMode({ task, onClose, onTransition }: ZenModeProps) {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const transition = async (status: Extract<TodayTransitionStatus, "READY" | "COMPLETED">) => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setFailed(false);
    const succeeded = await onTransition(status);
    if (succeeded) {
      onClose();
      return;
    }
    setFailed(true);
    setSubmitting(false);
  };

  return (
    <section aria-labelledby="zen-title" aria-modal="true" className="zen-mode" role="dialog">
      <button
        aria-label={t("zen.exit")}
        className="zen-exit"
        disabled={submitting}
        onClick={onClose}
        ref={closeButtonRef}
        type="button"
      >
        {t("zen.exit")}
      </button>
      <div className="zen-content">
        <p className="zen-eyebrow">{t("zen.eyebrow")}</p>
        <h2 id="zen-title">{task.title}</h2>
        <p className="zen-state-hint">{t("zen.stateHint")}</p>
        {task.note === undefined ? (
          <p className="zen-note">{t("zen.noNote")}</p>
        ) : (
          <p className="zen-note">{task.note}</p>
        )}
        {task.estimateMinutes === undefined ? null : (
          <span className="zen-estimate">{t("zen.estimate", { count: task.estimateMinutes })}</span>
        )}
        {failed ? (
          <p className="zen-error" role="alert">
            {t("zen.transitionFailed")}
          </p>
        ) : null}
        <div className="zen-actions">
          <button
            className="button zen-pause"
            disabled={submitting}
            onClick={() => void transition("READY")}
            type="button"
          >
            {t("zen.pause")}
          </button>
          <button
            className="button button-primary zen-complete"
            disabled={submitting}
            onClick={() => void transition("COMPLETED")}
            type="button"
          >
            {t("zen.complete")}
          </button>
        </div>
      </div>
    </section>
  );
}
