import type { ProjectDetail, ProjectStructureNode } from "@nextone/application";
import type { Task, TaskKind } from "@nextone/domain";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { ActionToast } from "../components/ActionToast";
import { TaskDrawer } from "../tasks/TaskDrawer";
import {
  notifyTasksChanged,
  projectApplicationService,
  taskApplicationService,
  tasksChangedEvent,
} from "../tasks/taskService";
import { getWeekStartsAt } from "../today/date";

interface WorkPackageOption {
  task: Task;
  level: number;
}

function flattenWorkPackages(
  nodes: readonly ProjectStructureNode[],
  level = 1,
): readonly WorkPackageOption[] {
  return nodes.flatMap((node) => [
    ...(node.task.kind === "WORK_PACKAGE" ? [{ task: node.task, level }] : []),
    ...flattenWorkPackages(node.children, level + 1),
  ]);
}

function StructureNode({ node, onOpen }: { node: ProjectStructureNode; onOpen(task: Task): void }) {
  const { t } = useTranslation();
  const isWorkPackage = node.task.kind === "WORK_PACKAGE";

  return (
    <li className={isWorkPackage ? "wbs-node wbs-work-package" : "wbs-node wbs-action"}>
      <div className="wbs-node-card">
        <span className="wbs-node-marker" aria-hidden="true">
          {isWorkPackage ? "◇" : "•"}
        </span>
        <div className="wbs-node-copy">
          {isWorkPackage ? (
            <strong>{node.task.title}</strong>
          ) : (
            <button onClick={() => onOpen(node.task)} type="button">
              {node.task.title}
            </button>
          )}
          <span>
            {isWorkPackage ? t("structure.workPackage") : t(`status.${node.task.status}`)}
          </span>
        </div>
        {isWorkPackage ? (
          <div className="wbs-node-progress">
            <strong>{node.progress.completedPercent}%</strong>
            <span>
              {t("structure.progressCount", {
                completed: node.progress.completed,
                total: node.progress.total,
              })}
            </span>
          </div>
        ) : null}
      </div>
      {node.children.length === 0 ? null : (
        <ol className="wbs-tree-children">
          {node.children.map((child) => (
            <StructureNode key={child.task.id} node={child} onOpen={onOpen} />
          ))}
        </ol>
      )}
    </li>
  );
}

export function ProjectStructurePage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const weekStartsAt = useMemo(() => getWeekStartsAt(), []);
  const [detail, setDetail] = useState<ProjectDetail>();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TaskKind>("WORK_PACKAGE");
  const [parentTaskId, setParentTaskId] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const submittingRef = useRef(false);

  const load = useCallback(async () => {
    if (projectId === undefined) {
      return;
    }
    try {
      setDetail(await projectApplicationService.getDetail(projectId, weekStartsAt));
      setError("");
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [projectId, t, weekStartsAt]);

  useEffect(() => {
    void load();
    window.addEventListener(tasksChangedEvent, load);
    return () => window.removeEventListener(tasksChangedEvent, load);
  }, [load]);

  const workPackages = useMemo(
    () => flattenWorkPackages(detail?.structure ?? []),
    [detail?.structure],
  );
  const parentOptions = useMemo(
    () => workPackages.filter((option) => kind === "ACTION" || option.level === 1),
    [kind, workPackages],
  );

  useEffect(() => {
    if (!parentOptions.some((option) => option.task.id === parentTaskId)) {
      setParentTaskId("");
    }
  }, [parentOptions, parentTaskId]);

  const addNode = async (event: FormEvent) => {
    event.preventDefault();
    if (projectId === undefined || title.trim().length === 0 || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const task = await taskApplicationService.capture({
        title,
        projectId,
        kind,
        ...(parentTaskId.length === 0 ? {} : { parentTaskId }),
      });
      await taskApplicationService.transition(task.id, "READY");
      setTitle("");
      setFeedback(
        t(kind === "WORK_PACKAGE" ? "structure.packageAdded" : "structure.actionAdded", {
          title: task.title,
        }),
      );
      notifyTasksChanged();
    } catch {
      setError(t("common.error"));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section className="page">
        <div className="mini-skeleton" />
      </section>
    );
  }
  if (detail === undefined) {
    return (
      <section className="page empty-state">
        <h1>{t("project.notFound")}</h1>
        <Link className="button button-outline" to="/projects">
          {t("project.back")}
        </Link>
      </section>
    );
  }

  return (
    <section className="page project-structure-page" aria-labelledby="project-structure-title">
      <Link className="project-back-link" to={`/projects/${detail.overview.project.id}`}>
        ← {t("project.backToOverview")}
      </Link>
      <header className="page-header">
        <div>
          <p className="eyebrow">{t("structure.eyebrow")}</p>
          <h1 id="project-structure-title">
            {t("structure.title", { name: detail.overview.project.name })}
          </h1>
          <p>{t("structure.description")}</p>
        </div>
        <Link
          className="button button-outline"
          to={`/projects/${detail.overview.project.id}/board`}
        >
          {t("project.boardView")}
        </Link>
      </header>

      {error.length > 0 ? <p className="page-error">{error}</p> : null}
      <ActionToast message={feedback} onDismiss={() => setFeedback("")} />

      <div className="project-structure-layout">
        <section className="project-structure-tree-card">
          <header>
            <div>
              <h2>{t("structure.treeTitle")}</h2>
              <p>{t("structure.treeDescription")}</p>
            </div>
            <span className="count-pill">{detail.overview.progress.total}</span>
          </header>
          {detail.structure.length === 0 ? (
            <div className="section-empty">
              <strong>{t("structure.emptyTitle")}</strong>
              <p>{t("structure.emptyDescription")}</p>
            </div>
          ) : (
            <ol className="wbs-tree">
              {detail.structure.map((node) => (
                <StructureNode key={node.task.id} node={node} onOpen={setSelectedTask} />
              ))}
            </ol>
          )}
        </section>

        <aside className="project-structure-builder">
          <h2>{t("structure.addTitle")}</h2>
          <p>{t("structure.addDescription")}</p>
          <form onSubmit={addNode}>
            <label className="form-field">
              <span>{t("structure.nodeType")}</span>
              <select onChange={(event) => setKind(event.target.value as TaskKind)} value={kind}>
                <option value="WORK_PACKAGE">{t("structure.workPackage")}</option>
                <option value="ACTION">{t("structure.action")}</option>
              </select>
            </label>
            <label className="form-field">
              <span>{t("structure.nodeTitle")}</span>
              <input
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t(
                  kind === "WORK_PACKAGE"
                    ? "structure.packagePlaceholder"
                    : "structure.actionPlaceholder",
                )}
                value={title}
              />
            </label>
            <label className="form-field">
              <span>{t("structure.parent")}</span>
              <select
                onChange={(event) => setParentTaskId(event.target.value)}
                value={parentTaskId}
              >
                <option value="">{t("structure.root")}</option>
                {parentOptions.map((option) => (
                  <option key={option.task.id} value={option.task.id}>
                    {"—".repeat(option.level)} {option.task.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-primary"
              disabled={title.trim().length === 0 || submitting}
              type="submit"
            >
              {submitting ? t("common.saving") : t("structure.add")}
            </button>
          </form>
        </aside>
      </div>

      {selectedTask === undefined ? null : (
        <TaskDrawer
          onClose={() => setSelectedTask(undefined)}
          onTaskChanged={setSelectedTask}
          task={selectedTask}
        />
      )}
    </section>
  );
}
