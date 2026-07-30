import type { TaskStatus } from "@nextone/domain";

export type TodayTransitionStatus = Extract<
  TaskStatus,
  "DOING" | "READY" | "WAITING" | "COMPLETED"
>;

export type TodayFeedbackKey =
  | "today.feedback.started"
  | "today.feedback.paused"
  | "today.feedback.waiting"
  | "today.feedback.completed";

export function getTodayTransitionFeedbackKey(status: TodayTransitionStatus): TodayFeedbackKey {
  switch (status) {
    case "DOING":
      return "today.feedback.started";
    case "READY":
      return "today.feedback.paused";
    case "WAITING":
      return "today.feedback.waiting";
    case "COMPLETED":
      return "today.feedback.completed";
  }
}
