import type { ProjectDetail, WorkPackageStructureNode } from "@nextone/application";
import type { Task, WorkPackage } from "@nextone/domain";
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
  workPackageApplicationService,
} from "../tasks/taskService";
import { getWeekStartsAt } from "../today/date";
import { ProjectViewNav } from "./ProjectViewNav";

type StructureItemKind = "WORK_PACKAGE" | "ACTION";

interface WorkPackageOption {
  workPackage: WorkPackage;
  level: number;
}

function flattenWorkPackages(
  nodes: readonly WorkPackageStructureNode[],
  level = 1,
): readonly WorkPackageOption[] {
  return nodes.flatMap((node) => [
    { workPackage: node.workPackage, level },
    ...flattenWorkPackages(node.children, level + 1),
  ]);
}

function PackageTaskRow({ task, onOpen }: { task: Task; onOpen(task: Task): void }) {
  const { t } = useTranslation();
  return (
    <button className="structure-task-row" onClick={() => onOpen(task)} type="button">
      <span className={`structure-task-status status-${task.status.toLowerCase()}`} />
      <span>{task.title}</span>
      <small>{t(`status.${task.status}`)}</small>
      <span aria-hidden="true" className="structure-task-open">
        →
      </span>
    </button>
  );
}

interface WorkPackageCardProps {
  level: number;
  node: WorkPackageStructureNode;
  onAdd(kind: StructureItemKind, parentId: string): void;
  onOpen(task: Task): void;
}

function WorkPackageCard({ level, node, onAdd, onOpen }: WorkPackageCardProps) {
  const { t } = useTranslation();
  return (
    <article className={level === 1 ? "work-package-card" : "work-package-card child-package-card"}>
      <header className="work-package-header">
        <div className="work-package-heading">
          <span aria-hidden="true" className="work-package-icon">
            {level === 1 ? "▰" : "▱"}
          </span>
          <div>
            <small>{t(level === 1 ? "structure.workPackage" : "structure.childPackage")}</small>
            <h3>{node.workPackage.title}</h3>
          </div>
        </div>
        <div className="work-package-progress-copy">
          <strong>{node.progress.completedPercent}%</strong>
          <span>
            {t("structure.progressCount", {
              completed: node.progress.completed,
              total: node.progress.total,
            })}
          </span>
        </div>
      </header>

      <div
        aria-label={t("structure.packageProgress", {
          title: node.workPackage.title,
          value: node.progress.completedPercent,
        })}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={node.progress.completedPercent}
        className="work-package-progress"
        role="progressbar"
      >
        <span style={{ width: `${node.progress.completedPercent}%` }} />
      </div>

      <div className="work-package-tasks">
        {node.actions.length === 0 ? (
          <p className="work-package-empty">{t("structure.emptyPackage")}</p>
        ) : (
          node.actions.map((task) => <PackageTaskRow key={task.id} onOpen={onOpen} task={task} />)
        )}
      </div>

      {node.children.length === 0 ? null : (
        <div className="child-package-list">
          {node.children.map((child) => (
            <WorkPackageCard
              key={child.workPackage.id}
              level={level + 1}
              node={child}
              onAdd={onAdd}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}

      <footer className="work-package-actions">
        <button
          className="button button-primary button-small"
          onClick={() => onAdd("ACTION", node.workPackage.id)}
          type="button"
        >
          {t("structure.addTaskToPackage")}
        </button>
        {level < 2 ? (
          <button
            className="button button-secondary button-small"
            onClick={() => onAdd("WORK_PACKAGE", node.workPackage.id)}
            type="button"
          >
            {t("structure.addChildPackage")}
          </button>
        ) : null}
      </footer>
    </article>
  );
}

export function ProjectStructurePage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const weekStartsAt = useMemo(() => getWeekStartsAt(), []);
  const [detail, setDetail] = useState<ProjectDetail>();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<StructureItemKind>("WORK_PACKAGE");
  const [parentId, setParentId] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task>();
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [assigningTaskId, setAssigningTaskId] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const submittingRef = useRef(false);

  const load = useCallback(async () => {
    if (projectId === undefined) return;
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

  const openCreate = (nextKind: StructureItemKind, nextParentId = "") => {
    setKind(nextKind);
    setParentId(nextParentId);
    setTitle("");
    setError("");
    setCreateOpen(true);
  };

  const parentLabel =
    parentId.length === 0
      ? detail?.overview.project.name
      : workPackages.find((option) => option.workPackage.id === parentId)?.workPackage.title;

  const addNode = async (event: FormEvent) => {
    event.preventDefault();
    if (projectId === undefined || title.trim().length === 0 || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      if (kind === "WORK_PACKAGE") {
        const workPackage = await workPackageApplicationService.create({
          projectId,
          title,
          ...(parentId.length === 0 ? {} : { parentId }),
        });
        setFeedback(t("structure.packageAdded", { title: workPackage.title }));
      } else {
        const task = await taskApplicationService.capture({
          title,
          projectId,
          ...(parentId.length === 0 ? {} : { workPackageId: parentId }),
        });
        await taskApplicationService.transition(task.id, "READY");
        setFeedback(t("structure.actionAdded", { title: task.title }));
      }
      setCreateOpen(false);
      notifyTasksChanged();
    } catch {
      setError(t("common.error"));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const assignTask = async (task: Task, workPackageId: string) => {
    if (workPackageId.length === 0 || assigningTaskId.length > 0) return;
    setAssigningTaskId(task.id);
    try {
      await taskApplicationService.updateDetails(task.id, {
        title: task.title,
        note: task.note ?? null,
        projectId: task.projectId ?? null,
        workPackageId,
        deadlineAt: task.deadlineAt ?? null,
        reviewAt: task.reviewAt ?? null,
        estimateMinutes: task.estimateMinutes ?? null,
        energyLevel: task.energyLevel ?? null,
        waitingFor: task.waitingFor ?? null,
      });
      const packageTitle =
        workPackages.find((option) => option.workPackage.id === workPackageId)?.workPackage.title ??
        "";
      setFeedback(t("structure.taskAssigned", { task: task.title, package: packageTitle }));
      notifyTasksChanged();
    } catch {
      setError(t("common.error"));
    } finally {
      setAssigningTaskId("");
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
      <Link className="project-back-link" to="/projects">
        ← {t("project.back")}
      </Link>
      <header className="page-header structure-page-header">
        <div>
          <p className="eyebrow">{t("structure.eyebrow")}</p>
          <h1 id="project-structure-title">
            {t("structure.title", { name: detail.overview.project.name })}
          </h1>
          <p>{t("structure.description")}</p>
        </div>
        <div className="structure-page-actions">
          <button
            className="button button-primary"
            onClick={() => openCreate("WORK_PACKAGE")}
            type="button"
          >
            {t("structure.addRootPackage")}
          </button>
        </div>
      </header>

      <ProjectViewNav projectId={detail.overview.project.id} />

      {error.length > 0 && !createOpen ? <p className="page-error">{error}</p> : null}
      <ActionToast message={feedback} onDismiss={() => setFeedback("")} />

      <section className="structure-overview-card">
        <div>
          <span>{t("structure.overviewTitle")}</span>
          <strong>{detail.overview.progress.completedPercent}%</strong>
        </div>
        <div className="structure-overview-progress">
          <span style={{ width: `${detail.overview.progress.completedPercent}%` }} />
        </div>
        <p>
          {t("structure.overviewSummary", {
            completed: detail.overview.progress.completed,
            total: detail.overview.progress.total,
            packages: workPackages.length,
          })}
        </p>
      </section>

      <section className="work-packages-section" aria-labelledby="work-packages-title">
        <header className="structure-section-header">
          <div>
            <h2 id="work-packages-title">{t("structure.packagesTitle")}</h2>
            <p>{t("structure.packagesDescription")}</p>
          </div>
          <span className="structure-task-count">
            {t("structure.packageCount", { count: workPackages.length })}
          </span>
        </header>
        {detail.structure.length === 0 ? (
          <div className="structure-empty-package">
            <span aria-hidden="true">▰</span>
            <div>
              <strong>{t("structure.noPackagesTitle")}</strong>
              <p>{t("structure.noPackagesDescription")}</p>
            </div>
            <button
              className="button button-primary"
              onClick={() => openCreate("WORK_PACKAGE")}
              type="button"
            >
              {t("structure.addFirstPackage")}
            </button>
          </div>
        ) : (
          <div className="work-package-grid">
            {detail.structure.map((node) => (
              <WorkPackageCard
                key={node.workPackage.id}
                level={1}
                node={node}
                onAdd={openCreate}
                onOpen={setSelectedTask}
              />
            ))}
          </div>
        )}
      </section>

      {detail.ungroupedActions.length === 0 ? null : (
        <section className="structure-inbox" aria-labelledby="structure-inbox-title">
          <header className="structure-section-header">
            <div>
              <h2 id="structure-inbox-title">{t("structure.ungroupedTitle")}</h2>
              <p>{t("structure.ungroupedDescription")}</p>
            </div>
            <span className="structure-task-count">
              {t("structure.taskCount", { count: detail.ungroupedActions.length })}
            </span>
          </header>
          <div className="structure-inbox-list">
            {detail.ungroupedActions.map((task) => (
              <article className="structure-inbox-row" key={task.id}>
                <button
                  className="structure-inbox-task"
                  onClick={() => setSelectedTask(task)}
                  type="button"
                >
                  <span className={`structure-task-status status-${task.status.toLowerCase()}`} />
                  <span>
                    <strong>{task.title}</strong>
                    <small>{t(`status.${task.status}`)}</small>
                  </span>
                </button>
                {workPackages.length === 0 ? (
                  <span className="structure-assignment-hint">
                    {t("structure.createPackageFirst")}
                  </span>
                ) : (
                  <select
                    aria-label={t("structure.assignTaskLabel", { title: task.title })}
                    disabled={assigningTaskId.length > 0}
                    onChange={(event) => void assignTask(task, event.target.value)}
                    value=""
                  >
                    <option value="">
                      {assigningTaskId === task.id
                        ? t("structure.assigning")
                        : t("structure.choosePackage")}
                    </option>
                    {workPackages.map((option) => (
                      <option key={option.workPackage.id} value={option.workPackage.id}>
                        {"—".repeat(Math.max(0, option.level - 1))} {option.workPackage.title}
                      </option>
                    ))}
                  </select>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {createOpen ? (
        <div
          className="modal-backdrop"
          onMouseDown={() => !submitting && setCreateOpen(false)}
          role="presentation"
        >
          <section
            aria-labelledby="structure-create-title"
            aria-modal="true"
            className="capture-dialog structure-create-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="dialog-header">
              <div>
                <p className="eyebrow">{t("structure.addTitle")}</p>
                <h2 id="structure-create-title">
                  {t(
                    kind === "WORK_PACKAGE"
                      ? "structure.createPackageTitle"
                      : "structure.createActionTitle",
                  )}
                </h2>
              </div>
              <button
                aria-label={t("common.close")}
                className="icon-button"
                onClick={() => setCreateOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>
            <div className="structure-builder-context">
              <span>{t("structure.addingUnder")}</span>
              <strong>{parentLabel ?? detail.overview.project.name}</strong>
            </div>
            <form onSubmit={addNode}>
              <label className="form-field">
                <span>
                  {t(kind === "WORK_PACKAGE" ? "structure.packageName" : "structure.actionName")}
                </span>
                <input autoFocus onChange={(event) => setTitle(event.target.value)} value={title} />
              </label>
              {kind === "WORK_PACKAGE" && workPackages.length > 0 ? (
                <label className="form-field">
                  <span>{t("structure.parent")}</span>
                  <select onChange={(event) => setParentId(event.target.value)} value={parentId}>
                    <option value="">{t("structure.root")}</option>
                    {parentOptions.map((option) => (
                      <option key={option.workPackage.id} value={option.workPackage.id}>
                        {option.workPackage.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {error.length > 0 ? <p className="form-error">{error}</p> : null}
              <footer className="dialog-actions">
                <button
                  className="button button-secondary"
                  onClick={() => setCreateOpen(false)}
                  type="button"
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="button button-primary"
                  disabled={title.trim().length === 0 || submitting}
                  type="submit"
                >
                  {submitting
                    ? t("common.saving")
                    : t(
                        kind === "WORK_PACKAGE"
                          ? "structure.createPackageAction"
                          : "structure.createActionAction",
                      )}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

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
