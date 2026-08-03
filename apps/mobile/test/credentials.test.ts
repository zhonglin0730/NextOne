import { describe, expect, it } from "vitest";

import {
  loadStoredSyncCredentials,
  normalizeApiUrl,
  resolveDefaultApiUrl,
  saveStoredSyncCredentials,
  type CredentialStorage,
} from "../src/sync/credentialModel";

function memoryStorage(initial: Readonly<Record<string, string>> = {}): CredentialStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
  };
}

describe("mobile sync credentials", () => {
  it("normalizes the server URL", () => {
    expect(normalizeApiUrl(" https://nextone.example.com/// ")).toBe("https://nextone.example.com");
    expect(() => normalizeApiUrl("ftp://nextone.example.com")).toThrow();
  });

  it("uses the Expo development host for a physical Android device", () => {
    expect(
      resolveDefaultApiUrl({
        developmentHost: "10.70.10.123:8081",
        platform: "android",
      }),
    ).toBe("http://10.70.10.123:8080");
    expect(
      resolveDefaultApiUrl({
        developmentHost: "127.0.0.1:8081",
        platform: "android",
      }),
    ).toBe("http://10.0.2.2:8080");
  });

  it("prefers an explicitly configured API URL", () => {
    expect(
      resolveDefaultApiUrl({
        configured: " https://nextone.example.com/ ",
        developmentHost: "10.70.10.123:8081",
        platform: "android",
      }),
    ).toBe("https://nextone.example.com");
  });

  it("persists and reloads token, endpoint, and device identity", async () => {
    const storage = memoryStorage();
    const first = await loadStoredSyncCredentials(storage, {
      apiUrl: "http://10.0.2.2:8080",
      token: "dev-token",
      createDeviceId: () => "device-1",
    });
    await saveStoredSyncCredentials(
      {
        apiUrl: "https://nextone.example.com/",
        token: "secret-token",
        deviceId: first.deviceId,
      },
      storage,
    );

    await expect(
      loadStoredSyncCredentials(storage, {
        apiUrl: "http://10.0.2.2:8080",
        token: "dev-token",
        createDeviceId: () => "device-2",
      }),
    ).resolves.toEqual({
      apiUrl: "https://nextone.example.com",
      token: "secret-token",
      deviceId: first.deviceId,
    });
  });
});
