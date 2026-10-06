// Plan dates are plain days ("2026-10-06") in the phone's own time zone; no times, no UTC.

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Tests can pin "today".
let fixedToday: string | null = null;
export function setToday(iso: string | null) {
  fixedToday = iso;
}

export function today(): string {
  return fixedToday ?? isoDay(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/** Days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

/** The Monday of the week containing iso. */
export function weekStartOf(iso: string): string {
  return addDays(iso, -((parseDay(iso).getDay() + 6) % 7));
}

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** 0 = Monday. */
export function weekday(iso: string): number {
  return (parseDay(iso).getDay() + 6) % 7;
}
