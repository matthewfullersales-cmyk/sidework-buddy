import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 12-hour time with AM/PM, dropping a leading zero on the hour (e.g. "4:00 PM"). */
export function formatTime12h(hhmm: string | null | undefined): string {
  if (!hhmm) return "—";
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr ?? NaN);
  const m = Number(mStr ?? NaN);
  if (Number.isNaN(h) || Number.isNaN(m)) return String(hhmm);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const min = String(m).padStart(2, "0");
  return `${hour12}:${min} ${suffix}`;
}

/**
 * Long-form date ("Sep 4, 2026"). Date-only strings ("YYYY-MM-DD") are parsed
 * as LOCAL midnight — `new Date("2026-09-04")` is UTC midnight and renders one
 * day early in negative UTC offsets. Full ISO timestamps (containing "T") are
 * real instants and keep their normal local-time conversion.
 */
export function formatDateLong(iso: string | null | undefined): string {
  const d = parseDateSafe(iso);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Shared parsing for the date formatters. Date-only strings ("YYYY-MM-DD")
 * become LOCAL midnight — `new Date("2026-09-04")` is UTC midnight and renders
 * one day early in negative UTC offsets. Full ISO timestamps (containing "T")
 * are real instants and keep their normal local-time conversion.
 */
function parseDateSafe(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  let d: Date;
  if (!iso.includes("T")) {
    const [yStr, mStr, dStr] = iso.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const day = Number(dStr);
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(day)) return null;
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(iso);
  }
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Weekday + short date, no year ("Thursday, Sep 3") — for near-term dates like
 * email subject lines, where the weekday is the actionable signal. Uses the
 * same local-midnight date-only parsing as formatDateLong.
 */
export function formatDateWithWeekday(iso: string | null | undefined): string {
  const d = parseDateSafe(iso);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/**
 * Length of a shift in hours, from two 24-hour "HH:MM" strings.
 *
 * An end EARLIER than the start means the shift crosses midnight — a 17:00–02:00
 * close — so a day is added. Without this a close shift computes as -15 hours and
 * silently subtracts from a weekly total.
 *
 * Equal start and end returns 0, deliberately differing from `timesOverlap` in
 * ScheduleSection, which treats equal times as a 24-hour span. For a number a
 * manager acts on, a zero-length shift is far likelier to be a typo than a
 * genuine 24-hour one. Do not "fix" this to match.
 *
 * Anything unparseable returns 0 rather than NaN, so one malformed row cannot
 * poison a whole week's total.
 */
export function shiftHours(start: string, end: string): number {
  const toMin = (t: string): number | null => {
    const parts = String(t ?? "").split(":");
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };
  const s = toMin(start);
  let e = toMin(end);
  if (s === null || e === null) return 0;
  if (e === s) return 0;
  if (e < s) e += 24 * 60;
  return (e - s) / 60;
}

/** One decimal place, with a trailing ".0" dropped: 37.5 -> "37.5", 38 -> "38". */
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return "0";
  return String(Math.round(hours * 10) / 10);
}
