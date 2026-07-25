export function getLocalDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
}

export function getWeekStartsAt(now = new Date()): string {
  const monday = new Date(now);
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}
