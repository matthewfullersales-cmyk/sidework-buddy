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
  if (!iso) return "—";
  let d: Date;
  if (!iso.includes("T")) {
    const [yStr, mStr, dStr] = iso.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const day = Number(dStr);
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(day)) return "—";
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(iso);
  }
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
