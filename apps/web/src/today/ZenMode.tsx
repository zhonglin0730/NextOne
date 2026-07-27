import type { Task, TaskStatus } from "@nextone/domain";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface ZenModeProps {
  task: Task;
  onClose(): void;
  onTransition(status: TaskStatus): Promise<void>;
}

export function ZenMode({ task, onClose, onTransition }: ZenModeProps) {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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

  const transition = async (status: TaskStatus) => {
    await onTransition(status);
    onClose();
  };

  return (
    <section aria-labelledby="zen-title" aria-modal="true" className="zen-mode" role="dialog">
      <button
        aria-label={t("zen.exit")}
        className="zen-exit"
        onClick={onClose}
        ref={closeButtonRef}
        type="button"
      >
        {t("zen.exit")}
      </button>
      <div className="zen-content">
        <p className="zen-eyebrow">{t("zen.eyebrow")}</p>
        <h2 id="zen-title">{task.title}</h2>
        {task.note === undefined ? (
          <p className="zen-note">{t("zen.noNote")}</p>
        ) : (
          <p className="zen-note">{task.note}</p>
        )}
        {task.estimateMinutes === undefined ? null : (
          <span className="zen-estimate">{t("zen.estimate", { count: task.estimateMinutes })}</span>
        )}
        <div className="zen-actions">
          <button
            className="button zen-pause"
            onClick={() => void transition("READY")}
            type="button"
          >
            {t("action.pause")}
          </button>
          <button
            className="button button-primary zen-complete"
            onClick={() => void transition("COMPLETED")}
            type="button"
          >
            {t("action.COMPLETED")}
          </button>
        </div>
      </div>
    </section>
  );
}
