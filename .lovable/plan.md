# Real Meal-Period Configuration

## 1. What's currently in the code

**Availability meal picker** — `src/components/sidework/AvailabilityEditor.tsx`, `MEAL_PRESETS` (lines ~20-27). Today it shows a single-select dropdown with 6 presets:
- Lunch Only, Dinner Only, Lunch & Dinner, Breakfast Only, Breakfast & Lunch, Breakfast & Dinner.

Breakfast is **already** exposed here (I was wrong to assume it wasn't). What's missing is a "Breakfast, Lunch & Dinner" preset (all three) and — more importantly — the fact that "Breakfast" is meaningless because `mealForShiftStart` uses fixed clock cutoffs.

**Hours editor UI** — exists at `src/routes/manager.tsx` line 2338-2346 (Settings tab, "Restaurant hours" card) using `RestaurantHoursEditor` from `AvailabilityEditor.tsx`. Today: one open/close per day + closed toggle. No concept of meal periods.

**Hardcoded cutoffs** — `sidework-store.tsx` `mealForShiftStart`: <11:00 Breakfast, <16:00 Lunch, ≥16:00 Dinner. Consumed by `isAvailableFor`, which is called from `ScheduleSection.tsx` at three sites: AI generate (line 193), copy-to-next-week (line 277), and dialog warning (line 728).

**Persistence** — `restaurant_hours` is a jsonb column on `profiles`; `fetchRestaurantHours`/`saveRestaurantHours` treat it as opaque `unknown`. Safe to evolve the shape.

## 2. Proposed data model — per restaurant, site-wide

Keep the per-day `closed`/`open`/`close` window (some restaurants close Mondays; overall business hours still matter for the schedule grid). **Add** a site-wide meal-period config alongside it — three periods, each toggleable with its own start/end:

```ts
type MealPeriodConfig = { enabled: boolean; start: string; end: string }; // "HH:MM"
type MealPeriods = { Breakfast: MealPeriodConfig; Lunch: MealPeriodConfig; Dinner: MealPeriodConfig };

type RestaurantHoursV2 = {
  version: 2;
  days: Record<DayKey, DayHours>;      // existing shape, per-day open/close/closed
  mealPeriods: MealPeriods;            // NEW, site-wide
};
```

Site-wide (not per-day) matches the owner's ask ("three choices... start and end time for each") and keeps the UI simple. Per-day would double the surface area with almost no real-world benefit for independent restaurants.

Sensible defaults on first load: Breakfast disabled (7:00–10:30), Lunch disabled (11:00–14:30), Dinner enabled (16:00–21:30). Owner opts periods in.

## 3. Replacing `mealForShiftStart`

New signature: `mealForShiftStart(start: string, periods: MealPeriods): Meal | null`.

Rules, in order:
1. If the start time falls inside an **enabled** period's `[start, end)` window, return that meal.
2. If it falls in a gap between two enabled periods (e.g. 3:15 when Lunch ends 15:00 and Dinner starts 16:00), snap to the **next upcoming** enabled period (Dinner). Rationale: a 3:15 shift start almost always means the employee is coming in early to prep for dinner service, not extending lunch.
3. If it's after the last enabled period ends, snap to that last period (closing shift).
4. If it's before the first enabled period starts, snap to that first period.
5. If no periods are enabled at all, return `null` and treat `isAvailableFor` as unrestricted (fall back to today's behavior of not blocking).

`isAvailableFor(av, start, periods)` gains a `periods` arg; call sites in `ScheduleSection.tsx` pull `mealPeriods` from the store.

## 4. Migration plan for the jsonb column

No SQL migration needed — column is jsonb. Handle shape in the loader:

- `fetchRestaurantHours` returns `unknown`. Add a `normalizeRestaurantHours(raw)` helper in the store:
  - If `raw?.version === 2`, use as-is.
  - If `raw` looks like the current flat `Record<DayKey, DayHours>` (no `version`), wrap as `{ version: 2, days: raw, mealPeriods: defaultMealPeriods() }`.
  - If null/invalid, return full defaults.
- `saveRestaurantHours` always writes the v2 shape.
- One-time: on first load after upgrade, if we upgraded a v1 payload we save it back so the DB reflects v2.

## 5. AI Generate Schedule integration

The AI generator (`ScheduleSection.tsx` ~line 193) already calls `isAvailableFor(av, desiredStart)`. Two changes:

1. Pass `mealPeriods` through so `desiredStart` maps to the *real* configured meal, not the hardcoded one.
2. When choosing candidate shift start times per role, derive them from the enabled meal periods (e.g. start Lunch shifts at `mealPeriods.Lunch.start`, Dinner at `mealPeriods.Dinner.start`) rather than a fixed default. This means an employee marked "Lunch only" is naturally offered the lunch slot and never gets proposed for a dinner shift — no post-hoc warning needed.

Copy-to-next-week: same predicate swap; behavior is otherwise unchanged (already skips conflicts).

## 6. "Is hours setup complete?" surfacing

- Add a `hoursConfigured` derived flag: true when at least one meal period is enabled AND at least one day is open.
- Show an amber banner on the Schedule tab and on the Settings → Restaurant hours card when `hoursConfigured` is false: *"Set your restaurant's meal periods so scheduling can respect employee availability accurately."* Link scrolls to the Restaurant hours card.
- On the AvailabilityEditor meal-picker, dim/hide preset options that reference a disabled period (e.g. hide "Breakfast Only" when Breakfast is disabled site-wide) so owners aren't offered nonsense choices.

## 7. UI changes summary

- `RestaurantHoursEditor` gains a new top section "Meal periods" — three rows (Breakfast/Lunch/Dinner), each with an enable switch + two time inputs. Below it, the existing per-day open/close list stays.
- `AvailabilityEditor` preset list is filtered by enabled meal periods; if all three are enabled, add a "Breakfast, Lunch & Dinner" preset.
- Banner component when hours aren't configured.

## 8. Technical notes

- All new types in `sidework-store.tsx`; no new files needed beyond editor tweaks.
- No DB migration; jsonb absorbs the shape change with a normalizer.
- No breaking changes to `Meal` type or `DayAvailability`.
- Time comparisons stay as `"HH:MM"` string compares (already the pattern).

## 9. Out of scope

- Per-day meal periods (deferrable if a user ever needs it).
- Multi-service overlap (e.g. brunch bridging Breakfast+Lunch).
- Hard-blocking (vs warn+override) partial-availability conflicts — keeping current UX.

Waiting for your go-ahead before implementing.
