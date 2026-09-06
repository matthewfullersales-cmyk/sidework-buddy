import { useMemo, useRef, useState } from "react";
import {
  computeAutofillPatches,
  loadAutofillMemo,
  saveAutofillMemo,
  type AutofillMemo,
} from "@/lib/hours-autofill";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";

import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DAY_KEYS,
  type DayKey,
  type DayAvailability,
  type DayHalf,
  type Meal,
  type MealPeriods,
  type MealPeriodConfig,
  type WeeklyAvailability,
  type RestaurantHours,
  type ArrivalOffsets,
  type Section,
  type BusinessInfo,
  defaultWeeklyAvailability,
  defaultArrivalOffsets,
  findMealPeriodOverlaps,
} from "@/lib/sidework-store";

const DAY_FULL: Record<DayKey, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

/** Read the Day/Night half, deriving it from legacy `meals` when absent so no
 * stored record renders blank. */
function halfOf(av: DayAvailability): DayHalf | null {
  if (av.kind !== "partial") return null;
  if (av.half === "day" || av.half === "night") return av.half;
  const meals = av.meals ?? [];
  if (meals.length === 0) return null;
  return meals.includes("Dinner") ? "night" : "day";
}

export function summarizeAvailability(av: DayAvailability): string {
  if (av.kind === "full") return "Full day";
  if (av.kind === "none") return "Off";
  const half = halfOf(av);
  if (half === "day") return "Days only";
  if (half === "night") return "Nights only";
  return "Partial";
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
        const half = halfOf(av);
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
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (k === "full") setDay(day, { kind: "full" });
                      else if (k === "none") setDay(day, { kind: "none" });
                      else setDay(day, { kind: "partial", half: half ?? "day" });
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
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(["day", "night"] as DayHalf[]).map((h) => {
                    const active = half === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setDay(day, { kind: "partial", half: h })}
                        className={`min-h-[44px] rounded-md border px-2 text-xs font-medium transition ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:border-primary/40"
                        }`}
                      >
                        {h === "day" ? "Day" : "Night"}
                      </button>
                    );
                  })}
                </div>
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
  restaurantHours,
  onHoursAutofill,
}: {
  value: MealPeriods;
  onChange: (meal: Meal, patch: Partial<MealPeriodConfig>) => void;
  /** Current daily hours — required for auto-fill on toggle. */
  restaurantHours?: RestaurantHours;
  /** Called per day with a proposed (still fully editable) hours default. */
  onHoursAutofill?: (day: DayKey, patch: { open: string; close: string }) => void;
}) {
  const meals: Meal[] = ["Breakfast", "Lunch", "Dinner"];
  const overlaps = findMealPeriodOverlaps(value);
  const memoRef = useRef<AutofillMemo | null>(null);

  const toggleMeal = (m: Meal, enabled: boolean) => {
    onChange(m, { enabled });
    if (!restaurantHours || !onHoursAutofill) return;
    if (memoRef.current === null) memoRef.current = loadAutofillMemo();
    const nextPeriods: MealPeriods = { ...value, [m]: { ...value[m], enabled } };
    const { patches, memo } = computeAutofillPatches(nextPeriods, restaurantHours, memoRef.current);
    memoRef.current = memo;
    saveAutofillMemo(memo);
    patches.forEach(({ day, patch }) => onHoursAutofill(day, patch));
  };

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
                <Switch checked={cfg.enabled} onCheckedChange={(v) => toggleMeal(m, v)} />
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
      email: clean(draft.email),
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
          <PhoneInput
            placeholder="(555) 555-5555"
            value={draft.phone ?? ""}
            onChange={(v) => set({ phone: v })}
            className="mt-1"
          />

        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</Label>
          <Input
            type="email"
            placeholder="hello@your-restaurant.com"
            value={draft.email ?? ""}
            onChange={(e) => set({ email: e.target.value })}
            className="mt-1"
            aria-label="Business email"
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

const RESTAURANT_TYPE_OPTIONS = [
  "Fine Dining", "Casual Dining", "Fast Casual", "Bar/Nightlife", "Cafe", "Food Truck",
];

export function RestaurantProfileEditor({
  value,
  onChange,
}: {
  value: { name: string; type: string };
  onChange: (next: { name: string; type: string }) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [lastSyncedKey, setLastSyncedKey] = useState<string>(JSON.stringify(value));
  const currentKey = JSON.stringify(value);
  if (currentKey !== lastSyncedKey) {
    setDraft(value);
    setLastSyncedKey(currentKey);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);

  const [forcedOther, setForcedOther] = useState(false);
  const isCustomType = forcedOther || (draft.type !== "" && !RESTAURANT_TYPE_OPTIONS.includes(draft.type));
  const selectValue = isCustomType ? "Other" : draft.type;

  const save = () => {
    onChange({ name: draft.name.trim(), type: draft.type.trim() });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Restaurant name</Label>
        <Input
          className="mt-1"
          placeholder="Your Restaurant"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          aria-label="Restaurant name"
        />
      </div>
      <div>
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Restaurant type</Label>
        <Select
          value={selectValue}
          onValueChange={(v) => {
            if (v === "Other") {
              setForcedOther(true);
            } else {
              setForcedOther(false);
              setDraft((d) => ({ ...d, type: v }));
            }
          }}
        >
          <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a type" /></SelectTrigger>
          <SelectContent>
            {RESTAURANT_TYPE_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
        {selectValue === "Other" && (
          <Input
            className="mt-2"
            placeholder="Type your own"
            value={draft.type}
            onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
            aria-label="Custom restaurant type"
          />
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <Button type="button" onClick={save} disabled={!dirty}>Save restaurant profile</Button>
      </div>
    </div>
  );
}
