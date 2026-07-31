import type { Task } from "@nextone/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { DailyCapacity } from "./DailyCapacity";

interface MorningKickoffProps {
  candidates: readonly Task[];
  capacityMinutes: number;
  focusLimit: number;
  onDismiss(): void;
  onStart(tasks: readonly Task[]): Promise<void>;
}

export function MorningKickoff({
  candidates,
  capacityMinutes,
  focusLimit,
  onDismiss,
  onStart,
}: MorningKickoffProps) {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const selectedTasks = useMemo(
    () => candidates.filter((task) => selectedIds.has(task.id)),
    [candidates, selectedIds],
  );

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onDismiss]);

  const toggle = (taskId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else if (next.size < focusLimit) {
        next.add(taskId);
      }
      return next;
    });
  };

  const start = async () => {
    setStarting(true);
    try {
      await onStart(selectedTasks);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="ritual-backdrop" role="presentation">
      <section
        aria-labelledby="kickoff-title"
        aria-modal="true"
        className="kickoff-dialog"
        role="dialog"
      >
        <header className="ritual-header">
          <div>
            <span className="ritual-step">{t("kickoff.step", { current: step })}</span>
            <h2 id="kickoff-title">
              {step === 1 ? t("kickoff.chooseTitle") : t("kickoff.confirmTitle")}
            </h2>
            <p>
              {step === 1
                ? t("kickoff.chooseDescription", { limit: focusLimit })
                : t("kickoff.confirmDescription")}
            </p>
          </div>
          <button
            aria-label={t("common.close")}
            className="ritual-close"
            onClick={onDismiss}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </header>

        {step === 1 ? (
          <div className="kickoff-candidates">
            {candidates.map((task) => {
              const selected = selectedIds.has(task.id);
              return (
                <button
                  aria-checked={selected}
                  className={`kickoff-candidate${selected ? " kickoff-candidate-selected" : ""}`}
                  key={task.id}
                  onClick={() => toggle(task.id)}
                  role="checkbox"
                  type="button"
                >
                  <span className="kickoff-check" aria-hidden="true">
                    {selected ? "✓" : ""}
                  </span>
                  <span>
                    <strong>{task.title}</strong>
                    <small>
                      {t(`status.${task.status}`)}
                      {task.estimateMinutes === undefined
                        ? ` · ${t("capacity.noEstimate")}`
                        : ` · ${t("today.minutes", { count: task.estimateMinutes })}`}
                      {task.energyLevel === undefined
                        ? ""
                        : ` · ${t(
                            `capture.energy${
                              task.energyLevel === "LOW"
                                ? "Low"
                                : task.energyLevel === "MEDIUM"
                                  ? "Medium"
                                  : "High"
                            }`,
                          )}`}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="kickoff-confirm">
            <ol>
              {selectedTasks.map((task) => (
                <li key={task.id}>
                  <span>{task.title}</span>
                  <small>
                    {task.estimateMinutes === undefined
                      ? t("capacity.noEstimate")
                      : t("today.minutes", { count: task.estimateMinutes })}
                    {task.energyLevel === undefined
                      ? null
                      : ` · ${t(
                          `capture.energy${
                            task.energyLevel === "LOW"
                              ? "Low"
                              : task.energyLevel === "MEDIUM"
                                ? "Medium"
                                : "High"
                          }`,
                        )}`}
                  </small>
                </li>
              ))}
            </ol>
            <DailyCapacity capacityMinutes={capacityMinutes} tasks={selectedTasks} />
          </div>
        )}

        <footer className="ritual-actions">
          <button className="button button-quiet" onClick={onDismiss} type="button">
            {t("kickoff.later")}
          </button>
          <div>
            {step === 2 ? (
              <button className="button button-quiet" onClick={() => setStep(1)} type="button">
                {t("kickoff.back")}
              </button>
            ) : null}
            {step === 1 ? (
              <button
                className="button button-primary"
                disabled={selectedIds.size === 0}
                onClick={() => setStep(2)}
                type="button"
              >
                {t("kickoff.continue", { count: selectedIds.size })}
              </button>
            ) : (
              <button
                className="button button-primary"
                disabled={starting}
                onClick={() => void start()}
                type="button"
              >
                {starting ? t("common.saving") : t("kickoff.start")}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
