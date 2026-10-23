import type { Task } from "@nextone/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { TodayTransitionStatus } from "./transitionFeedback";
import { addFocusedMinutes, resetFocusedMinutes } from "./focusReminder";
import { ResumeNote } from "../tasks/ResumeNote";
import { AmbientSound } from "./AmbientSound";
import { projectApplicationService } from "../tasks/taskService";
import { FocusClock, recordedFocusMinutes } from "./focusClock";

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
  const roomRef = useRef<HTMLElement>(null);
  const [projectName, setProjectName] = useState("");
  const [clock] = useState(() => new FocusClock());
  const finishingRef = useRef(false);
  const pendingSaveRef = useRef<
    { milliseconds: number; destination: "recovery" | "exit" | "complete" } | undefined
  >(undefined);
  const [exitPrompt, setExitPrompt] = useState<{
    milliseconds: number;
    wasRunning: boolean;
  } | null>(null);
  const cancelExitButtonRef = useRef<HTMLButtonElement>(null);
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
  const [failed, setFailed] = useState<"record" | "transition" | null>(null);

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
      try {
        new Notification(title, { body });
      } catch {
        /* Notifications never invalidate a saved session. */
      }
    }
  };

  const requestNotifications = () => {
    if (
      preferences.focusNotificationsEnabled &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission().catch(() => {});
    }
  };

  const startClock = (nextPhase: Extract<ZenPhase, "FOCUS" | "BREAK">) => {
    if (finishingRef.current || pendingSaveRef.current || exitPrompt) return;
    if (nextPhase === "FOCUS") {
      sessionRecordedRef.current = false;
      requestNotifications();
    }
    setPhase(nextPhase);
    setElapsedSeconds(0);
    clock.start();
    setRunning(true);
    setFailed(null);
  };

  const persistFocus = async (durationMinutes: number, plannedMinutes?: number) => {
    if (sessionRecordedRef.current) return;
    await onRecordFocus(durationMinutes, plannedMinutes);
    sessionRecordedRef.current = true;
    setRecordedMinutes(durationMinutes);
    setRecordedSessionCount((current) => current + 1);
    setRecordedTotalMinutes((current) => current + durationMinutes);
    try {
      const reminder = addFocusedMinutes(durationMinutes, preferences.movementReminderMinutes);
      setMovementDue(reminder.movementDue);
    } catch {
      /* Optional reminder storage must not invalidate a committed focus record. */
    }
  };

  const completeFocus = async (
    destination: "recovery" | "exit" | "complete" = "recovery",
    snapshot = clock.pause(),
  ) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setRunning(false);
    setExitPrompt(null);
    setElapsedSeconds(Math.floor(snapshot / 1000));
    setSubmitting(true);
    setFailed(null);
    pendingSaveRef.current = { milliseconds: snapshot, destination };
    const durationMinutes = recordedFocusMinutes(snapshot, selectedMinutes);
    try {
      if (durationMinutes > 0) await persistFocus(durationMinutes, selectedMinutes ?? undefined);
      else setRecordedMinutes(0);
      pendingSaveRef.current = undefined;
      if (destination === "exit") onClose();
      else if (destination === "complete") {
        setPhase("RECOVERY");
        if (await onTransition("COMPLETED")) onClose();
        else setFailed("transition");
      } else {
        setPhase("RECOVERY");
        notify(
          t("zen.focusCompleteNotification"),
          t("zen.focusCompleteNotificationBody", { title: task.title }),
        );
      }
    } catch {
      setFailed(pendingSaveRef.current ? "record" : "transition");
    } finally {
      setSubmitting(false);
      finishingRef.current = false;
    }
  };

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      const room = roomRef.current;
      if (
        !room ||
        (document.activeElement !== document.body && !room.contains(document.activeElement))
      )
        return;
      if (event.key === "Escape" && !event.defaultPrevented) exitHandlerRef.current();
      if (event.key === "Tab") {
        const scope = room.querySelector<HTMLElement>('[role="alertdialog"]') ?? room;
        const items = [
          ...scope.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), summary, a[href]",
          ),
        ].filter((item) => item.getClientRects().length > 0);
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (exitPrompt) cancelExitButtonRef.current?.focus();
  }, [exitPrompt]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (phase === "FOCUS" && !sessionRecordedRef.current && clock.elapsed() >= 1000) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [phase, clock]);

  useEffect(() => {
    let active = true;
    if (task.projectId)
      void projectApplicationService
        .listProjects()
        .then((projects) => {
          if (active)
            setProjectName(projects.find((project) => project.id === task.projectId)?.name ?? "");
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [task.projectId]);

  useEffect(() => {
    if (!running) return;
    const update = () => setElapsedSeconds(Math.floor(clock.elapsed() / 1000));
    update();
    const interval = window.setInterval(update, 250);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, [running, clock]);

  useEffect(() => {
    if (!running || timerDurationSeconds === undefined || elapsedSeconds < timerDurationSeconds)
      return;
    if (phase === "FOCUS") {
      void completeFocus();
      return;
    }
    clock.pause();
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
    if (finishingRef.current || pendingSaveRef.current || exitPrompt) return;
    if (running) {
      setElapsedSeconds(Math.floor(clock.pause() / 1000));
      setRunning(false);
      return;
    }
    clock.resume();
    setRunning(true);
  };

  const finishEarly = async () => {
    await completeFocus();
  };

  const handleExit = async () => {
    if (submitting || finishingRef.current) return;
    if (phase !== "FOCUS") {
      onClose();
      return;
    }
    const snapshot = clock.pause();
    setElapsedSeconds(Math.floor(snapshot / 1000));
    if (snapshot < 1000) {
      onClose();
      return;
    }
    setExitPrompt({ milliseconds: snapshot, wasRunning: running });
    setRunning(false);
  };
  const cancelExit = () => {
    if (exitPrompt?.wasRunning && !pendingSaveRef.current) {
      clock.resume();
      setRunning(true);
    }
    setExitPrompt(null);
    closeButtonRef.current?.focus();
  };
  exitHandlerRef.current = () => {
    if (exitPrompt) cancelExit();
    else void handleExit();
  };

  const transition = async (status: Extract<TodayTransitionStatus, "READY" | "COMPLETED">) => {
    if (finishingRef.current || pendingSaveRef.current || exitPrompt) return;
    finishingRef.current = true;
    setSubmitting(true);
    setFailed(null);
    const wasRunning = running;
    const snapshot = clock.pause();
    setElapsedSeconds(Math.floor(snapshot / 1000));
    setRunning(false);
    try {
      // Confirm the optional handoff first. Canceling must not record a focus session.
      if (status === "READY" && !(await onTransition(status))) {
        if (wasRunning) clock.resume();
        setRunning(wasRunning);
        return;
      }
      if (phase === "FOCUS") {
        const minutes = recordedFocusMinutes(snapshot, selectedMinutes);
        pendingSaveRef.current = {
          milliseconds: snapshot,
          destination: status === "READY" ? "exit" : "complete",
        };
        if (minutes > 0) await persistFocus(minutes, selectedMinutes ?? undefined);
        else setRecordedMinutes(0);
        pendingSaveRef.current = undefined;
        if (status === "COMPLETED") setPhase("RECOVERY");
      }
      if (status === "READY" || (await onTransition(status))) onClose();
      else setFailed("transition");
    } catch {
      setFailed(pendingSaveRef.current ? "record" : "transition");
    } finally {
      finishingRef.current = false;
      setSubmitting(false);
    }
  };

  const totalSessions = (task.focusSessionCount ?? 0) + recordedSessionCount;
  const totalMinutes = (task.focusMinutes ?? 0) + recordedTotalMinutes;

  return (
    <section
      ref={roomRef}
      aria-labelledby="zen-title"
      aria-modal="true"
      className={`zen-mode zen-immersive zen-phase-${phase.toLowerCase()}`}
      role="dialog"
    >
      <div className="zen-landscape" aria-hidden="true" />
      <header className="zen-topbar" inert={exitPrompt !== null}>
        <button
          aria-label={t("zen.exit")}
          className="zen-exit"
          disabled={submitting}
          onClick={() => void handleExit()}
          ref={closeButtonRef}
          type="button"
        >
          <span aria-hidden="true">←</span> {t("zen.backToday")}
        </button>
        <span className="zen-project">{projectName || t("zen.open")}</span>
        <span className="zen-location">{t("zen.landscape")}</span>
      </header>
      <div className="zen-content" inert={exitPrompt !== null}>
        <p className="zen-eyebrow">
          {t(phase === "BREAK" || phase === "RECOVERY" ? "zen.resting" : "zen.eyebrow")}
        </p>
        <h2 id="zen-title">{task.title}</h2>

        {phase === "SETUP" ? (
          <div className="zen-session-panel">
            <strong className="zen-clock-preview" aria-hidden="true">
              {selectedMinutes === null ? "00:00" : formatClock(selectedMinutes * 60)}
            </strong>
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
                  : !running && !submitting
                    ? "zen.timerPaused"
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
                <button
                  className="button zen-primary"
                  disabled={submitting || failed === "record"}
                  onClick={toggleTimer}
                  type="button"
                >
                  {t(running ? "zen.pauseTimer" : "zen.resumeTimer")}
                </button>
                <button
                  className="button button-outline"
                  disabled={submitting || failed === "record"}
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
                  clock.pause();
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
              ) : (
                <span className="zen-recorded">{t("zen.shortSession")}</span>
              )}
            </div>
            {movementDue ? (
              <button
                className="button button-primary"
                onClick={() => {
                  try {
                    resetFocusedMinutes();
                  } catch {
                    /* A reminder can still be dismissed. */
                  }
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

        {failed ? (
          <div className="zen-error" role="alert">
            {t(failed === "record" ? "zen.recordFailed" : "zen.transitionFailed")}
            {failed === "record" ? (
              <button
                className="button button-outline"
                type="button"
                disabled={submitting}
                onClick={() => {
                  const pending = pendingSaveRef.current;
                  if (pending) void completeFocus(pending.destination, pending.milliseconds);
                }}
              >
                {t("zen.retrySave")}
              </button>
            ) : null}
            {failed === "record" ? (
              <button
                className="button button-outline"
                disabled={submitting}
                type="button"
                onClick={onClose}
              >
                {t("zen.discardAndExit")}
              </button>
            ) : null}
          </div>
        ) : null}
        <details className="zen-details">
          <summary>{t("zen.details")}</summary>
          <div className="zen-details-body">
            <ResumeNote task={task} />
            {task.note ? <p className="zen-note">{task.note}</p> : null}
            {totalSessions > 0 ? (
              <p className="zen-focus-total">
                {t("zen.totalRecorded", { sessions: totalSessions, minutes: totalMinutes })}
              </p>
            ) : null}
            <div className="zen-actions">
              <button
                className="button zen-pause"
                disabled={submitting || failed === "record"}
                onClick={() => void transition("READY")}
                type="button"
              >
                {t("zen.pause")}
              </button>
              <button
                className="button button-primary zen-complete"
                disabled={submitting || failed === "record"}
                onClick={() => void transition("COMPLETED")}
                type="button"
              >
                {t("zen.complete")}
              </button>
            </div>
          </div>
        </details>
      </div>
      <footer className="zen-footer" inert={exitPrompt !== null}>
        <AmbientSound
          allowed={
            !exitPrompt &&
            !submitting &&
            (phase === "SETUP" || phase === "BREAK" || (phase === "FOCUS" && running))
          }
        />
      </footer>
      {exitPrompt ? (
        <div className="zen-exit-overlay">
          <section
            className="zen-exit-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="zen-exit-title"
            aria-describedby="zen-exit-description"
          >
            <h3 id="zen-exit-title">{t("zen.exitTitle")}</h3>
            <p id="zen-exit-description">
              {t(
                recordedFocusMinutes(exitPrompt.milliseconds, selectedMinutes) > 0
                  ? "zen.exitSaveHint"
                  : "zen.exitShortHint",
                { count: recordedFocusMinutes(exitPrompt.milliseconds, selectedMinutes) },
              )}
            </p>
            <div className="zen-actions">
              <button
                className="button zen-primary"
                type="button"
                ref={cancelExitButtonRef}
                onClick={cancelExit}
              >
                {t("zen.returnFocus")}
              </button>
              <button
                className="button button-outline"
                type="button"
                onClick={() => void completeFocus("exit", exitPrompt.milliseconds)}
              >
                {t(
                  recordedFocusMinutes(exitPrompt.milliseconds, selectedMinutes) > 0
                    ? "zen.saveAndExit"
                    : "zen.exit",
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
