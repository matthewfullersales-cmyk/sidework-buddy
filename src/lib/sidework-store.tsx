import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { ROLE_COLORS, ROLES_ORDERED, BOH_ROLES_ORDERED, effectiveRoles } from "@/lib/role-colors";
import { formatTime12h } from "@/lib/utils";
import {
  fetchOwnerPostings,
  insertPosting,
  updatePostingOpen,
  deletePosting,
} from "@/lib/hiring-supabase";
import {
  fetchOwnerEmployees,
  hasSupabaseSession,
  insertEmployee,
  updateEmployeeRow,
  approveEmployeeRow,
  deleteEmployeeRow,
  archiveEmployeeRow,
  reactivateEmployeeRow,

  fetchRestaurantHours,
  saveRestaurantHours,
  fetchBusinessInfo,
  saveBusinessInfo,
  fetchRestaurantProfile,
  saveRestaurantProfile,
  fetchMenuTestConfig,
  fetchMenuTestConfigViaRpc,
  saveMenuTestConfig,
  fetchRoleConfig,
  saveRoleConfig,
  createStaffInviteRow,
} from "@/lib/employees-supabase";

import {
  fetchOwnerShifts,
  upsertShiftRow,
  ShiftConflictError,
  deleteShiftRow,
  reassignShiftEmployee,
  fetchOwnerTimeOff,
  insertTimeOffRow,
  updateTimeOffRow,
  deleteTimeOffRow,
  fetchOwnerTrades,
  insertTradeRow,
  updateTradeRow,
} from "@/lib/schedule-supabase";
import {
  fetchMyEmployeeRow,
  fetchMyShifts,
  fetchOwnerOpenTrades,
  fetchShiftsByIds,
  fetchMyTimeOff,
  fetchCoworkerNames,
} from "@/lib/employee-supabase";
import {
  fetchOwnerTrainingProgress,
  fetchEmployeeTrainingProgress,
  upsertTrainingProgress,
  fetchMenuBankMeta,
} from "@/lib/training-progress-supabase";

import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export type Role = string;
export const BUILT_IN_ROLES = ROLES_ORDERED;
export type BuiltInRole = string;
export interface CustomRole { name: string; section: "FOH" | "BOH"; color: string }




export interface VideoProgress {
  videoId: string;
  watchedSec: number;
  completedAt?: string;
  quizScore?: number;
  passed?: boolean;
  attempts: number;
  lockedOut?: boolean;
  /** Set true if the employee switched tabs/apps during their most recent quiz attempt. */
  distractionFlagged?: boolean;
  /**
   * Only used for `videoId === "menu-quiz"`. Version of the menu bank the
   * employee passed against. When the owner regenerates the menu bank the
   * new bank_version supersedes this, and the pass is treated as stale
   * (schedule access re-locks until they retake).
   */
  bankVersion?: number;
}


export type Section = "FOH" | "BOH";
export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export const DAY_KEYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export type Meal = "Breakfast" | "Lunch" | "Dinner";
/** Half of the day a Partial availability covers. Literal "Day"/"Night" at
 * every restaurant — deliberately NOT derived from configured meal periods,
 * so it stays meaningful on days the restaurant is closed to the public. */
export type DayHalf = "day" | "night";
export type DayAvailability =
  | { kind: "full" }
  | { kind: "none" }
  | { kind: "partial"; meals?: Meal[]; half?: DayHalf };
export type WeeklyAvailability = Record<DayKey, DayAvailability>;

export type Relationship = "Spouse" | "Parent" | "Sibling" | "Child" | "Friend" | "Other";
export interface EmergencyContact {
  firstName: string;
  lastName: string;
  phone: string;
  relationship: Relationship;
}

export type DayHours = { closed: boolean; open: string; close: string };
export type RestaurantHours = Record<DayKey, DayHours>;

export type MealPeriodConfig = { enabled: boolean; start: string; end: string };
export type MealPeriods = { Breakfast: MealPeriodConfig; Lunch: MealPeriodConfig; Dinner: MealPeriodConfig };
export type RestaurantHoursConfigV2 = { version: 2; days: RestaurantHours; mealPeriods: MealPeriods };

// Minutes an employee is expected to clock in BEFORE their meal period's
// service start (e.g. FOH bartenders come in 1hr before dinner service to
// stock the bar; BOH prep needs 2+ hours). Suggestions layer only — never
// used to enforce or loosen availability conflict checks.
export type ArrivalOffsets = {
  bySection: { FOH: number; BOH: number };
  byPosition?: Partial<Record<string, number>>;
};
export type RestaurantHoursConfigV3 = {
  version: 3;
  days: RestaurantHours;
  mealPeriods: MealPeriods;
  arrivalOffsets: ArrivalOffsets;
};

// Owner-editable "Restaurant Info" — physical address, phone, website, and
// social handles. Persisted as jsonb on profiles.business_info so we can add
// fields later without a migration. All fields optional; blank = null.
export type BusinessInfo = {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
};

export function defaultBusinessInfo(): BusinessInfo {
  return {};
}

export function normalizeBusinessInfo(raw: unknown): BusinessInfo {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const pick = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  return {
    street: pick("street"),
    city: pick("city"),
    state: pick("state"),
    zip: pick("zip"),
    phone: pick("phone"),
    email: pick("email"),
    website: pick("website"),
    instagram: pick("instagram"),
    facebook: pick("facebook"),
    tiktok: pick("tiktok"),
  };
}


export function defaultWeeklyAvailability(): WeeklyAvailability {
  return DAY_KEYS.reduce((acc, d) => { acc[d] = { kind: "full" }; return acc; }, {} as WeeklyAvailability);
}

export function defaultRestaurantHours(): RestaurantHours {
  return {
    Mon: { closed: false, open: "16:00", close: "21:30" },
    Tue: { closed: false, open: "16:00", close: "21:30" },
    Wed: { closed: false, open: "16:00", close: "21:30" },
    Thu: { closed: false, open: "16:00", close: "21:30" },
    Fri: { closed: false, open: "16:00", close: "21:30" },
    Sat: { closed: false, open: "16:00", close: "21:30" },
    Sun: { closed: false, open: "15:00", close: "21:00" },
  };
}

export function defaultMealPeriods(): MealPeriods {
  return {
    Breakfast: { enabled: false, start: "07:00", end: "10:30" },
    Lunch: { enabled: false, start: "11:00", end: "14:30" },
    Dinner: { enabled: true, start: "16:00", end: "21:30" },
  };
}

export function defaultArrivalOffsets(): ArrivalOffsets {
  return {
    bySection: { FOH: 60, BOH: 120 },
    byPosition: {
      "Prep Cook": 240,
      Dishwasher: 30,
      Manager: 90,
      Hostess: 30,
    },
  };
}

export function arrivalOffsetFor(
  position: string | undefined,
  section: Section | undefined,
  offsets: ArrivalOffsets,
): number {
  if (position && offsets.byPosition && position in offsets.byPosition) {
    const v = offsets.byPosition[position];
    if (typeof v === "number") return v;
  }
  if (section === "BOH") return offsets.bySection.BOH;
  return offsets.bySection.FOH;
}

// Section-level "closeout" tail after the meal period ends (breakdown, tickets,
// sidework). Kept as a fixed default for now; if owners ask, promote to config.
function closeoutMinFor(section: Section | undefined): number {
  return section === "BOH" ? 60 : 30;
}

// Normalize whatever comes back from the jsonb column. Supports v1 (flat
// Record<DayKey, DayHours>), v2 ({version, days, mealPeriods}), and v3
// (v2 + arrivalOffsets).
export function normalizeRestaurantHoursConfig(raw: unknown): {
  days: RestaurantHours;
  mealPeriods: MealPeriods;
  arrivalOffsets: ArrivalOffsets;
  upgradedFromV1: boolean;
} {
  const defaults = {
    days: defaultRestaurantHours(),
    mealPeriods: defaultMealPeriods(),
    arrivalOffsets: defaultArrivalOffsets(),
    upgradedFromV1: false,
  };
  if (!raw || typeof raw !== "object") return defaults;
  const obj = raw as Record<string, unknown>;
  if ((obj.version === 2 || obj.version === 3) && obj.days && obj.mealPeriods) {
    const rawOffsets = (obj as { arrivalOffsets?: unknown }).arrivalOffsets;
    const defOff = defaultArrivalOffsets();
    let arrivalOffsets = defOff;
    if (rawOffsets && typeof rawOffsets === "object") {
      const r = rawOffsets as { bySection?: Partial<ArrivalOffsets["bySection"]>; byPosition?: ArrivalOffsets["byPosition"] };
      arrivalOffsets = {
        bySection: { ...defOff.bySection, ...(r.bySection ?? {}) },
        byPosition: { ...(defOff.byPosition ?? {}), ...(r.byPosition ?? {}) },
      };
    }
    return {
      days: { ...defaultRestaurantHours(), ...(obj.days as RestaurantHours) },
      mealPeriods: { ...defaultMealPeriods(), ...(obj.mealPeriods as MealPeriods) },
      arrivalOffsets,
      upgradedFromV1: false,
    };
  }
  // v1: flat DayKey map
  const looksLikeV1 = DAY_KEYS.some((d) => d in obj);
  if (looksLikeV1) {
    return {
      days: { ...defaultRestaurantHours(), ...(obj as RestaurantHours) },
      mealPeriods: defaultMealPeriods(),
      arrivalOffsets: defaultArrivalOffsets(),
      upgradedFromV1: true,
    };
  }
  return defaults;
}

export function serializeRestaurantHoursConfig(
  days: RestaurantHours,
  mealPeriods: MealPeriods,
  arrivalOffsets?: ArrivalOffsets,
): RestaurantHoursConfigV3 {
  return { version: 3, days, mealPeriods, arrivalOffsets: arrivalOffsets ?? defaultArrivalOffsets() };
}

// Format "HH:MM" (24h) → "3:00 PM" for suggestion labels. Delegates to the
// shared formatter so every user-facing time renders identically.
function fmt12(hhmm: string): string {
  return formatTime12h(hhmm);
}

function subMin(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  let total = (h ?? 0) * 60 + (m ?? 0) - min;
  if (total < 0) total = 0;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
function addMin(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  let total = (h ?? 0) * 60 + (m ?? 0) + min;
  if (total > 24 * 60 - 1) total = 24 * 60 - 1;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
function maxTime(a: string, b: string): string { return a > b ? a : b; }
function minTime(a: string, b: string): string { return a < b ? a : b; }

export interface ShiftSuggestion {
  key: string;
  label: string;
  start: string;
  end: string;
  meals: Meal[];
}

// Build ordered shift-time suggestions for an employee on a given weekday.
// Suggestions come from the restaurant's real hours + enabled meal periods,
// shifted earlier by that employee's arrival offset. Manual entry always
// remains available — these are convenience presets only.
export function suggestedShiftTimes(input: {
  dayKey: DayKey;
  section: Section | undefined;
  restaurantHours: RestaurantHours;
  mealPeriods: MealPeriods;
  preferredMeals?: Meal[]; // used to bubble a matching suggestion to the top
}): ShiftSuggestion[] {
  const { dayKey, section, restaurantHours, mealPeriods, preferredMeals } = input;
  const day = restaurantHours[dayKey];
  // Arrival lead time was removed — suggestions now use each enabled meal
  // period's raw start/end so what the owner configures is what they see.
  const closeout = closeoutMinFor(section);
  const dayOpen = day.closed ? "00:00" : day.open;
  const dayClose = day.closed ? "23:59" : day.close;
  const order: Meal[] = ["Breakfast", "Lunch", "Dinner"];
  const enabled = order.filter((m) => mealPeriods[m].enabled);
  const suggestions: ShiftSuggestion[] = [];

  for (const m of enabled) {
    const p = mealPeriods[m];
    const start = maxTime(dayOpen, p.start);
    const end = minTime(dayClose, addMin(p.end, closeout));
    if (start >= end) continue;
    suggestions.push({
      key: `single-${m}`,
      label: `${m} — ${fmt12(start)} → ${fmt12(end)}`,
      start,
      end,
      meals: [m],
    });
  }

  // Combined doubles for any two adjacent enabled periods (e.g. Lunch + Dinner).
  for (let i = 0; i + 1 < enabled.length; i++) {
    const a = enabled[i]!, b = enabled[i + 1]!;
    const start = maxTime(dayOpen, mealPeriods[a].start);
    const end = minTime(dayClose, addMin(mealPeriods[b].end, closeout));
    if (start >= end) continue;
    suggestions.push({
      key: `double-${a}-${b}`,
      label: `${a} + ${b} double — ${fmt12(start)} → ${fmt12(end)}`,
      start,
      end,
      meals: [a, b],
    });
  }

  // Open-to-close as a last option, if the day has real hours.
  if (!day.closed && day.open && day.close && day.open < day.close) {
    suggestions.push({
      key: "open-to-close",
      label: `Open-to-close — ${fmt12(day.open)} → ${fmt12(day.close)}`,
      start: day.open,
      end: day.close,
      meals: enabled,
    });
  }

  // De-dupe by (start,end).
  const seen = new Set<string>();
  const deduped = suggestions.filter((s) => {
    const k = `${s.start}-${s.end}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Bubble the suggestion whose meals best match preferredMeals to the top,
  // then order the rest by start time ascending.
  deduped.sort((a, b) => a.start.localeCompare(b.start));
  if (preferredMeals && preferredMeals.length > 0) {
    const pref = new Set(preferredMeals);
    const score = (s: ShiftSuggestion) =>
      s.meals.length === pref.size && s.meals.every((m) => pref.has(m)) ? 0
        : s.meals.every((m) => pref.has(m)) ? 1
        : s.meals.some((m) => pref.has(m)) ? 2 : 3;
    deduped.sort((a, b) => score(a) - score(b));
  }
  return deduped;
}


// Map a shift start "HH:MM" to a meal period using the restaurant's configured
// windows. If the start falls in a gap between periods, snap to the NEXT
// upcoming enabled period (a 3:15pm start with lunch ending at 15:00 and
// dinner starting at 16:00 is treated as a dinner prep shift). If no periods
// are enabled, returns null and callers treat availability as unrestricted.
export function mealForShiftStart(start: string, periods?: MealPeriods): Meal | null {
  const p = periods ?? defaultMealPeriods();
  const order: Meal[] = ["Breakfast", "Lunch", "Dinner"];
  const enabled = order.filter((m) => p[m].enabled);
  if (enabled.length === 0) return null;
  // Inside a window
  for (const m of enabled) {
    if (start >= p[m].start && start < p[m].end) return m;
  }
  // Before first
  if (start < p[enabled[0]!].start) return enabled[0]!;
  // Snap to next upcoming; if past all, snap to last
  for (const m of enabled) {
    if (start < p[m].start) return m;
  }
  return enabled[enabled.length - 1]!;
}

/** Which half of the day a shift belongs to, judged ONLY by arrival time.
 * 00:00–11:59 → day, 12:00–23:59 → night. Fixed rule: reads no restaurant
 * configuration (no meal periods, no hours, no arrival offsets). End time and
 * midnight crossings are irrelevant. */
export function halfForShiftStart(start: string): DayHalf {
  const [h] = start.split(":").map(Number);
  return (h ?? 0) < 12 ? "day" : "night";
}

/** Read the Day/Night half off a partial availability, deriving it from legacy
 * `meals` when `half` is absent (any meal after Lunch → night, else day). */
export function halfForAvailability(av: DayAvailability | undefined): DayHalf | null {
  if (!av || av.kind !== "partial") return null;
  if (av.half === "day" || av.half === "night") return av.half;
  const meals = av.meals ?? [];
  if (meals.length === 0) return null;
  return meals.includes("Dinner") ? "night" : "day";
}

export function isAvailableFor(av: DayAvailability | undefined, start: string): boolean {
  if (!av || av.kind === "full") return true;
  if (av.kind === "none") return false;
  const want = halfForAvailability(av);
  if (want === null) return true; // partial with no half recorded → don't block
  return want === halfForShiftStart(start);
}


// Minutes-since-midnight; end<=start is treated as crossing midnight (24:00).
function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// All enabled meal periods whose window [p.start, p.end) overlaps the shift
// range [start, end). Overnight shifts (end<=start) are clipped to end-of-day
// for period math.
export function mealsInShiftRange(start: string, end: string, periods?: MealPeriods): Meal[] {
  const p = periods ?? defaultMealPeriods();
  const order: Meal[] = ["Breakfast", "Lunch", "Dinner"];
  const enabled = order.filter((m) => p[m].enabled);
  if (enabled.length === 0) return [];
  const s = toMin(start);
  let e = toMin(end);
  if (e <= s) e = 24 * 60;
  const touched = enabled.filter((m) => {
    const ps = toMin(p[m].start);
    const pe = toMin(p[m].end);
    return ps < e && pe > s;
  });
  if (touched.length > 0) return touched;
  const single = mealForShiftStart(start, p);
  return single ? [single] : [];
}

// Range-aware availability: every meal period the shift touches must be one
// the employee is available for. Catches shifts that start inside an approved
// period but end inside a disallowed one (e.g. Lunch-only, 14:45–15:15 crosses
// into Dinner at 15:00).
export function isAvailableForRange(
  av: DayAvailability | undefined,
  start: string,
  end: string,
  periods?: MealPeriods,
): { ok: boolean; touched: Meal[]; violating: Meal[] } {
  if (!av || av.kind === "full") return { ok: true, touched: [], violating: [] };
  if (av.kind === "none") return { ok: false, touched: [], violating: [] };
  const touched = mealsInShiftRange(start, end, periods);
  if (touched.length === 0) return { ok: true, touched, violating: [] };
  const violating = touched.filter((m) => !(av.meals ?? []).includes(m));
  return { ok: violating.length === 0, touched, violating };
}

// Two enabled meal periods TRULY overlap when the later's start < earlier's
// end. Touching at a single instant (Lunch ends 15:00 / Dinner starts 15:00)
// is NOT an overlap — the half-open intervals in mealForShiftStart handle it.
export function findMealPeriodOverlaps(periods: MealPeriods): Array<{ winner: Meal; loser: Meal }> {
  const order: Meal[] = ["Breakfast", "Lunch", "Dinner"];
  const enabled = order.filter((m) => periods[m].enabled);
  const out: Array<{ winner: Meal; loser: Meal }> = [];
  for (let i = 0; i < enabled.length; i++) {
    for (let j = i + 1; j < enabled.length; j++) {
      const a = enabled[i]!, b = enabled[j]!;
      if (toMin(periods[b].start) < toMin(periods[a].end)) {
        // mealForShiftStart iterates Breakfast→Lunch→Dinner and returns the
        // first match, so the earlier meal (a) wins the overlap.
        out.push({ winner: a, loser: b });
      }
    }
  }
  return out;
}

export function hoursConfigured(days: RestaurantHours, mealPeriods: MealPeriods): boolean {
  const anyOpen = DAY_KEYS.some((d) => !days[d].closed);
  const anyMeal = (["Breakfast", "Lunch", "Dinner"] as Meal[]).some((m) => mealPeriods[m].enabled);
  return anyOpen && anyMeal;
}

export interface Employee {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  primaryRole: Role;
  approvedRoles: Role[];
  autoApproveRoles: Role[];
  availability: string;
  weeklyAvailability?: WeeklyAvailability;
  emergencyContact?: EmergencyContact;
  invitedAt: string;
  onboardingStarted: boolean;
  personalInfoComplete: boolean;
  progress: VideoProgress[];
  // Carry-forward context from the application that created this employee
  hiredFromApplicationId?: string;
  applicationPitch?: string;
  appliedAt?: string;
  workExperience?: WorkExperience[];
  /** Lifecycle state from the people row ("active", "inactive", "hired", ...). */
  state?: string;
  /** "pending" = joined via the public link and awaiting owner approval. */
  joinStatus?: "active" | "pending";
  /** How this person got onto the roster ("join_link" for public self-joins). */
  joinedVia?: string;
}

/** Fail closed: only an explicit "active" (or a locally-created row) counts as staff. */
export function isPendingJoin(e: Pick<Employee, "joinStatus">): boolean {
  return e.joinStatus === "pending";
}

export function isArchivedEmployee(e: Pick<Employee, "state">): boolean {
  return e.state === "inactive";
}


export interface Shift {
  id: string;
  employeeId: string;
  role: Role;
  date: string;
  start: string;
  end: string;
  notes?: string;
  /** Server-maintained mtime; used for optimistic concurrency on updates. */
  updatedAt?: string;
}

export type TradeStatus = "open" | "pending_approval" | "approved" | "denied" | "cancelled";

export interface Trade {
  id: string;
  shiftId: string;
  postedBy: string;
  claimedBy?: string;
  status: TradeStatus;
  createdAt: string;
  resolvedAt?: string;
  approvedBy?: string;
  autoApproved?: boolean;
  note?: string;
}

export interface JobPosting {
  id: string;
  title: string;
  role: Role;
  type: "Full-time" | "Part-time";
  payRange: string;
  description: string;
  postedAt: string;
  open: boolean;
}

export type AvailabilityHours = "Mornings" | "Afternoons" | "Evenings" | "Open availability";

export interface WorkExperience {
  employer: string;
  position: string;
  duration: "Less than 6 months" | "6 months - 1 year" | "1 - 2 years" | "2 - 5 years" | "5+ years" | "";
}

export type TimeOffStatus = "pending" | "approved" | "denied";

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  status: TimeOffStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface MenuUpload {
  name: string;
  type: string;
  sizeKB: number;
  uploadedAt: string;
  generatedAt?: string;
  preview?: string;
}

/** Menu types an owner can upload in the setup wizard. */
export type MenuKind = "food" | "drink" | "dessert";

export type ServiceStyle = "Casual Dining" | "Upscale Casual" | "Fine Dining" | "Bar and Nightlife" | "Fast Casual";
export type Priority = "Speed of service" | "Warm hospitality" | "Product knowledge" | "Upselling" | "All equally important";

export interface RestaurantProfile {
  name: string;
  concept: string;
  serviceStyle: ServiceStyle;
  priority: Priority;
  guestExperience: string;
  nonNegotiables: string;
  pastProblems: string;
  completedAt: string;
  slug?: string;
}

export interface Notification {
  id: string;
  type: "training_passed" | "training_failed" | "training_locked";
  message: string;
  employeeId?: string;
  videoId?: string;
  createdAt: string;
  read: boolean;
}

export type MenuBankMeta = { version: number; updatedAt: string; foodCount: number; drinkCount: number; dessertCount: number };

interface Store {

  currentUser: { type: "manager"; id: "owner" } | { type: "employee"; id: string };
  setCurrentUser: (u: Store["currentUser"]) => void;
  employeeHydrating: boolean;
  employeeHydratedTargetId: string | null;
  employeeHydrationError: string | null;
  employees: Employee[];
  shifts: Shift[];
  trades: Trade[];
  jobs: JobPosting[];
  timeOff: TimeOffRequest[];
  menu: MenuUpload | null;
  drinkMenu: MenuUpload | null;
  dessertMenu: MenuUpload | null;
  /** Which menu types the owner actually uploaded (food/drink/dessert). */
  uploadedMenuTypes: MenuKind[];
  /** Per-role menu test requirements (role -> required menu kinds). */
  menuTestConfig: MenuTestConfig;
  setMenuTestConfig: (cfg: MenuTestConfig) => void;
  menuBankMeta: MenuBankMeta | null;
  restaurantProfile: RestaurantProfile | null;

  restaurantHours: RestaurantHours;
  mealPeriods: MealPeriods;
  setRestaurantHours: (h: RestaurantHours) => void;
  updateRestaurantDay: (day: DayKey, patch: Partial<DayHours>) => void;
  setMealPeriods: (p: MealPeriods) => void;
  updateMealPeriod: (meal: Meal, patch: Partial<MealPeriodConfig>) => void;
  arrivalOffsets: ArrivalOffsets;
  setArrivalOffsets: (o: ArrivalOffsets) => void;
  businessInfo: BusinessInfo;
  setBusinessInfo: (info: BusinessInfo) => void;
  /** Derived: (built-in roles minus disabledRoles) + customRoles. Never stored. */
  activeRoles: Role[];
  /** Persisted EXCEPTIONS: built-in roles this restaurant turned off. */
  disabledRoles: string[];
  setDisabledRoles: (roles: string[]) => void;
  /** Adapter kept for existing callers: stores the complement as disabledRoles. */
  
  customRoles: CustomRole[];
  addCustomRole: (role: CustomRole) => void;
  removeCustomRole: (name: string) => void;
  setupCompleted: boolean;
  notifications: Notification[];
  setMenu: (m: MenuUpload | null) => void;
  setDrinkMenu: (m: MenuUpload | null) => void;
  setDessertMenu: (m: MenuUpload | null) => void;
  markMenuGenerated: () => void;
  setMenuBankMeta: (m: MenuBankMeta | null) => void;
  refreshMenuBankMeta: () => Promise<void>;
  completeSetup: (
    profile: Omit<RestaurantProfile, "completedAt">,
    food: MenuUpload | null,
    drink: MenuUpload | null,
    dessert?: MenuUpload | null,
  ) => void;

  resetSetup: () => void;
  markNotificationsRead: () => void;
  inviteEmployee: (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    role: Role;
  }) => Promise<{ id: string; inviteUrl: string; inviteToken: string }>;

  joinStaff: (data: {
    slug?: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    /** Self-joiners arrive with no role; management assigns one after approval. */
    weeklyAvailability: Partial<WeeklyAvailability>;
    emergencyContact: EmergencyContact;
  }) => Promise<string>;
  updateRestaurantSlug: (slug: string) => void;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  
  /** Approve a pending public self-join so they count as staff. */
  approveJoinRequest: (id: string) => void;
  /** Decline a pending self-join: removes the roster row only (auth user stays). */
  declineJoinRequest: (id: string) => void;
  /** Archive an employee: sets their people state to "inactive" (optimistic). */
  archiveEmployee: (id: string) => void;
  /** Reactivate an archived employee back to "active". */
  reactivateEmployee: (id: string) => Promise<void>;
  /** Hard-delete an employee's person record; history rows are orphaned, not deleted. */
  deleteEmployeeRecord: (id: string) => Promise<void>;

  /**
   * Apply a quiz attempt result graded by the server. Only updates local
   * state — the server function (submitQuizAttempt) has already persisted
   * the training_progress row.
   */
  applyQuizAttemptResult: (
    employeeId: string,
    videoId: string,
    result: { score: number; passed: boolean; attempts: number; distractionFlagged: boolean; bankVersion?: number },
  ) => void;

  postTrade: (shiftId: string, note?: string) => void;
  upsertShift: (shift: Shift) => void;
  deleteShift: (id: string) => void;
  applyRemoteShiftUpsert: (shift: Shift) => void;
  applyRemoteShiftDelete: (id: string) => void;
  claimTrade: (tradeId: string, employeeId: string) => void;
  resolveTrade: (tradeId: string, approved: boolean) => void;
  postJob: (data: Omit<JobPosting, "id" | "postedAt" | "open">) => void;
  toggleJobOpen: (id: string) => void;
  removeJob: (id: string) => void;
    requestTimeOff: (data: Omit<TimeOffRequest, "id" | "createdAt" | "status">) => void;
  resolveTimeOff: (id: string, approved: boolean) => void;
  cancelTimeOff: (id: string) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

// Knowledge tests are graded SERVER-SIDE only. The client never has access to
// correct answers — tests are fetched and graded via `startQuizAttempt` /
// `submitQuizAttempt` server functions.
//
// 86Paper is a testing / screening platform, not a training-content library.
// There is no video watching and no sequential lesson unlocking. The only
// knowledge test today is the restaurant-specific Menu Knowledge Test,
// generated from the owner's uploaded menu(s). Future direct tests (e.g.
// employee-handbook tests) plug in here as additional test ids.

export const MENU_MODULE_ID = "menu-quiz";
export const MENU_TEST_TITLE = "Menu Knowledge Test";

export function sectionForRole(role: Role, customRoles: CustomRole[] = []): Section {
  if (BOH_ROLES_ORDERED.includes(role)) return "BOH";
  const custom = customRoles.find((c) => c.name === role);
  if (custom) return custom.section;
  return "FOH";
}

/** Knowledge tests required for an employee. Today: the Menu Knowledge Test. */
export function testIdsForEmployee(emp: { primaryRole: Role; approvedRoles?: Role[] }): string[] {
  const roles = emp.approvedRoles && emp.approvedRoles.length > 0 ? emp.approvedRoles : (emp.primaryRole ? [emp.primaryRole] : []);
  if (roles.length === 0) return [];
  return [MENU_MODULE_ID];
}


/**
 * "Pending role assignment" — the employee completed their own personal-info
 * onboarding (self-serve QR flow) but a manager hasn't picked their role yet.
 * No approved roles = derived pending state; no migration required.
 */
export function isPendingRoleAssignment(emp: Pick<Employee, "personalInfoComplete" | "primaryRole" | "approvedRoles">): boolean {
  const hasRole = (emp.approvedRoles && emp.approvedRoles.length > 0) || !!emp.primaryRole;
  return !!emp.personalInfoComplete && !hasRole;
}

/* ---------------- Per-role menu test configuration ---------------- */

/**
 * Which menu tests each role must pass before their schedule unlocks.
 * `{}` (or a missing role key) means "use the sensible default" — see
 * `defaultMenuKindsForRole`. An explicit empty array means NOT gated.
 */
export type MenuTestConfig = Record<string, MenuKind[]>;

export const MENU_KINDS: MenuKind[] = ["food", "drink", "dessert"];

export const MENU_KIND_LABEL: Record<MenuKind, string> = {
  food: "Food",
  drink: "Drink",
  dessert: "Dessert",
};

/** Roles that never need menu knowledge by default. */
const MENU_EXEMPT_ROLES: Role[] = ["Dishwasher"];

/**
 * Intrinsic defaults, independent of what the restaurant has uploaded:
 * FOH -> food + drink + dessert; BOH -> food + dessert; Dishwasher -> nothing.
 */
export function defaultMenuKindsForRole(
  role: Role,
  _available: MenuKind[] = MENU_KINDS,
  customRoles: CustomRole[] = [],
): MenuKind[] {
  if (MENU_EXEMPT_ROLES.includes(role)) return [];
  if (sectionForRole(role, customRoles) === "FOH") return MENU_KINDS.slice();
  return ["food", "dessert"];
}

export function defaultMenuTestConfig(
  roles: Role[],
  available: MenuKind[],
  customRoles: CustomRole[] = [],
): MenuTestConfig {
  const cfg: MenuTestConfig = {};
  for (const r of roles) cfg[r] = defaultMenuKindsForRole(r, available, customRoles);
  return cfg;
}

export function normalizeMenuTestConfig(raw: unknown): MenuTestConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: MenuTestConfig = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    out[k] = v.filter((x): x is MenuKind => x === "food" || x === "drink" || x === "dessert");
  }
  return out;
}

/**
 * Menu kinds the current bank can actually test. Food, drink and dessert are
 * genuine, independently generated question pools.
 */
export function availableMenuKinds(
  meta: MenuBankMeta | null | undefined,
  _uploadedMenuTypes: MenuKind[] = [],
): MenuKind[] {
  if (!meta) return [];
  const out: MenuKind[] = [];
  if (meta.foodCount > 0) out.push("food");
  if (meta.drinkCount > 0) out.push("drink");
  if ((meta.dessertCount ?? 0) > 0) out.push("dessert");
  return out;
}

/**
 * True if the employee's stored menu-quiz pass is against the current bank.
 * Any pass stamped with an older bank_version (or no version at all — the
 * pre-versioning schema) is treated as stale after a menu regeneration.
 */
function hasCurrentMenuPass(
  progress: VideoProgress[],
  meta: MenuBankMeta | null | undefined,
): boolean {
  const row = progress.find((p) => p.videoId === MENU_MODULE_ID);
  if (!row || !row.passed) return false;
  if (!meta) return true; // no bank yet — nothing to compare against
  return row.bankVersion === meta.version;
}

/**
 * Menu kinds this employee must pass, from the owner's per-role configuration
 * (union across their approved roles), intersected with what the bank has.
  * Empty array means there are currently no testable required kinds. Callers
  * must check `menuTestBlockedFor` first; only an explicit configured empty
  * array means the role is genuinely not gated.
 */
export function requiredMenuKindsFor(
  emp: Pick<Employee, "primaryRole" | "approvedRoles">,
  customRoles: CustomRole[],
  meta: MenuBankMeta | null | undefined,
  config?: MenuTestConfig | null,
  uploadedMenuTypes: MenuKind[] = [],
): MenuKind[] {
  const available = availableMenuKinds(meta, uploadedMenuTypes);
  if (available.length === 0) return [];
  const roles = emp.approvedRoles && emp.approvedRoles.length > 0 ? emp.approvedRoles : (emp.primaryRole ? [emp.primaryRole] : []);
  if (roles.length === 0) return [];
  const set = new Set<MenuKind>();
  for (const r of roles) {
    const kinds = config && Object.prototype.hasOwnProperty.call(config, r)
      ? config[r]
      : defaultMenuKindsForRole(r, available, customRoles);
    for (const k of kinds) if (available.includes(k)) set.add(k);
  }
  return MENU_KINDS.filter((k) => set.has(k));
}

/**
 * Kinds a role is CONFIGURED to require, BEFORE intersecting with what the
 * bank can actually test. Intrinsic defaults never depend on `available`.
 */
export function configuredMenuKindsForRole(
  role: Role,
  available: MenuKind[],
  config?: MenuTestConfig | null,
  customRoles: CustomRole[] = [],
): MenuKind[] {
  return config && Object.prototype.hasOwnProperty.call(config, role)
    ? config[role]
    : defaultMenuKindsForRole(role, MENU_KINDS, customRoles);
}

/**
 * Config-time validation: roles that require menu types the restaurant has no
 * questions for. These roles must fail CLOSED (blocked from scheduling) and
 * the owner must be warned where they configure it.
 */
export function menuTestConfigWarnings(
  roles: Role[],
  available: MenuKind[],
  config?: MenuTestConfig | null,
  customRoles: CustomRole[] = [],
): { role: Role; missing: MenuKind[]; blocked: boolean }[] {
  const out: { role: Role; missing: MenuKind[]; blocked: boolean }[] = [];
  for (const role of roles) {
    const wanted = configuredMenuKindsForRole(role, available, config, customRoles);
    if (wanted.length === 0) continue; // deliberate opt-out — no warning
    const missing = MENU_KINDS.filter((k) => wanted.includes(k) && !available.includes(k));
    if (missing.length === 0) continue;
    out.push({ role, missing, blocked: true });
  }
  return out;
}

/**
 * True when any required menu type has no questions available. Intrinsic
 * defaults are used for missing config keys; only an explicit empty array is
 * an opt-out.
 */
export function menuTestBlockedFor(
  emp: Pick<Employee, "primaryRole" | "approvedRoles">,
  customRoles: CustomRole[] = [],
  meta: MenuBankMeta | null | undefined = null,
  config?: MenuTestConfig | null,
  uploadedMenuTypes: MenuKind[] = [],
): boolean {
  const roles = emp.approvedRoles && emp.approvedRoles.length > 0 ? emp.approvedRoles : (emp.primaryRole ? [emp.primaryRole] : []);
  if (roles.length === 0) return false;
  const available = availableMenuKinds(meta, uploadedMenuTypes);
  const wanted = new Set<MenuKind>();
  for (const r of roles) for (const k of configuredMenuKindsForRole(r, available, config, customRoles)) wanted.add(k);
  if (wanted.size === 0) return false; // deliberate opt-out
  return MENU_KINDS.some((k) => wanted.has(k) && !available.includes(k));
}

/** Is the Menu Knowledge Test required for this employee at all? */
function menuTestRequiredFor(
  emp: Pick<Employee, "primaryRole" | "approvedRoles">,
  customRoles: CustomRole[],
  meta: MenuBankMeta | null | undefined,
  config?: MenuTestConfig | null,
  uploadedMenuTypes: MenuKind[] = [],
): boolean {
  return requiredMenuKindsFor(emp, customRoles, meta, config, uploadedMenuTypes).length > 0;
}

export type MenuTestStatus = "not-required" | "blocked" | "never" | "in-progress" | "stale" | "passed";

/**
 * Menu Knowledge Test status for a single employee, relative to the current
 * menu bank version AND the owner's per-role requirement configuration.
 */
export function menuTestStatus(
  emp: Pick<Employee, "primaryRole" | "approvedRoles" | "progress">,
  meta: MenuBankMeta | null | undefined,
  customRoles: CustomRole[] = [],
  config?: MenuTestConfig | null,
  uploadedMenuTypes: MenuKind[] = [],
): MenuTestStatus {
  if (menuTestBlockedFor(emp, customRoles, meta, config, uploadedMenuTypes)) return "blocked";
  if (!menuTestRequiredFor(emp, customRoles, meta, config, uploadedMenuTypes)) return "not-required";
  const row = emp.progress.find((p) => p.videoId === MENU_MODULE_ID);
  if (!row) return "never";
  if (!row.passed) return "in-progress";
  if (row.bankVersion !== meta!.version) return "stale";
  return "passed";
}

/**
 * Schedule eligibility. The MANAGER owns the schedule gate; the Menu
 * Knowledge Test no longer participates in this decision (parked feature).
 * The only remaining derived block is "no role assigned yet".
 */
export function isScheduleEligible(
  emp: Pick<Employee, "personalInfoComplete" | "primaryRole" | "approvedRoles" | "progress">,
  _customRoles: CustomRole[] = [],
  _meta: MenuBankMeta | null | undefined = null,
  _config?: MenuTestConfig | null,
  _uploadedMenuTypes: MenuKind[] = [],
): boolean {
  if (isPendingRoleAssignment(emp)) return false;
  return true;
}


export function trainingProgressFor(
  emp: Pick<Employee, "primaryRole" | "approvedRoles" | "progress">,
  customRoles: CustomRole[] = [],
  meta: MenuBankMeta | null | undefined = null,
  config?: MenuTestConfig | null,
  uploadedMenuTypes: MenuKind[] = [],
): { passed: number; total: number } {
  if (menuTestBlockedFor(emp, customRoles, meta, config, uploadedMenuTypes)) return { passed: 0, total: 1 };
  if (!menuTestRequiredFor(emp, customRoles, meta, config, uploadedMenuTypes)) return { passed: 0, total: 0 };
  return { passed: hasCurrentMenuPass(emp.progress, meta) ? 1 : 0, total: 1 };
}






function seedShifts(): Shift[] {
  return [];
}

function seedTrades(): Trade[] {
  return [];
}

function seedJobs(): JobPosting[] {
  return [];
}

const STORAGE_KEY = "sidework-store-v10";

// Defensively strip any legacy "Porter" role from persisted data and remap to Busser.
function sanitizePorter<T>(input: T): T {
  if (input == null) return input;
  if (Array.isArray(input)) {
    const cleaned = input
      .map((v) => sanitizePorter(v))
      .filter((v) => v !== "Porter");
    return cleaned as unknown as T;
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if ((k === "primaryRole" || k === "role" || k === "position") && v === "Porter") {
        out[k] = "Busser";
      } else {
        out[k] = sanitizePorter(v);
      }
    }
    return out as T;
  }
  return input;
}

/**
 * Roles that existed when `activeRoles` was still persisted as a snapshot.
 * The one-time conversion is computed against THIS list, not the current
 * built-in list, so built-in roles added after the snapshot era (Expo, Food
 * Runner, and anything added later) are never retro-disabled.
 */
const LEGACY_SNAPSHOT_ROLES: string[] = ROLES_ORDERED.filter(
  (r) => r !== "Expo" && r !== "Food Runner",
);

/**
 * One-time, idempotent migration from the old `activeRoles` snapshot to the
 * inverted `disabledRoles` exception list. Runs only when a stored
 * `activeRoles` exists AND `disabledRoles` does not; afterwards `activeRoles`
 * is dropped from the persisted payload so it can never be read again.
 */
function convertActiveRoles(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== "object") return {};
  const o = { ...(parsed as Record<string, unknown>) };
  const legacy = o.activeRoles;
  delete o.activeRoles;
  if (Array.isArray(o.disabledRoles)) return o;
  if (!Array.isArray(legacy)) return o;
  const on = new Set((legacy as unknown[]).filter((r): r is string => typeof r === "string"));
  o.disabledRoles = LEGACY_SNAPSHOT_ROLES.filter((r) => !on.has(r));
  return o;
}

export function SideworkProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState(() => ({
    currentUser: { type: "manager", id: "owner" } as Store["currentUser"],
    employees: [] as Employee[],
    shifts: seedShifts(),
    trades: seedTrades(),
    jobs: seedJobs(),
    timeOff: [] as TimeOffRequest[],
    menu: null as MenuUpload | null,
    drinkMenu: null as MenuUpload | null,
    dessertMenu: null as MenuUpload | null,
    uploadedMenuTypes: [] as MenuKind[],
    menuTestConfig: {} as MenuTestConfig,
    restaurantProfile: null as RestaurantProfile | null,
    restaurantHours: defaultRestaurantHours(),
    mealPeriods: defaultMealPeriods(),
    arrivalOffsets: defaultArrivalOffsets(),
    businessInfo: defaultBusinessInfo() as BusinessInfo,
    // No snapshot: an empty disabledRoles means every built-in role is available.
    disabledRoles: [] as string[],
    customRoles: [] as CustomRole[],
    setupCompleted: false,
    notifications: [] as Notification[],
    menuBankMeta: null as MenuBankMeta | null,
  }));


  useEffect(() => {
    try {
      // Clear any prior versions that may contain "Porter" seed data.
      for (let i = 1; i <= 9; i++) {
        try { localStorage.removeItem(`sidework-store-v${i}`); } catch {}
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = convertActiveRoles(sanitizePorter(JSON.parse(raw)));
        setState((s) => ({ ...s, ...parsed }));
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  // Sync custom role colors into the shared ROLE_COLORS registry so
  // roleStyle(role) picks them up everywhere without threading a palette.
  useEffect(() => {
    for (const c of state.customRoles) {
      ROLE_COLORS[c.name] = c.color;
    }
  }, [state.customRoles]);

  // Owner-scoped Supabase sync for the hiring pipeline (job postings)
  // AND the employee roster + restaurant hours (Wave A of scheduling).
  // Uses the "effective owner id" from AuthContext so both real owners and
  // hiring-managers (with can_manage_hiring granted for that owner) hydrate
  // against the same owner's data.
  const { effectiveOwner, loading: authLoading } = useAuth();
  const ownerIdRef = useRef<string | null>(null);
  const effectiveOwnerId = effectiveOwner?.ownerId ?? null;
  // Single-login owner model: if effectiveOwner is set, the signed-in user IS the owner.
  const acting: "owner" | null = effectiveOwnerId ? "owner" : null;
  // Track owners we've already run the one-time local→cloud bootstrap for,
  // so re-hydrations (tab focus, auth refresh) can't re-upload. The DB unique
  // index (owner_id, local_id) is a second line of defense.
  const bootstrappedOwnersRef = useRef<Set<string>>(new Set());
  // Mirror of latest state so the hydrate effect can read local employees /
  // hours without re-firing on every store change.
  const latestStateRef = useRef(state);
  useEffect(() => { latestStateRef.current = state; }, [state]);

  useEffect(() => {
    ownerIdRef.current = effectiveOwnerId;
    if (!hydrated || authLoading) return;
    let cancelled = false;
    if (!effectiveOwnerId) {
      setState((s) => ({ ...s, jobs: [], shifts: [], trades: [], timeOff: [] }));
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const [postings, remoteEmployeesInitial, remoteHours, remoteShiftsInitial, remoteTimeOffInitial, remoteTradesInitial, remoteBusinessInfo, remoteTrainingProgress, menuBankMeta, remoteMenuTestConfig, remoteRoleConfig] = await Promise.all([
          fetchOwnerPostings(effectiveOwnerId),
          fetchOwnerEmployees(effectiveOwnerId),
          fetchRestaurantHours(effectiveOwnerId),
          fetchOwnerShifts(effectiveOwnerId),
          fetchOwnerTimeOff(effectiveOwnerId),
          fetchOwnerTrades(effectiveOwnerId),
          fetchBusinessInfo(effectiveOwnerId),
          // Training / menu-test surfaces are parked: these loads are INERT on
          // purpose. The code below stays so the feature can be revived.
          Promise.resolve(new Map<string, VideoProgress[]>()),
          Promise.resolve(null),
          Promise.resolve(null),
          fetchRoleConfig(effectiveOwnerId).catch((e) => {
            console.warn("[owner-sync] role config load failed", e);
            return null;
          }),
        ]);


        if (cancelled) return;

        // Employees: cloud is authoritative once anything exists there. Otherwise,
        // if this signed-in user is the real owner and their local roster has
        // employees, upload them one time (idempotent via UNIQUE(owner_id, local_id)).
        let remoteEmployees = remoteEmployeesInitial;
        let remoteShifts = remoteShiftsInitial;
        let remoteTimeOff = remoteTimeOffInitial;
        let remoteTrades = remoteTradesInitial;
        const local = latestStateRef.current;
        const alreadyBootstrapped = bootstrappedOwnersRef.current.has(effectiveOwnerId);

        // Hours: normalize v1/v2/v3 shapes; if nothing remote, seed the current
        // local defaults up. If we upgraded from an older version, write v3 back.
        let hoursPatch: Partial<typeof state> = {};
        if (remoteHours != null) {
          const norm = normalizeRestaurantHoursConfig(remoteHours);
          hoursPatch = { restaurantHours: norm.days, mealPeriods: norm.mealPeriods, arrivalOffsets: norm.arrivalOffsets };
          const rawObj = (remoteHours && typeof remoteHours === "object") ? (remoteHours as { version?: number; arrivalOffsets?: unknown }) : null;
          const isV3 = rawObj?.version === 3 && rawObj?.arrivalOffsets != null;
          if ((norm.upgradedFromV1 || !isV3) && acting === "owner") {
            saveRestaurantHours(effectiveOwnerId, serializeRestaurantHoursConfig(norm.days, norm.mealPeriods, norm.arrivalOffsets))
              .catch((e) => console.error("[hours-upgrade-v3] failed", e));
          }
        } else if (acting === "owner") {
          try {
            await saveRestaurantHours(
              effectiveOwnerId,
              serializeRestaurantHoursConfig(latestStateRef.current.restaurantHours, latestStateRef.current.mealPeriods, latestStateRef.current.arrivalOffsets),
            );
          } catch (e) {
            console.error("[hours-bootstrap] failed", e);
          }
        }

        // Role config. The database is authoritative whenever it has been
        // configured at all — INCLUDING when it is empty. An empty server
        // value is a real value ("nothing disabled"), not a missing one, so
        // it must overwrite a non-empty local cache; treating empty as
        // "never written" let a stale device resurrect a role the owner had
        // already re-enabled. Only a NULL column means never configured.
        // Sequencing: convertActiveRoles already ran on the localStorage
        // payload during hydration, so `local.disabledRoles` here is always
        // the converted, inverted list — never a legacy activeRoles snapshot.
        let rolesPatch: Partial<typeof state> = {};
        if (remoteRoleConfig) {
          const localDisabled = local.disabledRoles ?? [];
          const localCustom = local.customRoles ?? [];
          const hasLocal = localDisabled.length > 0 || localCustom.length > 0;
          if (remoteRoleConfig.everWritten) {
            // Server wins, empty included.
            rolesPatch = {
              disabledRoles: remoteRoleConfig.disabledRoles,
              customRoles: remoteRoleConfig.customRoles,
            };
          } else if (hasLocal && acting === "owner") {
            // Never configured and this device holds a local-only config:
            // push it up once. The save makes the columns non-null, so every
            // later load takes the branch above — this stays idempotent.
            rolesPatch = { disabledRoles: localDisabled, customRoles: localCustom };
            saveRoleConfig(effectiveOwnerId, localDisabled, localCustom).catch((e) =>
              console.error("[role-config-bootstrap] failed", e),
            );
          }
          // Never configured and nothing local: leave state as is.
        }



        // Merge cloud-stored training progress into each employee. Additive:
        // if a given employee has no cloud rows, fall back to whatever the
        // local roster already carries (preserves pre-migration progress on
        // the device that recorded it).
        const withProgress = (emps: Employee[]) =>
          emps.map((e) => {
            const cloud = remoteTrainingProgress.get(e.id);
            if (cloud && cloud.length > 0) return { ...e, progress: cloud };
            return e;
          });

        setState((s) => ({
          ...s,
          jobs: postings,
          // A successful fetch is authoritative, including an empty result:
          // [] means "this owner has none," not "no data — keep the cache."
          // On failure we never get here (the Promise.all throws first).
          employees: withProgress(remoteEmployees),
          shifts: remoteShifts,
          timeOff: remoteTimeOff,
          trades: remoteTrades,
          ...hoursPatch,
          ...rolesPatch,
          businessInfo: normalizeBusinessInfo(remoteBusinessInfo),
          menuBankMeta,
          menuTestConfig: normalizeMenuTestConfig(remoteMenuTestConfig),
        }));

      } catch (e) {
        console.error("[owner-sync] failed to load", e);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, hydrated, effectiveOwnerId, acting]);

  // Employee-context hydration branch: runs when there's NO effective owner
  // (not the owner, not a hiring/scheduling manager) BUT the signed-in user
  // matches a restaurant_employees.auth_user_id via get_employee_context().
  // Populates the store with the employee's own row + own shifts + open
  // trades in the restaurant + own time-off history, so /employee reads real
  // cloud data instead of an empty local store. Writes are mirrored to
  // Supabase via ownerIdRef, which we set from the employee context here.
  const { employeeContext } = useAuth();
  const employeeCtxOwnerId = employeeContext?.ownerId ?? null;
  const employeeCtxEmployeeId = employeeContext?.employeeId ?? null;
  const [employeeHydrating, setEmployeeHydrating] = useState(false);
  const [employeeHydratedTargetId, setEmployeeHydratedTargetId] = useState<string | null>(null);
  const [employeeHydrationError, setEmployeeHydrationError] = useState<string | null>(null);
  useEffect(() => {
    if (!hydrated || authLoading) return;
    if (effectiveOwnerId) return; // owner/manager branch already handled it
    if (!employeeCtxOwnerId || !employeeCtxEmployeeId) return;
    let cancelled = false;
    setEmployeeHydrating(true);
    setEmployeeHydratedTargetId(null);
    setEmployeeHydrationError(null);
    ownerIdRef.current = employeeCtxOwnerId;
    (async () => {
      try {
        // Resolve and publish the caller's own row first. Pending employees
        // need no secondary dashboard data to reach their approval screen.
        const me = await fetchMyEmployeeRow(employeeCtxEmployeeId);
        if (cancelled) return;
        if (!me) throw new Error("Your staff profile could not be found for this login.");
        setState((s) => ({
          ...s,
          employees: [me],
          currentUser: { type: "employee", id: employeeCtxEmployeeId },
          jobs: [],
        }));
        if (isPendingJoin(me)) return;

        const [myShifts, openTrades, myTimeOff, coworkers, myProgress, menuBankMeta, remoteMenuTestConfig] = await Promise.all([
          fetchMyShifts(employeeCtxEmployeeId),
          fetchOwnerOpenTrades(employeeCtxOwnerId),
          fetchMyTimeOff(employeeCtxEmployeeId),
          fetchCoworkerNames(employeeCtxOwnerId),
          // Parked training/menu-test surfaces — INERT, no network calls.
          Promise.resolve([] as VideoProgress[]),
          Promise.resolve(null),
          Promise.resolve(null),
        ]);

        if (cancelled) return;
        // Also fetch shifts referenced by open trades so the trade board
        // can render cards for shifts that aren't the caller's own.
        const tradeShiftIds = Array.from(
          new Set(openTrades.map((t) => t.shiftId).filter(Boolean)),
        ).filter((id) => !myShifts.some((s) => s.id === id));
        const boardShifts = await fetchShiftsByIds(tradeShiftIds);
        if (cancelled) return;

        // Merge: prefer the full "me" row over the coworker stub for self.
        const coworkerStubs = coworkers
          .filter((c) => !me || c.id !== me.id)
          .map((c) => ({
            id: c.id,
            name: c.name,
            firstName: c.firstName,
            email: "",
            primaryRole: "server" as Role,
            approvedRoles: [] as Role[],
            autoApproveRoles: [] as Role[],
            availability: "",
            invitedAt: "",
            onboardingStarted: false,
            personalInfoComplete: false,
            progress: [] as VideoProgress[],
          }));
        const meWithProgress = { ...me, progress: myProgress.length > 0 ? myProgress : me.progress };
        setState((s) => ({
          ...s,
          employees: [meWithProgress, ...coworkerStubs],
          shifts: [...myShifts, ...boardShifts],
          trades: openTrades,
          timeOff: myTimeOff,
          // Owner-only surfaces cleared for employee sessions
          jobs: [],
          menuBankMeta,
          menuTestConfig: normalizeMenuTestConfig(remoteMenuTestConfig),
        }));

        // Auto-select this employee as currentUser so /employee finds them.
        setState((s) => ({
          ...s,
          currentUser: { type: "employee", id: employeeCtxEmployeeId },
        }));
      } catch (e) {
        console.error("[employee-sync] failed to load", e);
        if (!cancelled) {
          setEmployeeHydrationError(e instanceof Error ? e.message : "Your staff account could not be loaded.");
        }
      } finally {
        if (!cancelled) {
          setEmployeeHydratedTargetId(employeeCtxEmployeeId);
          setEmployeeHydrating(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, hydrated, effectiveOwnerId, employeeCtxOwnerId, employeeCtxEmployeeId]);


  // Role configuration is owner-level config: mirror it to the database the
  // same way business info and restaurant hours are mirrored.
  const persistRoleConfig = (disabledRoles: string[], customRoles: CustomRole[]) => {
    const oid = ownerIdRef.current;
    if (oid) saveRoleConfig(oid, disabledRoles, customRoles).catch((e) => console.error("[persistRoleConfig]", e));
  };


  const uid = (prefix: string) => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const newUuid = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const store: Store = {
    ...state,
    // Derived, never stored: the ONE role list every consumer must read.
    activeRoles: effectiveRoles(state.disabledRoles, state.customRoles),
    employeeHydrating,
    employeeHydratedTargetId,
    employeeHydrationError,
    setRestaurantHours: (h) => {
      setState((s) => ({ ...s, restaurantHours: h }));
      const oid = ownerIdRef.current;
      if (oid) saveRestaurantHours(oid, serializeRestaurantHoursConfig(h, latestStateRef.current.mealPeriods, latestStateRef.current.arrivalOffsets)).catch((e) => console.error("[setRestaurantHours]", e));
    },
    updateRestaurantDay: (day, patch) =>
      setState((s) => {
        const next = { ...s.restaurantHours, [day]: { ...s.restaurantHours[day], ...patch } };
        const oid = ownerIdRef.current;
        if (oid) saveRestaurantHours(oid, serializeRestaurantHoursConfig(next, s.mealPeriods, s.arrivalOffsets)).catch((e) => console.error("[updateRestaurantDay]", e));
        return { ...s, restaurantHours: next };
      }),
    setMealPeriods: (p) => {
      setState((s) => ({ ...s, mealPeriods: p }));
      const oid = ownerIdRef.current;
      if (oid) saveRestaurantHours(oid, serializeRestaurantHoursConfig(latestStateRef.current.restaurantHours, p, latestStateRef.current.arrivalOffsets)).catch((e) => console.error("[setMealPeriods]", e));
    },
    updateMealPeriod: (meal, patch) =>
      setState((s) => {
        const next = { ...s.mealPeriods, [meal]: { ...s.mealPeriods[meal], ...patch } };
        const oid = ownerIdRef.current;
        if (oid) saveRestaurantHours(oid, serializeRestaurantHoursConfig(s.restaurantHours, next, s.arrivalOffsets)).catch((e) => console.error("[updateMealPeriod]", e));
        return { ...s, mealPeriods: next };
      }),
    setArrivalOffsets: (o) => {
      setState((s) => ({ ...s, arrivalOffsets: o }));
      const oid = ownerIdRef.current;
      if (oid) saveRestaurantHours(oid, serializeRestaurantHoursConfig(latestStateRef.current.restaurantHours, latestStateRef.current.mealPeriods, o)).catch((e) => console.error("[setArrivalOffsets]", e));
    },
    setBusinessInfo: (info) => {
      const clean = normalizeBusinessInfo(info);
      setState((s) => ({ ...s, businessInfo: clean }));
      const oid = ownerIdRef.current;
      if (oid) saveBusinessInfo(oid, clean).catch((e: unknown) => console.error("[setBusinessInfo]", e));
    },
    disabledRoles: state.disabledRoles,
    setDisabledRoles: (roles) =>
      setState((s) => {
        const next = { ...s, disabledRoles: Array.from(new Set(roles)) };
        persistRoleConfig(next.disabledRoles, next.customRoles);
        return next;
      }),
    addCustomRole: (role) =>
      setState((s) => {
        if (s.customRoles.some((c) => c.name === role.name) || (BUILT_IN_ROLES as readonly string[]).includes(role.name)) {
          return s;
        }
        const next = {
          ...s,
          customRoles: [...s.customRoles, role],
          disabledRoles: s.disabledRoles.filter((r) => r !== role.name),
        };
        persistRoleConfig(next.disabledRoles, next.customRoles);
        return next;
      }),
    removeCustomRole: (name) =>
      setState((s) => {
        const next = {
          ...s,
          customRoles: s.customRoles.filter((c) => c.name !== name),
          disabledRoles: s.disabledRoles.filter((r) => r !== name),
        };
        persistRoleConfig(next.disabledRoles, next.customRoles);
        return next;
      }),

    setCurrentUser: (u) => setState((s) => ({ ...s, currentUser: u })),
    approveJoinRequest: (id) => {
      setState((s) => ({
        ...s,
        employees: s.employees.map((e) => (e.id === id ? { ...e, joinStatus: "active" as const } : e)),
      }));
      approveEmployeeRow(id).catch((e) => console.error("[approveJoinRequest]", e));
    },
    declineJoinRequest: (id) => {
      setState((s) => ({ ...s, employees: s.employees.filter((e) => e.id !== id) }));
      deleteEmployeeRow(id).catch((e) => console.error("[declineJoinRequest]", e));
    },
    archiveEmployee: (id) => {
      setState((s) => ({
        ...s,
        employees: s.employees.map((e) => (e.id === id ? { ...e, state: "inactive" } : e)),
      }));
      archiveEmployeeRow(id).catch((e) => console.error("[archiveEmployee]", e));
    },
    reactivateEmployee: async (id) => {
      setState((s) => ({
        ...s,
        employees: s.employees.map((e) => (e.id === id ? { ...e, state: "active" } : e)),
      }));
      try {
        await reactivateEmployeeRow(id);
      } catch (e) {
        console.error("[reactivateEmployee]", e);
      }
    },
    deleteEmployeeRecord: async (id) => {
      const previous = state.employees;
      setState((s) => ({ ...s, employees: s.employees.filter((e) => e.id !== id) }));
      try {
        await deleteEmployeeRow(id);
      } catch (e) {
        setState((s) => ({ ...s, employees: previous }));
        throw e;
      }
    },

    inviteEmployee: async ({ firstName, lastName, email, phone, role }) => {
      const localId = newUuid();
      const fullName = `${firstName} ${lastName}`.trim() || email || "New staff";
      const oid = ownerIdRef.current;

      // Persist first (need the DB-assigned invite_token). If we're not signed
      // in yet, fall back to a local stub so nothing crashes in dev.
      let dbId: string = localId;
      let inviteToken: string = crypto.randomUUID();

      if (oid) {
        try {
          const row = await createStaffInviteRow(oid, {
            firstName, lastName, email, phone, role,
          });
          dbId = row.id;
          inviteToken = row.inviteToken;
        } catch (e) {
          console.error("[inviteEmployee]", e);
        }
      }

      const employee: Employee = {
        id: dbId,
        name: fullName,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email,
        phone: phone || undefined,
        primaryRole: role,
        approvedRoles: [role],
        autoApproveRoles: [],
        availability: "",
        invitedAt: new Date().toISOString().slice(0, 10),
        onboardingStarted: false,
        personalInfoComplete: false,
        progress: [],
      };

      setState((s) => ({
        ...s,
        employees: [...s.employees, employee],
        notifications: [
          {
            id: uid("n"),
            type: "training_passed",
            message: `Invite created for ${fullName}. They'll finish signup themselves.`,
            employeeId: dbId,
            createdAt: new Date().toISOString(),
            read: false,
          },
          ...s.notifications,
        ],
      }));

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      return { id: dbId, inviteToken, inviteUrl: `${origin}/staff-invite/${inviteToken}` };
    },

    joinStaff: async (data) => {
      const fullName = `${data.firstName} ${data.lastName}`.trim();
      if (!data.slug) throw new Error("This join link isn't valid");

      const { supabase } = await import("@/integrations/supabase/client");
      const { data: personId, error } = await supabase.rpc("join_restaurant_by_slug_v2" as never, {
        p_slug: data.slug,
        p_first_name: data.firstName,
        p_last_name: data.lastName,
        p_email: data.email,
        p_phone: data.phone,
        p_primary_role: "",
      } as never);
      if (error) throw new Error(error.message);
      const empId = typeof personId === "string" ? personId : "";
      if (!empId) {
        throw new Error("Couldn't complete your join request. Please try again or contact the restaurant.");
      }

      // Self-editable fields go in a normal follow-up update.
      const { error: upErr } = await supabase
        .from("people")
        .update({
          weekly_availability: data.weeklyAvailability as never,
          emergency_contact: data.emergencyContact as never,
          personal_info_complete: true,
          onboarding_started: true,
        } as never)
        .eq("id", empId);
      if (upErr) throw new Error(upErr.message);


      const employee: Employee = {
        id: empId,
        name: fullName,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        primaryRole: "" as Role,
        approvedRoles: [],
        autoApproveRoles: [],
        availability: "",
        weeklyAvailability: data.weeklyAvailability as WeeklyAvailability,
        emergencyContact: data.emergencyContact,
        invitedAt: new Date().toISOString().slice(0, 10),
        onboardingStarted: true,
        personalInfoComplete: true,
        progress: [],
        joinStatus: "pending",
        joinedVia: "self_join",
      };
      setState((s) => ({
        ...s,
        employees: [...s.employees, employee],
        notifications: [
          {
            id: uid("n"),
            type: "training_passed",
            message: `${fullName} just requested to join 86Paper!`,
            employeeId: empId,
            createdAt: new Date().toISOString(),
            read: false,
          },
          ...s.notifications,
        ],
      }));
      return empId;
    },
    updateRestaurantSlug: (slug) =>
      setState((s) => ({
        ...s,
        restaurantProfile: s.restaurantProfile ? { ...s.restaurantProfile, slug } : s.restaurantProfile,
      })),
    updateEmployee: (id, patch) => {
      setState((s) => {
        const employees = s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e));
        // Menu-test notification on role change is intentionally inert: the
        // menu test is parked and no longer gates scheduling. Generator removed
        // rather than filtered downstream.
        return { ...s, employees };
      });

      const oid = ownerIdRef.current;
      if (oid) updateEmployeeRow(id, patch).catch((e) => console.error("[updateEmployee]", e));
    },
    applyQuizAttemptResult: (employeeId, videoId, result) => {

      const { score, passed, attempts, distractionFlagged, bankVersion } = result;
      const testTitle = videoId === MENU_MODULE_ID ? MENU_TEST_TITLE : "Knowledge test";
      setState((s) => {
        const emp = s.employees.find((e) => e.id === employeeId);
        if (!emp) return s;

        const existing = emp.progress.find((p) => p.videoId === videoId);
        // A prior pass only carries forward when it was earned against the
        // SAME question bank. For the menu test, a version bump invalidates it.
        const priorPassStillValid =
          !!existing?.passed &&
          (bankVersion === undefined || existing?.bankVersion === bankVersion);
        const nextPassed = passed || priorPassStillValid;
        const merged: VideoProgress = existing
          ? {
              ...existing,
              attempts,
              quizScore: score,
              passed: nextPassed,
              completedAt: passed ? new Date().toISOString() : (priorPassStillValid ? existing.completedAt : undefined),
              lockedOut: false,
              distractionFlagged,
              bankVersion: bankVersion ?? existing.bankVersion,
            }
          : {
              videoId,
              watchedSec: 0,
              attempts,
              quizScore: score,
              passed,
              completedAt: passed ? new Date().toISOString() : undefined,
              lockedOut: false,
              distractionFlagged,
              bankVersion,
            };
        const nextProgress = existing
          ? emp.progress.map((p) => (p.videoId === videoId ? merged : p))
          : [...emp.progress, merged];
        const newNotif: Notification = {
          id: uid("n"),
          type: passed ? "training_passed" : "training_failed",
          message: passed
            ? `${emp.name} passed "${testTitle}" with ${score}% on attempt ${attempts}${distractionFlagged ? " — flagged for possible distraction" : ""}`
            : `${emp.name} failed "${testTitle}" (${score}%) — attempt ${attempts}, can retry immediately${distractionFlagged ? " (flagged for possible distraction)" : ""}`,
          employeeId,
          videoId,
          createdAt: new Date().toISOString(),
          read: false,
        };
        return {
          ...s,
          employees: s.employees.map((e) => e.id === employeeId ? { ...e, progress: nextProgress } : e),
          notifications: [newNotif, ...s.notifications],
        };
      });
    },

    upsertShift: (shift) => {
      // Optimistic local update first.
      setState((s) => {
        const exists = s.shifts.some((x) => x.id === shift.id);
        return {
          ...s,
          shifts: exists ? s.shifts.map((x) => (x.id === shift.id ? shift : x)) : [...s.shifts, shift],
        };
      });
      const oid = ownerIdRef.current;
      if (!oid) return;
      upsertShiftRow(oid, shift)
        .then((saved) => {
          // Always sync back the server truth (esp. updated_at) so the next
          // edit's optimistic-concurrency guard has a fresh token.
          setState((s) => ({
            ...s,
            shifts: s.shifts.map((x) => (x.id === shift.id ? saved : x)),
          }));
        })
        .catch((e) => {
          if (e instanceof ShiftConflictError) {
            // Someone else updated this shift between our read and our write.
            // Replace the optimistic row with server truth (or drop if deleted).
            setState((s) => ({
              ...s,
              shifts: e.current
                ? s.shifts.map((x) => (x.id === shift.id ? e.current! : x))
                : s.shifts.filter((x) => x.id !== shift.id),
            }));
            toast.warning("This shift was just changed by someone else — reloaded.");
            return;
          }
          console.error("[upsertShift]", e);
        });
    },
    applyRemoteShiftUpsert: (shift) => {
      setState((s) => {
        const existing = s.shifts.find((x) => x.id === shift.id);
        if (existing && existing.updatedAt && shift.updatedAt && existing.updatedAt === shift.updatedAt) {
          return s; // Echo of our own write — skip.
        }
        const next = existing
          ? s.shifts.map((x) => (x.id === shift.id ? shift : x))
          : [...s.shifts, shift];
        return { ...s, shifts: next };
      });
    },
    applyRemoteShiftDelete: (id) => {
      setState((s) => {
        if (!s.shifts.some((x) => x.id === id)) return s;
        return { ...s, shifts: s.shifts.filter((x) => x.id !== id) };
      });
    },
    deleteShift: (id) => {
      setState((s) => ({ ...s, shifts: s.shifts.filter((x) => x.id !== id) }));
      // Only bother deleting from cloud if id looks like a uuid (already persisted).
      if (/^[0-9a-f-]{36}$/i.test(id)) {
        deleteShiftRow(id).catch((e) => console.error("[deleteShift]", e));
      }
    },
    postTrade: (shiftId, note) => {
      const oid = ownerIdRef.current;
      const shift = state.shifts.find((x) => x.id === shiftId);
      if (!shift) return;
      const tempId = uid("t");
      const optimistic: Trade = {
        id: tempId, shiftId, postedBy: shift.employeeId, status: "open",
        createdAt: new Date().toISOString(), note,
      };
      setState((s) => ({ ...s, trades: [...s.trades, optimistic] }));
      if (!oid) return;
      insertTradeRow(oid, shiftId, shift.employeeId, note)
        .then((row) => {
          setState((s) => ({ ...s, trades: s.trades.map((t) => (t.id === tempId ? row : t)) }));
        })
        .catch((e) => console.error("[postTrade]", e));
    },
    claimTrade: (tradeId, employeeId) => {
      let sideEffects: { tradeId: string; approved: boolean; auto: boolean; shiftId: string } | null = null;
      setState((s) => {
        const trade = s.trades.find((t) => t.id === tradeId);
        if (!trade) return s;
        const shift = s.shifts.find((x) => x.id === trade.shiftId);
        if (!shift) return s;
        const claimer = s.employees.find((e) => e.id === employeeId);
        if (!claimer) return s;
        const auto = claimer.autoApproveRoles.includes(shift.role);
        sideEffects = { tradeId, approved: auto, auto, shiftId: shift.id };
        return {
          ...s,
          trades: s.trades.map((t) =>
            t.id === tradeId
              ? {
                  ...t, claimedBy: employeeId,
                  status: auto ? "approved" : "pending_approval",
                  autoApproved: auto,
                  resolvedAt: auto ? new Date().toISOString() : undefined,
                  approvedBy: auto ? "auto" : undefined,
                }
              : t,
          ),
          shifts: auto ? s.shifts.map((x) => (x.id === shift.id ? { ...x, employeeId } : x)) : s.shifts,
        };
      });
      if (sideEffects) {
        const { tradeId: tid, auto, shiftId } = sideEffects;
        updateTradeRow(tid, {
          claimedBy: employeeId,
          status: auto ? "approved" : "pending_approval",
          autoApproved: auto,
          approvedBy: auto ? "auto" : undefined,
          resolvedAt: auto ? new Date().toISOString() : undefined,
        }).catch((e) => console.error("[claimTrade]", e));
        if (auto && /^[0-9a-f-]{36}$/i.test(shiftId)) {
          reassignShiftEmployee(shiftId, employeeId).catch((e) => console.error("[claimTrade:reassign]", e));
        }
      }
    },
    resolveTrade: (tradeId, approved) => {
      const sideBox: { value: { shiftId: string; claimedBy: string } | null } = { value: null };
      setState((s) => {
        const trade = s.trades.find((t) => t.id === tradeId);
        if (!trade || !trade.claimedBy) return s;
        sideBox.value = { shiftId: trade.shiftId, claimedBy: trade.claimedBy };
        return {
          ...s,
          trades: s.trades.map((t) =>
            t.id === tradeId
              ? { ...t, status: approved ? "approved" : "denied", approvedBy: "owner", resolvedAt: new Date().toISOString() }
              : t,
          ),
          shifts: approved ? s.shifts.map((x) => (x.id === trade.shiftId ? { ...x, employeeId: trade.claimedBy! } : x)) : s.shifts,
        };
      });
      updateTradeRow(tradeId, {
        status: approved ? "approved" : "denied",
        approvedBy: "owner",
        resolvedAt: new Date().toISOString(),
      }).catch((e) => console.error("[resolveTrade]", e));
      const side = sideBox.value;
      if (approved && side && /^[0-9a-f-]{36}$/i.test(side.shiftId)) {
        reassignShiftEmployee(side.shiftId, side.claimedBy).catch((e) => console.error("[resolveTrade:reassign]", e));
      }
    },
    postJob: (data) => {
      const ownerId = ownerIdRef.current;
      if (!ownerId) {
        toast.error("Please sign in to post a job.");
        return;
      }
      insertPosting(ownerId, data)
        .then((posting) => setState((s) => ({ ...s, jobs: [posting, ...s.jobs] })))
        .catch((e) => {
          console.error("[postJob] failed", e);
          toast.error("Couldn't save job posting.");
        });
    },
    toggleJobOpen: (id) => {
      const current = state.jobs.find((j) => j.id === id);
      if (!current) return;
      const nextOpen = !current.open;
      setState((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, open: nextOpen } : j)) }));
      updatePostingOpen(id, nextOpen).catch((e) => {
        console.error("[toggleJobOpen] failed", e);
        toast.error("Couldn't update job status.");
        setState((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, open: !nextOpen } : j)) }));
      });
    },
    removeJob: (id) => {
      const prev = state.jobs;
      setState((s) => ({ ...s, jobs: s.jobs.filter((j) => j.id !== id) }));
      deletePosting(id).catch((e) => {
        console.error("[removeJob] failed", e);
        toast.error("Couldn't delete job.");
        setState((s) => ({ ...s, jobs: prev }));
      });
    },
    requestTimeOff: (data) => {
      const tempId = uid("to");
      setState((s) => ({
        ...s,
        timeOff: [
          { id: tempId, createdAt: new Date().toISOString(), status: "pending", ...data },
          ...s.timeOff,
        ],
      }));
      const oid = ownerIdRef.current;
      if (!oid) return;
      insertTimeOffRow(oid, data)
        .then((row) => {
          setState((s) => ({
            ...s,
            timeOff: s.timeOff.map((t) => (t.id === tempId ? row : t)),
          }));
        })
        .catch((e) => console.error("[requestTimeOff]", e));
    },
    resolveTimeOff: (id, approved) => {
      const patch = {
        status: (approved ? "approved" : "denied") as TimeOffStatus,
        resolvedAt: new Date().toISOString(),
      };
      setState((s) => ({
        ...s,
        timeOff: s.timeOff.map((t) =>
          t.id === id
            ? { ...t, status: patch.status, resolvedAt: patch.resolvedAt }
            : t,
        ),
      }));
      if (/^[0-9a-f-]{36}$/i.test(id)) {
        updateTimeOffRow(id, patch).catch((e) => console.error("[resolveTimeOff]", e));
      }
    },
    cancelTimeOff: async (id) => {
      // Server first: RLS decides. Only drop it locally once the row really went.
      if (/^[0-9a-f-]{36}$/i.test(id)) {
        await deleteTimeOffRow(id);
      }
      setState((s) => ({ ...s, timeOff: s.timeOff.filter((t) => t.id !== id) }));
    },
    setMenuTestConfig: (cfg) => {
      const clean = normalizeMenuTestConfig(cfg);
      setState((s) => ({ ...s, menuTestConfig: clean }));
      const oid = ownerIdRef.current;
      if (oid) saveMenuTestConfig(oid, clean).catch((e: unknown) => console.error("[setMenuTestConfig]", e));
    },
    setMenu: (m) => setState((s) => ({ ...s, menu: m })),
    setDrinkMenu: (m) => setState((s) => ({ ...s, drinkMenu: m })),
    setDessertMenu: (m) => setState((s) => ({ ...s, dessertMenu: m })),
    markMenuGenerated: () =>
      setState((s) => ({ ...s, menu: s.menu ? { ...s.menu, generatedAt: new Date().toISOString() } : s.menu })),
    setMenuBankMeta: (m) => setState((s) => ({ ...s, menuBankMeta: m })),
    refreshMenuBankMeta: async () => {
      const oid = ownerIdRef.current;
      if (!oid) return;
      try {
        const meta = await fetchMenuBankMeta(oid);
        setState((s) => ({ ...s, menuBankMeta: meta }));
      } catch (e) {
        console.error("[refreshMenuBankMeta]", e);
      }
    },

    completeSetup: (profile, food, drink, dessert) => {
      const stamp = new Date().toISOString();
      setState((s) => {
        const nextFood = food ? { ...food, generatedAt: stamp } : s.menu;
        const nextDrink = drink ? { ...drink, generatedAt: stamp } : s.drinkMenu;
        const nextDessert = dessert ? { ...dessert, generatedAt: stamp } : s.dessertMenu;
        const types: MenuKind[] = [];
        if (nextFood) types.push("food");
        if (nextDrink) types.push("drink");
        if (nextDessert) types.push("dessert");
        return {
          ...s,
          restaurantProfile: { ...profile, completedAt: stamp },
          menu: nextFood,
          drinkMenu: nextDrink,
          dessertMenu: nextDessert,
          uploadedMenuTypes: types,
          setupCompleted: true,
        };
      });
    },
    resetSetup: () => setState((s) => ({ ...s, setupCompleted: false, restaurantProfile: null })),
    markNotificationsRead: () =>
      setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within SideworkProvider");
  return ctx;
}





export function onboardingStatus(
  employee: Employee,
  customRoles: CustomRole[] = [],
  meta: MenuBankMeta | null | undefined = null,
  config?: MenuTestConfig | null,
  uploadedMenuTypes: MenuKind[] = [],
) {
  const { passed, total } = trainingProgressFor(employee, customRoles, meta, config, uploadedMenuTypes);

  const fullyOnboarded = !!employee.personalInfoComplete && passed === total;
  return { passed, total, fullyOnboarded, pct: total ? Math.round((passed / total) * 100) : 100 };
}




