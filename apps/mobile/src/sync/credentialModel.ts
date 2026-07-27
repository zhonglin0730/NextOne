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
