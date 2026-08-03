const apiUrlKey = "nextone.sync.apiUrl";
const tokenKey = "nextone.sync.token";
const deviceIdKey = "nextone.sync.deviceId";

export interface SyncConfiguration {
  apiUrl: string;
  token: string;
}

function defaultApiUrl(): string {
  const configured = import.meta.env.VITE_NEXTONE_API_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }

  return window.location.origin;
}

export function getSyncConfiguration(): SyncConfiguration {
  return {
    apiUrl: localStorage.getItem(apiUrlKey) ?? defaultApiUrl(),
    token: localStorage.getItem(tokenKey) ?? (import.meta.env.DEV ? "nextone-local-dev-token" : ""),
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
