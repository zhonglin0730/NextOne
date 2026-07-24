import { describe, expect, it } from "vitest";

import { canTransitionTask } from "../src/task";

describe("task state transitions", () => {
  it("allows a ready task to start", () => {
    expect(canTransitionTask("READY", "DOING")).toBe(true);
  });

  it("allows an active task to move to waiting", () => {
    expect(canTransitionTask("DOING", "WAITING")).toBe(true);
  });

  it("requires an explicit reopen path for completed tasks", () => {
    expect(canTransitionTask("COMPLETED", "DOING")).toBe(false);
    expect(canTransitionTask("COMPLETED", "READY")).toBe(true);
  });
});
