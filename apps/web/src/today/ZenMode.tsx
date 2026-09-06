import type { Task } from "@nextone/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { TodayTransitionStatus } from "./transitionFeedback";
import { addFocusedMinutes, resetFocusedMinutes } from "./focusReminder";
import { ResumeNote } from "../tasks/ResumeNote";

type ZenPhase = "SETUP" | "FOCUS" | "RECOVERY" | "BREAK";

export interface ZenPreferences {
  focusDurationMinutes: number;
  breakDurationMinutes: number;
  movementReminderMinutes: number;
  focusNotificationsEnabled: boolean;
}

interface ZenModeProps {
  task: Task;
  preferences: ZenPreferences;
  onClose(): void;
  onRecordFocus(durationMinutes: number, plannedMinutes?: number): Promise<void>;
  onTransition(status: Extract<TodayTransitionStatus, "READY" | "COMPLETED">): Promise<boolean>;
}

function formatClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ZenMode({ task, preferences, onClose, onRecordFocus, onTransition }: ZenModeProps) {
  const { t } = useTranslation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const startedAtRef = useRef(0);
  const elapsedBeforeStartRef = useRef(0);
  const finishingRef = useRef(false);
  const sessionRecordedRef = useRef(false);
  const exitHandlerRef = useRef<() => void>(() => onClose());
  const [phase, setPhase] = useState<ZenPhase>("SETUP");
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(
    preferences.focusDurationMinutes,
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [movementDue, setMovementDue] = useState(false);
  const [recordedMinutes, setRecordedMinutes] = useState(0);
  const [recordedSessionCount, setRecordedSessionCount] = useState(0);
  const [recordedTotalMinutes, setRecordedTotalMinutes] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const durationOptions = useMemo(
    () => [...new Set([preferences.focusDurationMinutes, 25, 50])].sort((a, b) => a - b),
    [preferences.focusDurationMinutes],
  );
  const timerDurationSeconds =
    phase === "BREAK"
      ? preferences.breakDurationMinutes * 60
      : selectedMinutes === null
        ? undefined
        : selectedMinutes * 60;
  const displaySeconds =
    timerDurationSeconds === undefined
      ? elapsedSeconds
      : Math.max(0, timerDurationSeconds - elapsedSeconds);

  const notify = (title: string, body: string) => {
    if (
      preferences.focusNotificationsEnabled &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification(title, { body });
    }
  };

  const requestNotifications = () => {
    if (
      preferences.focusNotificationsEnabled &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission();
    }
  };

  const startClock = (nextPhase: Extract<ZenPhase, "FOCUS" | "BREAK">) => {
    sessionRecordedRef.current = false;
    requestNotifications();
    setPhase(nextPhase);
    setElapsedSeconds(0);
    elapsedBeforeStartRef.current = 0;
    startedAtRef.current = Date.now();
    setRunning(true);
    setFailed(false);
  };

  const persistFocus = async (durationMinutes: number, plannedMinutes?: number) => {
    if (sessionRecordedRef.current) return;
    await onRecordFocus(durationMinutes, plannedMinutes);
    sessionRecordedRef.current = true;
    const reminder = addFocusedMinutes(durationMinutes, preferences.movementReminderMinutes);
    setMovementDue(reminder.movementDue);
    setRecordedMinutes(durationMinutes);
    setRecordedSessionCount((current) => current + 1);
    setRecordedTotalMinutes((current) => current + durationMinutes);
  };

  const completeFocus = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setRunning(false);
    setSubmitting(true);
    setFailed(false);
    const durationMinutes = selectedMinutes ?? Math.max(1, Math.round(elapsedSeconds / 60));
    try {
      await persistFocus(durationMinutes, selectedMinutes ?? undefined);
      setPhase("RECOVERY");
      notify(
        t("zen.focusCompleteNotification"),
        t("zen.focusCompleteNotificationBody", { title: task.title }),
      );
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
      finishingRef.current = false;
    }
  };

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") exitHandlerRef.current();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const update = () =>
      setElapsedSeconds(
        elapsedBeforeStartRef.current + Math.floor((Date.now() - startedAtRef.current) / 1000),
      );
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (!running || timerDurationSeconds === undefined || elapsedSeconds < timerDurationSeconds)
      return;
    if (phase === "FOCUS") {
      void completeFocus();
      return;
    }
    setRunning(false);
    setPhase("SETUP");
    setElapsedSeconds(0);
    notify(t("zen.breakCompleteNotification"), t("zen.breakCompleteNotificationBody"));
  }, [elapsedSeconds, phase, running, timerDurationSeconds]);

  useEffect(() => {
    const previousTitle = document.title;
    if (phase === "FOCUS" || phase === "BREAK")
      document.title = `${formatClock(displaySeconds)} · ${task.title}`;
    return () => {
      document.title = previousTitle;
    };
  }, [displaySeconds, phase, task.title]);

  const toggleTimer = () => {
    if (running) {
      elapsedBeforeStartRef.current = elapsedSeconds;
      setRunning(false);
      return;
    }
    startedAtRef.current = Date.now();
    setRunning(true);
  };

  const finishEarly = async () => {
    if (elapsedSeconds < 60) {
      setPhase("RECOVERY");
      setRecordedMinutes(0);
      setRunning(false);
      return;
    }
    await completeFocus();
  };

  const handleExit = async () => {
    if (phase !== "FOCUS" || elapsedSeconds < 60) {
      onClose();
      return;
    }
    if (!window.confirm(t("zen.exitConfirm"))) return;
    setSubmitting(true);
    try {
      await persistFocus(
        Math.max(1, Math.round(elapsedSeconds / 60)),
        selectedMinutes ?? undefined,
      );
      onClose();
    } catch {
      setFailed(true);
      setSubmitting(false);
    }
  };
  exitHandlerRef.current = () => void handleExit();

  const transition = async (status: Extract<TodayTransitionStatus, "READY" | "COMPLETED">) => {
    if (submitting) return;
    setSubmitting(true);
    setFailed(false);
    const wasRunning = running;
    elapsedBeforeStartRef.current = elapsedSeconds;
    setRunning(false);
    try {
      // Confirm the optional handoff first. Canceling must not record a focus session.
      if (status === "READY" && !(await onTransition(status))) {
        startedAtRef.current = Date.now();
        setRunning(wasRunning);
        setSubmitting(false);
        return;
      }
      if (phase === "FOCUS" && elapsedSeconds >= 60) {
        await persistFocus(
          Math.max(1, Math.round(elapsedSeconds / 60)),
          selectedMinutes ?? undefined,
        );
      }
      if (status === "READY" || (await onTransition(status))) onClose();
      else setSubmitting(false);
    } catch {
      setFailed(true);
      setSubmitting(false);
    }
  };

  const totalSessions = (task.focusSessionCount ?? 0) + recordedSessionCount;
  const totalMinutes = (task.focusMinutes ?? 0) + recordedTotalMinutes;

  return (
    <section aria-labelledby="zen-title" aria-modal="true" className="zen-mode" role="dialog">
      <button
        aria-label={t("zen.exit")}
        className="zen-exit"
        disabled={submitting}
        onClick={() => void handleExit()}
        ref={closeButtonRef}
        type="button"
      >
        {t("zen.exit")}
      </button>
      <div className="zen-content">
        <p className="zen-eyebrow">{t("zen.eyebrow")}</p>
        <h2 id="zen-title">{task.title}</h2>

        {phase === "SETUP" ? (
          <div className="zen-session-panel">
            <div>
              <h3>{t("zen.setupTitle")}</h3>
              <p>{t("zen.setupHint")}</p>
            </div>
            <div aria-label={t("zen.setupTitle")} className="zen-duration-options" role="group">
              {durationOptions.map((minutes) => (
                <button
                  aria-pressed={selectedMinutes === minutes}
                  className="zen-duration-option"
                  key={minutes}
                  onClick={() => setSelectedMinutes(minutes)}
                  type="button"
                >
                  {t("zen.preferredDuration", { count: minutes })}
                </button>
              ))}
              <button
                aria-pressed={selectedMinutes === null}
                className="zen-duration-option"
                onClick={() => setSelectedMinutes(null)}
                type="button"
              >
                {t("zen.untimed")}
              </button>
            </div>
            <button
              className="button button-primary zen-start"
              onClick={() => startClock("FOCUS")}
              type="button"
            >
              {t("zen.startSession")}
            </button>
          </div>
        ) : null}

        {phase === "FOCUS" || phase === "BREAK" ? (
          <div className="zen-timer-panel">
            <span>
              {t(
                phase === "BREAK"
                  ? "zen.breakTimerLabel"
                  : selectedMinutes === null
                    ? "zen.elapsedLabel"
                    : "zen.timerLabel",
              )}
            </span>
            <strong aria-live="off" role="timer">
              {formatClock(displaySeconds)}
            </strong>
            {phase === "FOCUS" ? (
              <div className="zen-timer-actions">
                <button className="button button-quiet" onClick={toggleTimer} type="button">
                  {t(running ? "zen.pauseTimer" : "zen.resumeTimer")}
                </button>
                <button
                  className="button button-outline"
                  onClick={() => void finishEarly()}
                  type="button"
                >
                  {t("zen.finishSession")}
                </button>
              </div>
            ) : (
              <button
                className="button button-quiet"
                onClick={() => {
                  setRunning(false);
                  setPhase("SETUP");
                  setElapsedSeconds(0);
                }}
                type="button"
              >
                {t("zen.skipBreak")}
              </button>
            )}
          </div>
        ) : null}

        {phase === "RECOVERY" ? (
          <div className="zen-session-panel zen-recovery">
            <div>
              <h3>{t(movementDue ? "zen.movementTitle" : "zen.breakTitle")}</h3>
              <p>{t(movementDue ? "zen.movementHint" : "zen.breakHint")}</p>
              {recordedMinutes > 0 ? (
                <span className="zen-recorded">
                  {t("zen.sessionRecorded", { count: recordedMinutes })}
                </span>
              ) : null}
            </div>
            {movementDue ? (
              <button
                className="button button-primary"
                onClick={() => {
                  resetFocusedMinutes();
                  setMovementDue(false);
                }}
                type="button"
              >
                {t("zen.movementDone")}
              </button>
            ) : (
              <button
                className="button button-primary"
                onClick={() => startClock("BREAK")}
                type="button"
              >
                {t("zen.startBreak", { count: preferences.breakDurationMinutes })}
              </button>
            )}
            <button
              className="button button-quiet"
              onClick={() => {
                setPhase("SETUP");
                setElapsedSeconds(0);
                setRecordedMinutes(0);
              }}
              type="button"
            >
              {t("zen.nextSession")}
            </button>
          </div>
        ) : null}

        <ResumeNote task={task} />
        {task.note === undefined ? (
          <p className="zen-note">{t("zen.noNote")}</p>
        ) : (
          <p className="zen-note">{task.note}</p>
        )}
        <p className="zen-focus-total">
          {totalSessions === 0
            ? t("zen.noRecordedTime")
            : t("zen.totalRecorded", { sessions: totalSessions, minutes: totalMinutes })}
        </p>
        {failed ? (
          <p className="zen-error" role="alert">
            {t("zen.recordFailed")}
          </p>
        ) : null}
        <div className="zen-task-actions">
          <span>{t("zen.taskActions")}</span>
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
      </div>
    </section>
  );
}
