export interface WorkPackage {
  id: string;
  userId: string;
  projectId: string;
  parentId?: string;
  title: string;
  note?: string;
  sortKey: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  revision: number;
}

export interface CreateWorkPackageInput {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  now: string;
  parentId?: string;
  note?: string;
  sortKey?: string;
}

export function createWorkPackage(input: CreateWorkPackageInput): WorkPackage {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new Error("Work package title is required");
  }

  return {
    id: input.id,
    userId: input.userId,
    projectId: input.projectId,
    title,
    sortKey: input.sortKey ?? input.now,
    createdAt: input.now,
    updatedAt: input.now,
    revision: 1,
    ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
    ...(input.note === undefined || input.note.trim().length === 0
      ? {}
      : { note: input.note.trim() }),
  };
}
