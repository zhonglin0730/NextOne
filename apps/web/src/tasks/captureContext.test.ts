import { describe, expect, it } from "vitest";

import { getCaptureContext } from "./captureContext";

describe("capture context", () => {
  it("adds captures from a project detail page directly to that project", () => {
    expect(getCaptureContext("/projects/project-123")).toEqual({
      defaultDestination: "PROJECT",
      projectId: "project-123",
    });
  });

  it("preserves project context on a project board", () => {
    expect(getCaptureContext("/projects/project-123/board")).toEqual({
      defaultDestination: "PROJECT",
      projectId: "project-123",
    });
  });

  it("preserves project context on a project structure page", () => {
    expect(getCaptureContext("/projects/project-123/structure")).toEqual({
      defaultDestination: "PROJECT",
      projectId: "project-123",
    });
  });

  it("keeps today and global captures in their existing destinations", () => {
    expect(getCaptureContext("/today")).toEqual({ defaultDestination: "TODAY" });
    expect(getCaptureContext("/projects")).toEqual({ defaultDestination: "INBOX" });
    expect(getCaptureContext("/board")).toEqual({ defaultDestination: "INBOX" });
  });
});
