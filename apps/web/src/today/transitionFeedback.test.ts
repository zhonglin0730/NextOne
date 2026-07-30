import { describe, expect, it } from "vitest";

import { getTodayTransitionFeedbackKey } from "./transitionFeedback";

describe("today transition feedback", () => {
  it("reports completion instead of sending the user to waiting", () => {
    expect(getTodayTransitionFeedbackKey("COMPLETED")).toBe("today.feedback.completed");
  });

  it("keeps the other execution states explicit", () => {
    expect(getTodayTransitionFeedbackKey("DOING")).toBe("today.feedback.started");
    expect(getTodayTransitionFeedbackKey("READY")).toBe("today.feedback.paused");
    expect(getTodayTransitionFeedbackKey("WAITING")).toBe("today.feedback.waiting");
  });
});
