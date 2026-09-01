import { DAY_KEYS, type DayKey, type DayAvailability } from "@/lib/sidework-store";

/**
 * Four-button weekly availability control shared by the two public intake
 * forms (careers application + join link). Unanswered days are simply absent
 * from the map — that is a UI state only and is never persisted.
 */
export type PartialWeekly = Partial<Record<DayKey, DayAvailability>>;

const DAY_FULL: Record<DayKey, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

type Choice = "full" | "day" | "night" | "off";

const CHOICES: { key: Choice; label: string }[] = [
  { key: "full", label: "Full" },
  { key: "day", label: "Day" },
  { key: "night", label: "Night" },
  { key: "off", label: "Off" },
];

function toChoice(av: DayAvailability | undefined): Choice | null {
  if (!av) return null;
  if (av.kind === "full") return "full";
  if (av.kind === "none") return "off";
  if (av.half === "night") return "night";
  if (av.half === "day") return "day";
  return null;
}

function fromChoice(c: Choice): DayAvailability {
  if (c === "full") return { kind: "full" };
  if (c === "off") return { kind: "none" };
  return { kind: "partial", half: c === "night" ? "night" : "day" };
}

/** Days with no answer yet, in week order. */
export function unansweredDays(value: PartialWeekly): DayKey[] {
  return DAY_KEYS.filter((d) => toChoice(value[d]) === null);
}

export function AvailabilityPicker({
  value,
  onChange,
}: {
  value: PartialWeekly;
  onChange: (next: PartialWeekly) => void;
}) {
  return (
    <div className="grid gap-2">
      {DAY_KEYS.map((d) => {
        const current = toChoice(value[d]);
        return (
          <div key={d} className="rounded-lg border border-border bg-background p-2">
            <p className="px-1 text-sm font-semibold">{DAY_FULL[d]}</p>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {CHOICES.map((c) => {
                const active = current === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange({ ...value, [d]: fromChoice(c.key) })}
                    className={`min-h-[44px] rounded-md border px-2 text-xs font-medium transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/40"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
