const apiUrlKey = "nextone.sync.apiUrl";
const tokenKey = "nextone.sync.token";
const deviceIdKey = "nextone.sync.deviceId";

export interface MobileSyncCredentials {
  apiUrl: string;
  token: string;
  deviceId: string;
}

export interface CredentialStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export function normalizeApiUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  const parsed = new URL(normalized);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Server URL must use HTTP or HTTPS");
  }
  return normalized;
}

export function resolveDefaultApiUrl(input: {
  configured?: string;
  developmentHost?: string | null;
  platform: string;
}): string {
  if (input.configured !== undefined && input.configured.trim().length > 0) {
    return normalizeApiUrl(input.configured);
  }

  if (input.developmentHost !== undefined && input.developmentHost !== null) {
    try {
      const value = input.developmentHost.includes("://")
        ? input.developmentHost
        : `http://${input.developmentHost}`;
      const hostname = new URL(value).hostname;
      if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
        const host = hostname.includes(":") ? `[${hostname}]` : hostname;
        return `http://${host}:8080`;
      }
    } catch {
      // Fall back to the platform-specific local development address.
    }
  }

  return input.platform === "android" ? "http://10.0.2.2:8080" : "http://127.0.0.1:8080";
}

export async function loadStoredSyncCredentials(
  storage: CredentialStorage,
  defaults: { apiUrl: string; token: string; createDeviceId: () => string },
): Promise<MobileSyncCredentials> {
  const [storedApiUrl, storedToken, storedDeviceId] = await Promise.all([
    storage.getItem(apiUrlKey),
    storage.getItem(tokenKey),
    storage.getItem(deviceIdKey),
  ]);
  const deviceId = storedDeviceId ?? defaults.createDeviceId();
  if (storedDeviceId === null) {
    await storage.setItem(deviceIdKey, deviceId);
  }
  return {
    apiUrl: normalizeApiUrl(storedApiUrl ?? defaults.apiUrl),
    token: storedToken ?? defaults.token,
    deviceId,
  };
}

export async function saveStoredSyncCredentials(
  credentials: MobileSyncCredentials,
  storage: CredentialStorage,
): Promise<void> {
  await Promise.all([
    storage.setItem(apiUrlKey, normalizeApiUrl(credentials.apiUrl)),
    storage.setItem(tokenKey, credentials.token.trim()),
    storage.setItem(deviceIdKey, credentials.deviceId),
  ]);
}
