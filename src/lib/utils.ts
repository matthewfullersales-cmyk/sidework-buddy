import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * "4:00 PM" when no end time is set, "4:00 PM – 9:00 PM" when one is.
 * Blank/absent end reproduces the arrival-only rendering exactly.
 */
export function formatTimeRange12h(start: string | null | undefined, end?: string | null): string {
  const from = formatTime12h(start);
  if (!end) return from;
  return `${from} – ${formatTime12h(end)}`;
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
