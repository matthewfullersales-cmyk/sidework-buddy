import { DAY_KEYS, type DayKey, type DayAvailability, type WeeklyAvailability } from "@/lib/sidework-store";

/**
 * Read-only, compact weekly availability display for manager-side surfaces.
 * Deliberately NOT the interactive picker: nothing here can edit a record.
 */

/** Full / Day / Night / Off, or null when the day is missing or malformed. */
function labelFor(av: DayAvailability | undefined): string | null {
  if (!av || typeof av !== "object") return null;
  if (av.kind === "full") return "Full";
  if (av.kind === "none") return "Off";
  if (av.kind === "partial") {
    if (av.half === "day") return "Day";
    if (av.half === "night") return "Night";
    return null;
  }
  return null;
}

/** True when at least one day carries a readable answer. */
export function hasAnyAvailability(value: Partial<WeeklyAvailability> | null | undefined): boolean {
  if (!value || typeof value !== "object") return false;
  return DAY_KEYS.some((d) => labelFor(value[d as DayKey]) !== null);
}

export function AvailabilitySummary({
  value,
}: {
  value: Partial<WeeklyAvailability> | null | undefined;
}) {
  if (!hasAnyAvailability(value)) return null;
  return (
    <div className="grid grid-cols-7 gap-1">
      {DAY_KEYS.map((d) => {
        const label = labelFor(value?.[d as DayKey]);
        return (
          <div
            key={d}
            className="rounded-md border border-border bg-background px-1 py-1.5 text-center"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{d}</p>
            <p className="text-[11px] font-medium leading-tight">{label ?? "—"}</p>
          </div>
        );
      })}
    </div>
  );
}

const YEARS_LABEL: Record<string, string> = {
  none: "None",
  "under-1": "Under 1 year",
  "1-3": "1–3 years",
  "3-5": "3–5 years",
  "5-plus": "5+ years",
};

const TENURE_LABEL: Record<string, string> = {
  "under-6mo": "Under 6 months",
  "6-12mo": "6–12 months",
  "1-2yr": "1–2 years",
  "2-plus": "2+ years",
};

/** Unrecognised ids fall through to the stored value rather than rendering blank. */
export function yearsExperienceLabel(id: string | undefined | null): string | null {
  if (!id) return null;
  return YEARS_LABEL[id] ?? id;
}

export function longestTenureLabel(id: string | undefined | null): string | null {
  if (!id) return null;
  return TENURE_LABEL[id] ?? id;
}
