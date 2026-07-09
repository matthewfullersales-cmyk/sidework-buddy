# Smarter shift-time suggestions from restaurant hours + meal periods

## Goal

Replace the two blank `<input type="time">` fields in the Add/Edit Shift dialog with a **suggestion-first time picker** whose options are computed from that restaurant's real `restaurant_hours` + `mealPeriods`, offset by a per-section/role "arrival lead time" (BOH prep-in is earlier than FOH floor-in, both are before food service). Manual entry stays fully open — the suggestions are a shortcut, never a gate. No changes to the meal-period conflict-warning logic.

## Current state (audit)

- `ShiftDetailsDialog` (ScheduleSection.tsx line 706+) currently uses two raw `<Input type="time">` fields, defaulting to `existing?.start ?? "17:00"` / `"23:00"`. No awareness of the day's open/close or the configured meal periods.
- `defaultShift(position, isWeekend)` (line 83) has a hardcoded per-position start/end table — the exact thing Matt wants replaced by per-restaurant config.
- Store already exposes `restaurantHours: RestaurantHours` (per-day `{open, close, closed}`) and `mealPeriods: MealPeriods` (Breakfast/Lunch/Dinner each `{enabled, start, end}`), persisted in `profiles.restaurant_hours` as `RestaurantHoursConfigV2`.
- Employee has `position: Position` and `section: "FOH" | "BOH"` already — no schema change needed to key offsets by section, and position is available for finer overrides.
- Meal-period conflict UI (`availConflict` block, lines 745–812) is independent of the time picker and will not be touched. Same for `isAvailableForRange`.

### Copy-to-next-week audit (requested)

**Already implemented, no gap.** `performCopyToNextWeek` (lines 275–319) does:
- Skips any shift whose destination date has `timeOffStatusFor === "approved"` (counted as "X skipped — approved time off").
- Skips any shift where the destination weekday violates the employee's recurring `weeklyAvailability` via `isAvailableFor(av, s.start, mealPeriods)` ("X skipped — recurring unavailability").
- Toast reports both skip counts. Destination week's existing shifts are cleared first, with a confirm dialog when count > 0.

Two minor gaps worth flagging (not fixing this turn):
1. It skips on `isAvailableFor(av, start)` (start-only), not `isAvailableForRange(av, start, end)` — so a shift that starts in Lunch but extends into a Dinner-unavailable window would copy through silently. Same class as the bug we already fixed in the dialog.
2. Pending (not approved) time-off on the destination date is not surfaced at all — copies through without a warning.

## Proposed data model addition — arrival offsets

Live it entirely in the existing `profiles.restaurant_hours` JSON blob so no migration is needed. Bump to `V3` with backward-compatible normalization (same pattern used for the V1→V2 upgrade).

```ts
// Minutes an employee is expected to clock in BEFORE food-service start
// for the meal period they're working. Section defaults cover the common case;
// per-position map overrides for the exceptions (e.g. Prep Cook needs more lead).
type ArrivalOffsets = {
  bySection: { FOH: number; BOH: number };   // default 60 / 120
  byPosition?: Partial<Record<Position, number>>;
};

type RestaurantHoursConfigV3 = {
  version: 3;
  days: RestaurantHours;
  mealPeriods: MealPeriods;
  arrivalOffsets: ArrivalOffsets;
};
```

**Defaults:** FOH 60 min, BOH 120 min. Common per-position overrides pre-seeded (adjustable): Prep Cook 240, Dishwasher 30, Manager 90, Hostess 30. Owner sees a small table in Settings under the Meal Periods card to edit any of these — one row per section (always shown) and one row per position that has staff.

**Read path:** helper `arrivalOffsetFor(position, section, offsets)` → returns `byPosition[position] ?? bySection[section] ?? 60`.

`normalizeRestaurantHoursConfig` gains a V2→V3 branch that just injects default `arrivalOffsets` when missing. No SQL migration; existing rows just re-hydrate as V3 next save.

## Suggested-times generation

For the shift's employee + role + date, build an ordered list of `{label, start, end}` suggestions:

1. Determine the day's hours from `restaurantHours[dayKey]`. If `closed`, still allow suggestions from meal periods (owner may need a special-day shift) but flag with `(day marked closed)`.
2. For each **enabled** meal period `m` (Breakfast/Lunch/Dinner):
   - `serviceStart = m.start`, `serviceEnd = m.end`.
   - `arrivalMin = arrivalOffsetFor(emp.position, emp.section)`.
   - `suggestStart = max(dayOpen, serviceStart − arrivalMin)` (never propose earlier than the door opens — owner still overrides manually if needed).
   - `suggestEnd = min(dayClose, serviceEnd + closeoutMin)` where `closeoutMin` is a symmetric section default (FOH 30, BOH 60) — same offsets table, second field, or a fixed constant with a follow-up if we want it configurable.
   - Emit `{ label: "Dinner — arrive 3:00pm, out 9:30pm", start: "15:00", end: "21:30" }`.
3. If two adjacent meal periods are both enabled (Lunch + Dinner) and this employee is typically a double, emit a combined suggestion spanning the earliest arrival to the latest closeout.
4. Emit an "Open-to-close" suggestion using raw `dayOpen`/`dayClose` when both are set.
5. De-dupe by `(start,end)` and order by `start` ascending.

Suggestions are ordered so the picker's first option matches the meal period that best fits `emp.weeklyAvailability` for that day (e.g. Dinner-only employee → Dinner suggestion first), keeping picker + availability warning aligned without the picker enforcing anything.

## UI: shift dialog time inputs

Replace the two bare time inputs with a compact composite:

```text
┌ Start ────────────┐  ┌ End ──────────────┐
│ [ 15:00  ▾ ]      │  │ [ 21:30  ▾ ]      │
└───────────────────┘  └───────────────────┘
  Suggestions
  • Dinner  (arrive 3:00pm → 9:30pm)     ← primary suggestion, highlighted
  • Lunch   (arrive 10:00am → 3:30pm)
  • Lunch + Dinner double (10:00am → 9:30pm)
  • Open-to-close (10:00am → 10:00pm)
  • Custom…                              ← keeps free-form entry
```

Behavior:
- The inputs remain `type="time"`, so typing/keyboard/native picker still works exactly as today. Clicking a suggestion just fills both fields.
- A small "Suggestions" popover (Command / Popover from shadcn — already in the codebase) hangs off each input, or a single "Suggestions ▾" button above the pair. Prefer the single button so keyboard flow into the two inputs is unchanged.
- No suggestion is auto-applied for a brand-new shift beyond seeding the *first* suggestion into the fields as the default (replaces today's hardcoded 17:00–23:00). User can immediately clear or overtype.
- If `hoursConfigured(...)` is false, skip suggestions entirely and show an inline hint "Set operating hours in Settings to get time suggestions" — free-form inputs behave exactly like today so the picker never regresses.
- Suggestions never *disable* the Save button and never gate the availability warning — those keep firing based purely on the actual entered `start`/`end` against `mealPeriods` + `weeklyAvailability`.

## Settings UI (adjacent to existing Meal Periods card)

New "Arrival lead time" card:
- Two always-visible rows: FOH default (min), BOH default (min).
- Collapsible "Per-position overrides" list: one row per `Position` currently held by any active employee, blank input meaning "use section default". Small "Reset to defaults" link.
- Copy above the card: "How early should staff clock in before their meal period's service start? Used to suggest shift times when you build the schedule."

## Interaction with existing conflict warnings (guardrail)

Explicitly reaffirm:
- `availConflict` / `isAvailableForRange` still runs against the entered `start`/`end`.
- If an owner picks a suggestion whose start falls inside e.g. Lunch (bartender arriving 3pm for a 4pm dinner service, when meal periods happen to be Lunch 11–15 & Dinner 15–21), the warning behaves exactly as it does today for that shift. That's the correct, documented behavior — the arrival offset is a scheduling convenience, not a bypass. If an owner wants "3pm counts as Dinner prep, not Lunch," the correct answer is to adjust the Lunch end / Dinner start in Meal Periods.

## Out of scope

- AI-generated first week, preferred-staff learning — deferred.
- Fixing the two `copy-to-next-week` gaps flagged above — surface only, do not touch in this change.
- Auto-adjusting meal-period boundaries from arrival offsets — offsets are additive UI only.

## Technical work list

1. `src/lib/sidework-store.tsx`
   - Add `ArrivalOffsets`, `RestaurantHoursConfigV3`, `defaultArrivalOffsets()`.
   - Extend `normalizeRestaurantHoursConfig` for V2→V3 (inject defaults).
   - Extend `serializeRestaurantHoursConfig` to persist V3.
   - Add store fields `arrivalOffsets` + `setArrivalOffsets` (persist via existing `saveRestaurantHours` path).
   - Export helpers `arrivalOffsetFor(position, section, offsets)` and `suggestedShiftTimes({dayKey, position, section, restaurantHours, mealPeriods, arrivalOffsets})`.
2. `src/components/sidework/AvailabilityEditor.tsx` (Settings tab already renders Meal Periods here)
   - New `ArrivalOffsetsEditor` card below Meal Periods, reads/writes via store.
3. `src/components/sidework/ScheduleSection.tsx`
   - Replace the two-input block in `ShiftDetailsDialog` with a `TimeWithSuggestions` subcomponent (single Popover trigger, two `type="time"` inputs unchanged).
   - When opening for a *new* shift (`existing` falsy), seed `start`/`end` from `suggestedShiftTimes(...)`'s first entry instead of the hardcoded `17:00`/`23:00`.
   - Leave `availConflict` / time-off / override logic untouched.
4. Live verify with Playwright (America/Los_Angeles) at `/manager`:
   - Set Dinner 16:00–21:00, FOH arrival 60, BOH arrival 120.
   - Open Add Shift for a Server → first suggestion reads "Dinner — arrive 3:00pm → …" and clicking it sets 15:00 start.
   - Open Add Shift for a Line Cook → first suggestion is 14:00 start (120 min).
   - Manually type 02:30 start → Save still works, no picker interference.
   - Existing availability warning still fires for a Dinner-only employee scheduled at a Lunch time.
5. `bun run build` clean.

## Verification checklist before "done"

- [ ] V2 profiles auto-upgrade to V3 on load with default offsets, no crash.
- [ ] Settings arrival-offset edits round-trip through save/reload.
- [ ] Suggestions dropdown matches expected list for a known hours/meal-period/offset config.
- [ ] Manual typing in the time inputs works exactly like today.
- [ ] Meal-period availability warning still fires unchanged for the same start/end that would have fired before this feature.
- [ ] `copyToNextWeek` behavior unchanged (still skips approved time off + recurring unavailability with the same toast).
