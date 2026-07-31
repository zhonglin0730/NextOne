export function getLocalDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Keep API timestamps usable in native date inputs and compact task summaries. */
export function getDateOnly(value?: string): string {
  return value === undefined ? "" : value.slice(0, 10);
}

export function getTimeZone(): string {
  return (
    localStorage.getItem("nextone.preferences.timeZone") ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "Asia/Shanghai"
  );
}

export function getWeekStartsAt(now = new Date()): string {
  const start = new Date(now);
  const weekStartsOn = localStorage.getItem("nextone.preferences.weekStartsOn") ?? "MONDAY";
  const daysSinceStart = weekStartsOn === "SUNDAY" ? start.getDay() : (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceStart);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}
