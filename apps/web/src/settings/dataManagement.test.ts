import { describe, expect, it } from "vitest";

import { parseSnapshot } from "./dataManagement";

function validSnapshot() {
  return {
    schemaVersion: 1,
    exportedAt: "2026-07-25T12:00:00Z",
    tasks: [],
    areas: [],
    projects: [],
    taskEvents: [],
    dailyPlans: [],
    dailyPlanItems: [],
  };
}

describe("data import validation", () => {
  it("accepts a complete NextOne V1 snapshot", () => {
    expect(parseSnapshot(validSnapshot())).toEqual(validSnapshot());
  });

  it("rejects unsupported schema versions before import", () => {
    expect(() => parseSnapshot({ ...validSnapshot(), schemaVersion: 2 })).toThrow(
      "IMPORT_SCHEMA_UNSUPPORTED",
    );
  });

  it("rejects a snapshot with a missing collection", () => {
    const snapshot = validSnapshot() as Record<string, unknown>;
    delete snapshot.tasks;
    expect(() => parseSnapshot(snapshot)).toThrow("IMPORT_FIELD_INVALID:tasks");
  });

  it("rejects malformed records before opening a replacement transaction", () => {
    expect(() => parseSnapshot({ ...validSnapshot(), tasks: [{ title: "missing id" }] })).toThrow(
      "IMPORT_RECORD_INVALID:tasks",
    );
  });
});
