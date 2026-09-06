import type { Task } from "@nextone/domain";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { notifyTasksChanged, taskApplicationService } from "./taskService";

const requestEvent = "nextone:resume-note";
type Request = { task: Task; pause: boolean; resolve: (task: Task | undefined) => void };

export async function requestResumeNote(taskId: string, pause = false): Promise<Task | undefined> {
  const task = await taskApplicationService.findTask(taskId);
  if (task === undefined) throw new Error("Task not found");
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent<Request>(requestEvent, { detail: { task, pause, resolve } }),
    );
  });
}

/** One shared dialog so all pause paths use the same optional handoff. */
export function ResumeNoteDialog() {
  const { t } = useTranslation();
  const [request, setRequest] = useState<Request>();
  const active = useRef<Request | undefined>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const receive = (event: Event) => {
      const next = (event as CustomEvent<Request>).detail;
      if (active.current !== undefined) {
        next.resolve(undefined);
        return;
      }
      active.current = next;
      setNote(next.task.resumeNote ?? "");
      setError(false);
      setRequest(next);
    };
    window.addEventListener(requestEvent, receive);
    return () => {
      window.removeEventListener(requestEvent, receive);
      active.current?.resolve(undefined);
      active.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (request !== undefined) dialog.current?.showModal();
  }, [request]);

  const finish = (task?: Task) => {
    dialog.current?.close();
    active.current?.resolve(task);
    active.current = undefined;
    setRequest(undefined);
  };
  const save = async (value: string) => {
    if (request === undefined || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(false);
    try {
      const task = await taskApplicationService.saveResumeNote(
        request.task.id,
        value,
        request.pause,
      );
      notifyTasksChanged();
      finish(task);
    } catch {
      setError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="resume-note-dialog"
      aria-labelledby="resume-note-title"
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        if (!savingRef.current) finish();
      }}
    >
      {request === undefined ? null : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(note);
          }}
        >
          <h2 id="resume-note-title">
            {t(request.pause ? "resume.pauseTitle" : "resume.editTitle")}
          </h2>
          <p className="resume-task-name">{request.task.title}</p>
          <label className="form-field">
            <span>{t("resume.label")}</span>
            <textarea
              autoFocus
              rows={3}
              maxLength={1000}
              value={note}
              disabled={saving}
              placeholder={t("resume.placeholder")}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <p className="resume-help">{t("resume.help")}</p>
          {error ? (
            <p className="page-error" role="alert">
              {t("resume.saveError")}
            </p>
          ) : null}
          <footer>
            <button
              type="button"
              className="button button-quiet"
              disabled={saving}
              onClick={() => finish()}
            >
              {t("common.cancel")}
            </button>
            {request.pause ? (
              <button
                type="button"
                className="button button-outline"
                disabled={saving}
                onClick={() => void save(request.task.resumeNote ?? "")}
              >
                {t("resume.skip")}
              </button>
            ) : null}
            <button className="button button-primary" type="submit" disabled={saving}>
              {t(saving ? "resume.saving" : request.pause ? "resume.savePause" : "resume.save")}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
