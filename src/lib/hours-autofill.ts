import {
  DAY_KEYS,
  defaultRestaurantHours,
  type DayHours,
  type DayKey,
  type Meal,
  type MealPeriods,
  type RestaurantHours,
} from "@/lib/sidework-store";

export type HoursRange = { open: string; close: string };
export type AutofillMemo = Partial<Record<DayKey, HoursRange>>;

const STORAGE_KEY = "86paper:hours-autofill-memo";

/** Earliest start → latest end across all enabled meal periods. */
export function unionOfEnabledMealPeriods(mp: MealPeriods): HoursRange | null {
  const enabled = (["Breakfast", "Lunch", "Dinner"] as Meal[])
    .map((m) => mp[m])
    .filter((c) => c.enabled && c.start && c.end);
  if (enabled.length === 0) return null;
  const open = enabled.reduce((a, c) => (c.start < a ? c.start : a), enabled[0]!.start);
  const close = enabled.reduce((a, c) => (c.end > a ? c.end : a), enabled[0]!.end);
  return { open, close };
}

export function loadAutofillMemo(): AutofillMemo {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AutofillMemo) : {};
  } catch {
    return {};
  }
}

export function saveAutofillMemo(memo: AutofillMemo) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memo));
  } catch {
    /* ignore */
  }
}

/**
 * A day's hours count as "not customized" (safe to auto-fill) only when they are
 * empty, still equal to the untouched shipped defaults, or exactly equal to the
 * value we auto-filled last time. Anything else is treated as an owner edit and
 * is left alone.
 */
export function isAutofillable(day: DayKey, hours: DayHours, memo: AutofillMemo): boolean {
  if (!hours) return true;
  if (!hours.open || !hours.close) return true;
  const last = memo[day];
  if (last && last.open === hours.open && last.close === hours.close) return true;
  const def = defaultRestaurantHours()[day];
  return def.open === hours.open && def.close === hours.close;
}

/** Returns the per-day patches to apply plus the updated memo. */
export function computeAutofillPatches(
  mealPeriods: MealPeriods,
  hours: RestaurantHours,
  memo: AutofillMemo,
): { patches: Array<{ day: DayKey; patch: HoursRange }>; memo: AutofillMemo } {
  const union = unionOfEnabledMealPeriods(mealPeriods);
  if (!union) return { patches: [], memo };
  const nextMemo: AutofillMemo = { ...memo };
  const patches: Array<{ day: DayKey; patch: HoursRange }> = [];
  for (const day of DAY_KEYS) {
    const h = hours[day];
    if (h?.closed) continue;
    if (!isAutofillable(day, h, memo)) continue;
    if (h && h.open === union.open && h.close === union.close) {
      nextMemo[day] = { ...union };
      continue;
    }
    patches.push({ day, patch: { ...union } });
    nextMemo[day] = { ...union };
  }
  return { patches, memo: nextMemo };
}
