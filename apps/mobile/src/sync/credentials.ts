import { randomUUID } from "expo-crypto";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import {
  loadStoredSyncCredentials,
  normalizeApiUrl,
  resolveDefaultApiUrl,
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
  return resolveDefaultApiUrl({
    configured: process.env.EXPO_PUBLIC_API_URL,
    developmentHost: Constants.expoConfig?.hostUri,
    platform: Platform.OS,
  });
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
