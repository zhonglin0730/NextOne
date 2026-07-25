const apiUrlKey = "nextone.sync.apiUrl";
const tokenKey = "nextone.sync.token";
const deviceIdKey = "nextone.sync.deviceId";

export interface SyncConfiguration {
  apiUrl: string;
  token: string;
}

export function getSyncConfiguration(): SyncConfiguration {
  return {
    apiUrl: localStorage.getItem(apiUrlKey) ?? "http://127.0.0.1:8080",
    token: localStorage.getItem(tokenKey) ?? "nextone-local-dev-token",
  };
}

export function saveSyncConfiguration(configuration: SyncConfiguration): void {
  localStorage.setItem(apiUrlKey, configuration.apiUrl.replace(/\/+$/, ""));
  localStorage.setItem(tokenKey, configuration.token);
}

export function getDeviceId(): string {
  const existing = localStorage.getItem(deviceIdKey);
  if (existing !== null) {
    return existing;
  }
  const deviceId = crypto.randomUUID();
  localStorage.setItem(deviceIdKey, deviceId);
  return deviceId;
}
