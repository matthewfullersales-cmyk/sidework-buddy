import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DAY_KEYS,
  type DayKey,
  type DayAvailability,
  type Meal,
  type WeeklyAvailability,
  type RestaurantHours,
  defaultWeeklyAvailability,
} from "@/lib/sidework-store";

const DAY_FULL: Record<DayKey, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

const MEAL_PRESETS: { id: string; label: string; meals: Meal[] }[] = [
  { id: "L", label: "Lunch Only", meals: ["Lunch"] },
  { id: "D", label: "Dinner Only", meals: ["Dinner"] },
  { id: "LD", label: "Lunch & Dinner", meals: ["Lunch", "Dinner"] },
  { id: "B", label: "Breakfast Only", meals: ["Breakfast"] },
  { id: "BL", label: "Breakfast & Lunch", meals: ["Breakfast", "Lunch"] },
  { id: "BD", label: "Breakfast & Dinner", meals: ["Breakfast", "Dinner"] },
];

function presetIdForMeals(meals: Meal[]): string {
  const m = MEAL_PRESETS.find((p) =>
    p.meals.length === meals.length && p.meals.every((x) => meals.includes(x))
  );
  return m?.id ?? "D";
}

export function summarizeAvailability(av: DayAvailability): string {
  if (av.kind === "full") return "Full day";
  if (av.kind === "none") return "Off";
  return av.meals.join(" & ");
}

export function AvailabilityEditor({
  value,
  onChange,
}: {
  value: WeeklyAvailability | undefined;
  onChange: (next: WeeklyAvailability) => void;
}) {
  const weekly: WeeklyAvailability = value ?? defaultWeeklyAvailability();

  const setDay = (day: DayKey, next: DayAvailability) => {
    onChange({ ...weekly, [day]: next });
  };

  return (
    <div className="space-y-2">
      {DAY_KEYS.map((day) => {
        const av = weekly[day];
        const kind = av.kind;
        return (
          <div key={day} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{DAY_FULL[day]}</p>
              <span className="text-xs text-muted-foreground">{summarizeAvailability(av)}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["full", "partial", "none"] as const).map((k) => {
                const active = kind === k;
                const label = k === "full" ? "Full Day" : k === "partial" ? "Partial" : "Not Avail";
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (k === "full") setDay(day, { kind: "full" });
                      else if (k === "none") setDay(day, { kind: "none" });
                      else setDay(day, { kind: "partial", meals: av.kind === "partial" ? av.meals : ["Dinner"] });
                    }}
                    className={`min-h-[44px] rounded-md border px-2 text-xs font-medium transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/40"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {kind === "partial" && (
              <div className="mt-3">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Available for</Label>
                <select
                  value={presetIdForMeals(av.kind === "partial" ? av.meals : ["Dinner"])}
                  onChange={(e) => {
                    const preset = MEAL_PRESETS.find((p) => p.id === e.target.value);
                    if (preset) setDay(day, { kind: "partial", meals: preset.meals });
                  }}
                  className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm"
                >
                  {MEAL_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RestaurantHoursEditor({
  value,
  onChange,
}: {
  value: RestaurantHours;
  onChange: (day: DayKey, patch: Partial<{ closed: boolean; open: string; close: string }>) => void;
}) {
  return (
    <div className="space-y-2">
      {DAY_KEYS.map((day) => {
        const h = value[day];
        return (
          <div key={day} className="rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold w-24">{DAY_FULL[day]}</p>
              <label className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{h.closed ? "Closed" : "Open"}</span>
                <Switch checked={!h.closed} onCheckedChange={(v) => onChange(day, { closed: !v })} />
              </label>
            </div>
            {!h.closed && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Opens</Label>
                  <Input type="time" value={h.open} onChange={(e) => onChange(day, { open: e.target.value })} />
                </div>
                <div>
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Closes</Label>
                  <Input type="time" value={h.close} onChange={(e) => onChange(day, { close: e.target.value })} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
