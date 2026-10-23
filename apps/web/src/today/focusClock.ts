/** Keep sub-second work across pauses; only the display rounds to whole seconds. */
export class FocusClock {
  private accumulated = 0;
  private startedAt: number | undefined;

  constructor(private readonly now: () => number = () => performance.now()) {}

  start() {
    this.accumulated = 0;
    this.startedAt = this.now();
  }

  elapsed() {
    return (
      this.accumulated +
      (this.startedAt === undefined ? 0 : Math.max(0, this.now() - this.startedAt))
    );
  }

  pause() {
    this.accumulated = this.elapsed();
    this.startedAt = undefined;
    return this.accumulated;
  }

  resume() {
    this.startedAt ??= this.now();
  }
}

export function recordedFocusMinutes(milliseconds: number, plannedMinutes: number | null) {
  const bounded = Math.min(
    milliseconds,
    plannedMinutes === null ? Infinity : plannedMinutes * 60_000,
  );
  return bounded < 60_000 ? 0 : Math.round(bounded / 60_000);
}
