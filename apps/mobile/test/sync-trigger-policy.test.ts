import { describe, expect, it } from "vitest";

import {
  isUsableNetwork,
  runSyncWithoutBlockingLocalUse,
  shouldSyncOnForeground,
  shouldSyncOnNetworkRecovery,
} from "../src/sync/syncTriggerPolicy";

describe("mobile automatic sync policy", () => {
  it("syncs after returning to the foreground", () => {
    expect(shouldSyncOnForeground("background", "active")).toBe(true);
    expect(shouldSyncOnForeground("active", "active")).toBe(false);
  });

  it("syncs only when a usable connection is restored", () => {
    expect(
      shouldSyncOnNetworkRecovery(
        { isConnected: false },
        { isConnected: true, isInternetReachable: true },
      ),
    ).toBe(true);
    expect(
      shouldSyncOnNetworkRecovery(
        { isConnected: true, isInternetReachable: true },
        { isConnected: true, isInternetReachable: true },
      ),
    ).toBe(false);
    expect(isUsableNetwork({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it("swallows sync failures so local work remains usable", async () => {
    await expect(
      runSyncWithoutBlockingLocalUse(() => Promise.reject(new Error("offline"))),
    ).resolves.toBeUndefined();
  });
});
