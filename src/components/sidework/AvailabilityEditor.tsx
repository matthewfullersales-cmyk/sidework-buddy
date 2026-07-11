import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  DAY_KEYS,
  type DayKey,
  type DayAvailability,
  type Meal,
  type MealPeriods,
  type MealPeriodConfig,
  type WeeklyAvailability,
  type RestaurantHours,
  type ArrivalOffsets,
  type Section,
  type BusinessInfo,
  defaultWeeklyAvailability,
  defaultMealPeriods,
  defaultArrivalOffsets,
  findMealPeriodOverlaps,
} from "@/lib/sidework-store";

const DAY_FULL: Record<DayKey, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

const ALL_PRESETS: { id: string; label: string; meals: Meal[] }[] = [
  { id: "B",   label: "Breakfast Only",             meals: ["Breakfast"] },
  { id: "L",   label: "Lunch Only",                 meals: ["Lunch"] },
  { id: "D",   label: "Dinner Only",                meals: ["Dinner"] },
  { id: "BL",  label: "Breakfast & Lunch",          meals: ["Breakfast", "Lunch"] },
  { id: "BD",  label: "Breakfast & Dinner",         meals: ["Breakfast", "Dinner"] },
  { id: "LD",  label: "Lunch & Dinner",             meals: ["Lunch", "Dinner"] },
  { id: "BLD", label: "Breakfast, Lunch & Dinner",  meals: ["Breakfast", "Lunch", "Dinner"] },
];

function presetsFor(enabledMeals: Meal[]): { id: string; label: string; meals: Meal[] }[] {
  const set = new Set(enabledMeals);
  return ALL_PRESETS.filter((p) => p.meals.every((m) => set.has(m)));
}

function presetIdForMeals(meals: Meal[], available: { id: string; label: string; meals: Meal[] }[]): string {
  const m = available.find((p) =>
    p.meals.length === meals.length && p.meals.every((x) => meals.includes(x))
  );
  return m?.id ?? available[0]?.id ?? "D";
}

export function summarizeAvailability(av: DayAvailability): string {
  if (av.kind === "full") return "Full day";
  if (av.kind === "none") return "Off";
  return av.meals.join(" & ");
}

export function AvailabilityEditor({
  value,
  onChange,
  mealPeriods,
}: {
  value: WeeklyAvailability | undefined;
  onChange: (next: WeeklyAvailability) => void;
  mealPeriods?: MealPeriods;
}) {
  const weekly: WeeklyAvailability = value ?? defaultWeeklyAvailability();
  const mp: MealPeriods = mealPeriods ?? defaultMealPeriods();
  const enabledMeals: Meal[] = (["Breakfast", "Lunch", "Dinner"] as Meal[]).filter((m) => mp[m].enabled);
  const presets = presetsFor(enabledMeals);

  const setDay = (day: DayKey, next: DayAvailability) => {
    onChange({ ...weekly, [day]: next });
  };

  return (
    <div className="space-y-2">
      {enabledMeals.length === 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          No meal periods are configured for this restaurant yet. Owners can turn on Breakfast, Lunch, or Dinner in Settings → Restaurant hours so "Partial" availability has real windows to line up against.
        </div>
      )}
      {DAY_KEYS.map((day) => {
        const av = weekly[day];
        const kind = av.kind;
        const partialDisabled = presets.length === 0;
        return (
          <div key={day} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{DAY_FULL[day]}</p>
              <span className="text-xs text-muted-foreground">{summarizeAvailability(av)}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["full", "partial", "none"] as const).map((k) => {
                const active = kind === k;
                const label = k === "full" ? "Full Day" : k === "partial" ? "Partial" : "Not Available";
                const disabled = k === "partial" && partialDisabled;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      if (k === "full") setDay(day, { kind: "full" });
                      else if (k === "none") setDay(day, { kind: "none" });
                      else {
                        const defaultMeals = presets[0]?.meals ?? enabledMeals;
                        setDay(day, { kind: "partial", meals: av.kind === "partial" ? av.meals.filter((m) => enabledMeals.includes(m)) : defaultMeals });
                      }
                    }}
                    className={`min-h-[44px] rounded-md border px-2 text-xs font-medium transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/40"
                    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {kind === "partial" && presets.length > 0 && (
              <div className="mt-3">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Available for</Label>
                <select
                  value={presetIdForMeals(av.kind === "partial" ? av.meals : (presets[0]?.meals ?? []), presets)}
                  onChange={(e) => {
                    const preset = presets.find((p) => p.id === e.target.value);
                    if (preset) setDay(day, { kind: "partial", meals: preset.meals });
                  }}
                  className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm"
                >
                  {presets.map((p) => (
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

export function MealPeriodsEditor({
  value,
  onChange,
}: {
  value: MealPeriods;
  onChange: (meal: Meal, patch: Partial<MealPeriodConfig>) => void;
}) {
  const meals: Meal[] = ["Breakfast", "Lunch", "Dinner"];
  const overlaps = findMealPeriodOverlaps(value);
  return (
    <div className="space-y-2">
      {overlaps.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <p className="font-semibold">Meal periods overlap</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            {overlaps.map((o) => (
              <li key={`${o.winner}-${o.loser}`}>
                {o.loser} starts before {o.winner} ends. Shifts inside the overlap will be treated as <strong>{o.winner}</strong> for availability checks, so a {o.loser}-only employee could be scheduled in that window without warning. Adjust the times so periods don't overlap.
              </li>
            ))}
          </ul>
        </div>
      )}
      {meals.map((m) => {
        const cfg = value[m];
        return (
          <div key={m} className="rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold w-24">{m}</p>
              <label className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{cfg.enabled ? "Serving" : "Not served"}</span>
                <Switch checked={cfg.enabled} onCheckedChange={(v) => onChange(m, { enabled: v })} />
              </label>
            </div>
            {cfg.enabled && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Starts</Label>
                  <Input type="time" value={cfg.start} onChange={(e) => onChange(m, { start: e.target.value })} />
                </div>
                <div>
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Ends</Label>
                  <Input type="time" value={cfg.end} onChange={(e) => onChange(m, { end: e.target.value })} />
                </div>
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

export function ArrivalOffsetsEditor({
  value,
  onChange,
  activePositions,
}: {
  value: ArrivalOffsets;
  onChange: (next: ArrivalOffsets) => void;
  activePositions: string[]; // positions currently held by any active employee
}) {
  const defaults = defaultArrivalOffsets();
  const [showOverrides, setShowOverrides] = useState(false);

  const positions = useMemo(() => {
    const set = new Set<string>();
    activePositions.forEach((p) => { if (p) set.add(p); });
    // Always surface the pre-seeded overrides so the owner can see/reset them.
    Object.keys(defaults.byPosition ?? {}).forEach((p) => set.add(p));
    return Array.from(set).sort();
  }, [activePositions, defaults.byPosition]);

  const setSection = (sec: Section, min: number) => {
    const clean = Number.isFinite(min) && min >= 0 ? Math.round(min) : 0;
    onChange({ ...value, bySection: { ...value.bySection, [sec]: clean } });
  };
  const setPositionOverride = (pos: string, raw: string) => {
    const next = { ...(value.byPosition ?? {}) } as Record<string, number>;
    if (raw.trim() === "") delete next[pos];
    else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return;
      next[pos] = Math.round(n);
    }
    onChange({ ...value, byPosition: next as ArrivalOffsets["byPosition"] });
  };
  const resetAll = () => onChange(defaults);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        How early should staff clock in before their meal period's service start? Used to suggest shift times when you build the schedule — you can always type a custom time to override.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-background p-3">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">FOH default (min)</Label>
          <Input
            type="number"
            min={0}
            step={5}
            value={value.bySection.FOH}
            onChange={(e) => setSection("FOH", Number(e.target.value))}
            className="mt-1"
          />
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">BOH default (min)</Label>
          <Input
            type="number"
            min={0}
            step={5}
            value={value.bySection.BOH}
            onChange={(e) => setSection("BOH", Number(e.target.value))}
            className="mt-1"
          />
        </div>
      </div>
      <div className="rounded-lg border border-border bg-background">
        <button
          type="button"
          onClick={() => setShowOverrides((s) => !s)}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold hover:bg-muted/40"
        >
          <span>Per-position overrides {value.byPosition && Object.keys(value.byPosition).length > 0 ? `(${Object.keys(value.byPosition).length})` : ""}</span>
          <span className="text-muted-foreground">{showOverrides ? "Hide" : "Show"}</span>
        </button>
        {showOverrides && (
          <div className="space-y-2 border-t border-border p-3">
            {positions.length === 0 && (
              <p className="text-xs text-muted-foreground">No active positions yet. Add employees and their positions to configure overrides here.</p>
            )}
            {positions.map((pos) => {
              const cur = value.byPosition?.[pos as keyof NonNullable<ArrivalOffsets["byPosition"]>];
              return (
                <div key={pos} className="grid grid-cols-[1fr_120px] items-center gap-2">
                  <Label className="text-xs">{pos}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={5}
                    placeholder="Section default"
                    value={typeof cur === "number" ? cur : ""}
                    onChange={(e) => setPositionOverride(pos, e.target.value)}
                    aria-label={`Arrival offset override for ${pos}`}
                  />
                </div>
              );
            })}
            <div className="pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={resetAll}>Reset to defaults</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


export function BusinessInfoEditor({
  value,
  onChange,
}: {
  value: BusinessInfo;
  onChange: (next: BusinessInfo) => void;
}) {
  const [draft, setDraft] = useState<BusinessInfo>(value);
  // Sync draft when server-reloaded value changes (e.g. after hydrate).
  const [lastSyncedKey, setLastSyncedKey] = useState<string>(JSON.stringify(value));
  const currentKey = JSON.stringify(value);
  if (currentKey !== lastSyncedKey) {
    setDraft(value);
    setLastSyncedKey(currentKey);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);

  const set = (patch: Partial<BusinessInfo>) => setDraft((d) => ({ ...d, ...patch }));
  const clean = (v: string | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? undefined : t;
  };
  const save = () => {
    onChange({
      street: clean(draft.street),
      city: clean(draft.city),
      state: clean(draft.state),
      zip: clean(draft.zip),
      phone: clean(draft.phone),
      website: clean(draft.website),
      instagram: clean(draft.instagram),
      facebook: clean(draft.facebook),
      tiktok: clean(draft.tiktok),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Address</p>
        <div className="mt-2 space-y-2">
          <Input
            placeholder="Street address"
            value={draft.street ?? ""}
            onChange={(e) => set({ street: e.target.value })}
            aria-label="Street address"
          />
          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="City"
              value={draft.city ?? ""}
              onChange={(e) => set({ city: e.target.value })}
              aria-label="City"
            />
            <Input
              placeholder="State"
              value={draft.state ?? ""}
              onChange={(e) => set({ state: e.target.value })}
              aria-label="State"
            />
            <Input
              placeholder="ZIP"
              value={draft.zip ?? ""}
              onChange={(e) => set({ zip: e.target.value })}
              aria-label="ZIP"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Phone</Label>
          <Input
            type="tel"
            placeholder="(555) 555-5555"
            value={draft.phone ?? ""}
            onChange={(e) => set({ phone: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Website</Label>
          <Input
            type="url"
            placeholder="https://your-restaurant.com"
            value={draft.website ?? ""}
            onChange={(e) => set({ website: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Social</p>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
          <Input
            placeholder="Instagram (e.g. @your_spot)"
            value={draft.instagram ?? ""}
            onChange={(e) => set({ instagram: e.target.value })}
            aria-label="Instagram"
          />
          <Input
            placeholder="Facebook (page URL or handle)"
            value={draft.facebook ?? ""}
            onChange={(e) => set({ facebook: e.target.value })}
            aria-label="Facebook"
          />
          <Input
            placeholder="TikTok (e.g. @your_spot)"
            value={draft.tiktok ?? ""}
            onChange={(e) => set({ tiktok: e.target.value })}
            aria-label="TikTok"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <Button type="button" onClick={save} disabled={!dirty}>Save restaurant info</Button>
      </div>
    </div>
  );
}
