import type { UserPreferences } from "@nextone/storage-contracts";

import { nextOneDatabase } from "../storage/indexedDb";

export const preferencesChangedEvent = "nextone:preferences-changed";
export const localeStorageKey = "nextone.preferences.locale";
export const timeZoneStorageKey = "nextone.preferences.timeZone";
export const weekStartsOnStorageKey = "nextone.preferences.weekStartsOn";
const actionRulesStorageKey = "nextone.preferences.actionRules";

export function createDefaultPreferences(now = new Date().toISOString()): UserPreferences {
  return {
    id: "default",
    locale: "zh-CN",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    dateFormat: "LOCALE",
    weekStartsOn: "MONDAY",
    timeFormat: "24H",
    theme: "SYSTEM",
    focusLimit: 3,
    wipLimit: 3,
    dailyCapacityMinutes: 240,
    staleDays: 14,
    waitingDays: 7,
    defaultSort: "MANUAL",
    updatedAt: now,
  };
}

export async function loadPreferences(): Promise<UserPreferences> {
  return nextOneDatabase.transaction(async (transaction) => {
    const stored = await transaction.preferences.get();
    if (stored !== undefined) {
      return {
        ...stored,
        dailyCapacityMinutes: stored.dailyCapacityMinutes ?? 240,
      };
    }
    const defaults = createDefaultPreferences();
    await transaction.preferences.save(defaults);
    return defaults;
  });
}

export async function savePreferences(preferences: UserPreferences): Promise<void> {
  await nextOneDatabase.transaction((transaction) => transaction.preferences.save(preferences));
  localStorage.setItem(localeStorageKey, preferences.locale);
  localStorage.setItem(timeZoneStorageKey, preferences.timeZone);
  localStorage.setItem(weekStartsOnStorageKey, preferences.weekStartsOn);
  localStorage.setItem(
    actionRulesStorageKey,
    JSON.stringify({
      focusLimit: preferences.focusLimit,
      wipLimit: preferences.wipLimit,
      staleDays: preferences.staleDays,
      waitingDays: preferences.waitingDays,
    }),
  );
  document.documentElement.dataset.theme = preferences.theme.toLowerCase();
  window.dispatchEvent(new Event(preferencesChangedEvent));
}

export async function loadActionRules() {
  const stored = localStorage.getItem(actionRulesStorageKey);
  if (stored !== null) {
    try {
      return JSON.parse(stored) as {
        focusLimit: number;
        wipLimit: number;
        staleDays: number;
        waitingDays: number;
      };
    } catch {
      localStorage.removeItem(actionRulesStorageKey);
    }
  }
  const defaults = createDefaultPreferences();
  return {
    focusLimit: defaults.focusLimit,
    wipLimit: defaults.wipLimit,
    staleDays: defaults.staleDays,
    waitingDays: defaults.waitingDays,
  };
}
