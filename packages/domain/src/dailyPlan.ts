export type DailyPlanSection = "FOCUS" | "LATER";

export interface DailyPlan {
  id: string;
  userId: string;
  localDate: string;
  timeZone: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface DailyPlanItem {
  id: string;
  planId: string;
  taskId: string;
  section: DailyPlanSection;
  sortKey: string;
  createdAt: string;
}
