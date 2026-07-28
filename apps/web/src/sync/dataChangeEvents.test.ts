import { describe, expect, it, vi } from "vitest";

import {
  announceLocalDataChanged,
  announceSyncedDataChanged,
  localMutationsPendingEvent,
  tasksChangedEvent,
} from "./dataChangeEvents";

describe("data change events", () => {
  it("requests a view refresh and a sync after a local mutation", () => {
    const target = new EventTarget();
    const refresh = vi.fn();
    const sync = vi.fn();
    target.addEventListener(tasksChangedEvent, refresh);
    target.addEventListener(localMutationsPendingEvent, sync);

    announceLocalDataChanged(target);

    expect(refresh).toHaveBeenCalledOnce();
    expect(sync).toHaveBeenCalledOnce();
  });

  it("refreshes views after a pull without scheduling another sync", () => {
    const target = new EventTarget();
    const refresh = vi.fn();
    const sync = vi.fn();
    target.addEventListener(tasksChangedEvent, refresh);
    target.addEventListener(localMutationsPendingEvent, sync);

    announceSyncedDataChanged(target);

    expect(refresh).toHaveBeenCalledOnce();
    expect(sync).not.toHaveBeenCalled();
  });
});
