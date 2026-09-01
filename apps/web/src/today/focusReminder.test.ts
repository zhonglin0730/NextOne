import { describe, expect, it } from "vitest";

import { addFocusedMinutes, resetFocusedMinutes, type FocusMinuteStore } from "./focusReminder";

function memoryStore(): FocusMinuteStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("focus movement reminder", () => {
  it("reminds after focus minutes accumulate across sessions", () => {
    const store = memoryStore();
    expect(addFocusedMinutes(25, 50, store).movementDue).toBe(false);
    expect(addFocusedMinutes(25, 50, store)).toEqual({
      accumulatedMinutes: 50,
      movementDue: true,
    });
  });

  it("resets accumulated focus after movement", () => {
    const store = memoryStore();
    addFocusedMinutes(50, 50, store);
    resetFocusedMinutes(store);
    expect(addFocusedMinutes(10, 50, store).accumulatedMinutes).toBe(10);
  });
});
