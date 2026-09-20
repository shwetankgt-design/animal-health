export function dateOnly(d: Date | string): Date {
  const dt = new Date(d);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

export function todayDateOnly(): Date {
  return dateOnly(new Date());
}

export function addDays(d: Date, days: number): Date {
  const dt = new Date(d);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt;
}

export function fmtDate(d: Date | string): string {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" });
}

export function isoDate(d: Date | string): string {
  return dateOnly(d).toISOString().slice(0, 10);
}
