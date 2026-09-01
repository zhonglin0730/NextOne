const accumulatedFocusMinutesKey = "nextone.focus.accumulatedMinutes";

export interface FocusMinuteStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function addFocusedMinutes(
  durationMinutes: number,
  reminderMinutes: number,
  store: FocusMinuteStore = localStorage,
): { accumulatedMinutes: number; movementDue: boolean } {
  const stored = Number.parseInt(store.getItem(accumulatedFocusMinutesKey) ?? "0", 10);
  const accumulatedMinutes = Math.max(0, Number.isFinite(stored) ? stored : 0) + durationMinutes;
  store.setItem(accumulatedFocusMinutesKey, String(accumulatedMinutes));
  return {
    accumulatedMinutes,
    movementDue: accumulatedMinutes >= reminderMinutes,
  };
}

export function resetFocusedMinutes(store: FocusMinuteStore = localStorage): void {
  store.setItem(accumulatedFocusMinutesKey, "0");
}
