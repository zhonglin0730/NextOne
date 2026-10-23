import { describe, expect, it } from "vitest";
import { FocusClock, recordedFocusMinutes } from "./focusClock";

describe("active focus time", () => {
  it("keeps fractional seconds and excludes repeated pauses", () => {
    let now = 0;
    const clock = new FocusClock(() => now);
    clock.start();
    for (let index = 0; index < 10; index++) {
      now += 350;
      clock.pause();
      now += 1000;
      clock.resume();
    }
    expect(clock.elapsed()).toBe(3500);
    expect(clock.pause()).toBe(3500);
    now += 100_000;
    expect(clock.elapsed()).toBe(3500);
  });
  it("snapshots an action immediately instead of using a stale display tick", () => {
    let now = 0;
    const clock = new FocusClock(() => now);
    clock.start();
    now = 60_001;
    expect(recordedFocusMinutes(clock.pause(), 25)).toBe(1);
    now += 120_000;
    expect(recordedFocusMinutes(clock.elapsed(), 25)).toBe(1);
  });
  it("bounds background catch-up and records short/free sessions consistently", () => {
    expect(recordedFocusMinutes(25 * 60_000 + 90_000, 25)).toBe(25);
    expect(recordedFocusMinutes(59_999, 25)).toBe(0);
    expect(recordedFocusMinutes(65_000, 25)).toBe(1);
    expect(recordedFocusMinutes(96_000, null)).toBe(2);
  });
});
