import { taskStatuses } from "@nextone/domain";
import { describe, expect, it } from "vitest";

import { taskDecisionsFor } from "../src/tasks/taskDecisions";

describe("native task decisions", () => {
  it("uses only statuses from the shared domain model", () => {
    const known = new Set(taskStatuses);
    for (const status of taskStatuses) {
      expect(taskDecisionsFor(status).every((decision) => known.has(decision))).toBe(true);
    }
  });

  it("turns an inbox item into an explicit choice", () => {
    expect(taskDecisionsFor("INBOX")).toEqual(["READY", "WAITING", "CANCELED"]);
  });
});
