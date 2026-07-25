export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELED";

export interface Project {
  id: string;
  userId: string;
  areaId?: string;
  name: string;
  note?: string;
  status: ProjectStatus;
  focusTaskId?: string;
  sortKey: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  revision: number;
}
