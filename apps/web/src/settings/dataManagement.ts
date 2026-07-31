import type { LocalDataSnapshot, RestorePoint, UserPreferences } from "@nextone/storage-contracts";

import { nextOneDatabase } from "../storage/indexedDb";
import { getSyncConfiguration } from "../sync/config";

export interface ImportPreview {
  fileName: string;
  snapshot: LocalDataSnapshot;
  counts: {
    tasks: number;
    projects: number;
    events: number;
    dailyPlans: number;
    dailyPlanItems: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validatePreferences(value: unknown): UserPreferences | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value) || value.id !== "default" || typeof value.locale !== "string") {
    throw new Error("IMPORT_PREFERENCES_INVALID");
  }
  return value as unknown as UserPreferences;
}

export function parseSnapshot(value: unknown): LocalDataSnapshot {
  if (
    !isRecord(value) ||
    (value.schemaVersion !== 1 && value.schemaVersion !== 2) ||
    typeof value.exportedAt !== "string"
  ) {
    throw new Error("IMPORT_SCHEMA_UNSUPPORTED");
  }
  const arrayFields = [
    "tasks",
    "areas",
    "projects",
    ...(value.schemaVersion === 2 ? (["workPackages"] as const) : []),
    "taskEvents",
    "dailyPlans",
    "dailyPlanItems",
  ] as const;
  for (const field of arrayFields) {
    if (!Array.isArray(value[field])) {
      throw new Error(`IMPORT_FIELD_INVALID:${field}`);
    }
    if (
      value[field].some(
        (entry) => !isRecord(entry) || typeof entry.id !== "string" || entry.id.length === 0,
      )
    ) {
      throw new Error(`IMPORT_RECORD_INVALID:${field}`);
    }
  }
  const preferences = validatePreferences(value.preferences);
  const legacyTasks = value.tasks as readonly Record<string, unknown>[];
  const workPackages =
    value.schemaVersion === 2
      ? (value.workPackages as LocalDataSnapshot["workPackages"])
      : (legacyTasks
          .filter((task) => task.kind === "WORK_PACKAGE" && typeof task.projectId === "string")
          .map((task) => ({
            id: task.id,
            userId: task.userId,
            projectId: task.projectId,
            title: task.title,
            sortKey: task.sortKey,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            revision: task.revision,
            ...(typeof task.parentTaskId === "string" ? { parentId: task.parentTaskId } : {}),
            ...(typeof task.note === "string" ? { note: task.note } : {}),
          })) as LocalDataSnapshot["workPackages"]);
  const tasks =
    value.schemaVersion === 2
      ? (value.tasks as LocalDataSnapshot["tasks"])
      : (legacyTasks
          .filter((task) => task.kind !== "WORK_PACKAGE")
          .map(({ kind: _kind, parentTaskId, ...task }) => ({
            ...task,
            ...(typeof parentTaskId === "string" ? { workPackageId: parentTaskId } : {}),
          })) as unknown as LocalDataSnapshot["tasks"]);
  const projects = (value.projects as readonly Record<string, unknown>[]).map(
    ({ focusTaskId: _focusTaskId, ...project }) => project,
  ) as unknown as LocalDataSnapshot["projects"];
  return {
    schemaVersion: 2,
    exportedAt: value.exportedAt,
    tasks,
    areas: value.areas as LocalDataSnapshot["areas"],
    projects,
    workPackages,
    taskEvents: value.taskEvents as LocalDataSnapshot["taskEvents"],
    dailyPlans: value.dailyPlans as LocalDataSnapshot["dailyPlans"],
    dailyPlanItems: value.dailyPlanItems as LocalDataSnapshot["dailyPlanItems"],
    ...(preferences === undefined ? {} : { preferences }),
  };
}

export async function createExportSnapshot(): Promise<LocalDataSnapshot> {
  const exportedAt = new Date().toISOString();
  return nextOneDatabase.transaction((transaction) =>
    transaction.dataManagement.exportSnapshot(exportedAt),
  );
}

export async function downloadJsonExport(): Promise<void> {
  const snapshot = await createExportSnapshot();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `nextone-backup-${snapshot.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function previewImport(file: File): Promise<ImportPreview> {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error("IMPORT_FILE_TOO_LARGE");
  }
  const snapshot = parseSnapshot(JSON.parse(await file.text()) as unknown);
  return {
    fileName: file.name,
    snapshot,
    counts: {
      tasks: snapshot.tasks.length,
      projects: snapshot.projects.length,
      events: snapshot.taskEvents.length,
      dailyPlans: snapshot.dailyPlans.length,
      dailyPlanItems: snapshot.dailyPlanItems.length,
    },
  };
}

export async function importSnapshot(preview: ImportPreview): Promise<void> {
  const occurredAt = new Date().toISOString();
  await nextOneDatabase.transaction(async (transaction) => {
    const current = await transaction.dataManagement.exportSnapshot(occurredAt);
    await transaction.restorePoints.save({
      id: crypto.randomUUID(),
      reason: "BEFORE_IMPORT",
      createdAt: occurredAt,
      snapshot: current,
    });
    await transaction.dataManagement.replaceWithSnapshot(preview.snapshot, occurredAt);
  });
}

export async function createManualRestorePoint(): Promise<RestorePoint> {
  const createdAt = new Date().toISOString();
  return nextOneDatabase.transaction(async (transaction) => {
    const restorePoint: RestorePoint = {
      id: crypto.randomUUID(),
      reason: "MANUAL",
      createdAt,
      snapshot: await transaction.dataManagement.exportSnapshot(createdAt),
    };
    await transaction.restorePoints.save(restorePoint);
    return restorePoint;
  });
}

export function listRestorePoints(): Promise<readonly RestorePoint[]> {
  return nextOneDatabase.transaction((transaction) => transaction.restorePoints.list());
}

export async function restoreFromPoint(id: string): Promise<void> {
  const occurredAt = new Date().toISOString();
  await nextOneDatabase.transaction(async (transaction) => {
    const restorePoint = await transaction.restorePoints.findById(id);
    if (restorePoint === undefined) {
      throw new Error("RESTORE_POINT_NOT_FOUND");
    }
    const current = await transaction.dataManagement.exportSnapshot(occurredAt);
    await transaction.restorePoints.save({
      id: crypto.randomUUID(),
      reason: "BEFORE_IMPORT",
      createdAt: occurredAt,
      snapshot: current,
    });
    await transaction.dataManagement.replaceWithSnapshot(restorePoint.snapshot, occurredAt);
  });
}

export async function clearLocalCopy(): Promise<void> {
  await nextOneDatabase.transaction((transaction) => transaction.dataManagement.clearLocalCopy());
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("nextone.")) {
      localStorage.removeItem(key);
    }
  }
}

export interface AccountDeletionRequest {
  requestId: string;
  status: "AWAITING_FINAL_CONFIRMATION";
  createdAt: string;
  expiresAt: string;
  backupConfirmationRequired: true;
  finalDeletionAvailable: false;
}

export async function requestAccountDeletion(): Promise<AccountDeletionRequest> {
  const configuration = getSyncConfiguration();
  const response = await fetch(
    `${configuration.apiUrl.replace(/\/+$/, "")}/api/v1/account/deletion-requests`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.token}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`ACCOUNT_DELETION_REQUEST_FAILED:${response.status}`);
  }
  return response.json() as Promise<AccountDeletionRequest>;
}
