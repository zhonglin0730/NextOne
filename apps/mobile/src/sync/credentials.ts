import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import {
  loadStoredSyncCredentials,
  normalizeApiUrl,
  saveStoredSyncCredentials,
  type CredentialStorage,
  type MobileSyncCredentials,
} from "./credentialModel";

export {
  normalizeApiUrl,
  type CredentialStorage,
  type MobileSyncCredentials,
} from "./credentialModel";

const secureCredentialStorage: CredentialStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    }),
};

function defaultApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured !== undefined && configured.trim().length > 0) {
    return normalizeApiUrl(configured);
  }
  return Platform.OS === "android" ? "http://10.0.2.2:8080" : "http://127.0.0.1:8080";
}

export async function loadSyncCredentials(
  storage: CredentialStorage = secureCredentialStorage,
): Promise<MobileSyncCredentials> {
  return loadStoredSyncCredentials(storage, {
    apiUrl: defaultApiUrl(),
    token: "nextone-local-dev-token",
    createDeviceId: randomUUID,
  });
}

export async function saveSyncCredentials(
  credentials: MobileSyncCredentials,
  storage: CredentialStorage = secureCredentialStorage,
): Promise<void> {
  await saveStoredSyncCredentials(credentials, storage);
}
