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
