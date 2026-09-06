import type { Task } from "@nextone/domain";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { requestResumeNote } from "./ResumeNoteDialog";

export function ResumeNote({
  task: sourceTask,
  editable = false,
  compact = false,
  onSaved,
}: {
  task: Task;
  editable?: boolean;
  compact?: boolean;
  onSaved?: (task: Task) => void;
}) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [savedTask, setSavedTask] = useState<Task>();
  const task =
    savedTask?.id === sourceTask.id && savedTask.revision > sourceTask.revision
      ? savedTask
      : sourceTask;
  if (!editable && !task.resumeNote) return null;
  const edit = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const updated = await requestResumeNote(task.id);
      if (updated) {
        setSavedTask(updated);
        onSaved?.(updated);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`resume-note${compact ? " resume-note-compact" : ""}`}>
      {task.resumeNote ? (
        <>
          <span className="resume-note-label">{t("resume.savedLabel")}</span>
          <p>{task.resumeNote}</p>
          {!compact && task.resumeNoteUpdatedAt ? (
            <time dateTime={task.resumeNoteUpdatedAt}>
              {new Date(task.resumeNoteUpdatedAt).toLocaleString(i18n.language, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          ) : null}
        </>
      ) : null}
      {editable ? (
        <button
          type="button"
          className="button button-quiet button-small"
          disabled={busy}
          onClick={() => void edit()}
        >
          {t(task.resumeNote ? "resume.edit" : "resume.add")}
        </button>
      ) : null}
      {failed ? <p role="alert">{t("common.error")}</p> : null}
    </div>
  );
}
