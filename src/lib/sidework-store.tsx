import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { ROLE_COLORS } from "@/lib/role-colors";
import {
  fetchOwnerPostings,
  fetchOwnerApplications,
  insertPosting,
  updatePostingOpen,
  deletePosting,
  insertApplication,
  updateApplication,
  confirmApplicantSlot,
} from "@/lib/hiring-supabase";
import {
  fetchOwnerEmployees,
  bootstrapLocalEmployees,
  insertEmployee,
  updateEmployeeRow,
  deleteAllOwnerEmployees,
  fetchRestaurantHours,
  saveRestaurantHours,
} from "@/lib/employees-supabase";
import {
  fetchOwnerShifts,
  upsertShiftRow,
  deleteShiftRow,
  reassignShiftEmployee,
  fetchOwnerTimeOff,
  insertTimeOffRow,
  updateTimeOffRow,
  fetchOwnerTrades,
  insertTradeRow,
  updateTradeRow,
  bootstrapLocalSchedule,
} from "@/lib/schedule-supabase";
import {
  fetchMyEmployeeRow,
  fetchMyShifts,
  fetchOwnerOpenTrades,
  fetchShiftsByIds,
  fetchMyTimeOff,
  fetchCoworkerNames,
} from "@/lib/employee-supabase";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export type Role = string;
export const BUILT_IN_ROLES = [
  "Host","Busser","Server Assistant","Bar Back","Bartender","Server","Manager","Assistant Manager",
  "Chef","Sous Chef","Line Cook","Fry Cook","Saute","Grill","Pizza","Garde Manger","Dishwasher","Prep",
] as const;
export type BuiltInRole = typeof BUILT_IN_ROLES[number];
export interface CustomRole { name: string; section: "FOH" | "BOH"; color: string }

export type TrainingCategory = "Server" | "Bartender" | "Host" | "Kitchen";

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
}

export interface TrainingVideo {
  id: string;
  title: string;
  durationSec: number;
  role: TrainingCategory;
  quiz: QuizQuestion[];
  passingScore: number;
}

export interface VideoProgress {
  videoId: string;
  watchedSec: number;
  completedAt?: string;
  quizScore?: number;
  passed?: boolean;
  attempts: number;
  lockedOut?: boolean;
}

export type Section = "FOH" | "BOH";
export type Position =
  | "Hostess" | "Bartender" | "Server" | "Server Assistant" | "Busser" | "Bar Back"
  | "Manager" | "Assistant Manager"
  | "Chef" | "Sous Chef" | "Line Cook" | "Garde Manger" | "Dishwasher" | "Prep Cook";

export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export const DAY_KEYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export type Meal = "Breakfast" | "Lunch" | "Dinner";
export type DayAvailability =
  | { kind: "full" }
  | { kind: "none" }
  | { kind: "partial"; meals: Meal[] };
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
  byPosition?: Partial<Record<Position, number>>;
};
export type RestaurantHoursConfigV3 = {
  version: 3;
  days: RestaurantHours;
  mealPeriods: MealPeriods;
  arrivalOffsets: ArrivalOffsets;
};

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
  position: Position | undefined,
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

// Format "HH:MM" (24h) → "3:00pm" for suggestion labels.
function fmt12(hhmm: string): string {
  const [hs, ms] = hhmm.split(":");
  const h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
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
  position: Position | undefined;
  section: Section | undefined;
  restaurantHours: RestaurantHours;
  mealPeriods: MealPeriods;
  arrivalOffsets: ArrivalOffsets;
  preferredMeals?: Meal[]; // used to bubble a matching suggestion to the top
}): ShiftSuggestion[] {
  const { dayKey, position, section, restaurantHours, mealPeriods, arrivalOffsets, preferredMeals } = input;
  const day = restaurantHours[dayKey];
  const arrival = arrivalOffsetFor(position, section, arrivalOffsets);
  const closeout = closeoutMinFor(section);
  const dayOpen = day.closed ? "00:00" : day.open;
  const dayClose = day.closed ? "23:59" : day.close;
  const order: Meal[] = ["Breakfast", "Lunch", "Dinner"];
  const enabled = order.filter((m) => mealPeriods[m].enabled);
  const suggestions: ShiftSuggestion[] = [];

  for (const m of enabled) {
    const p = mealPeriods[m];
    const start = maxTime(dayOpen, subMin(p.start, arrival));
    const end = minTime(dayClose, addMin(p.end, closeout));
    if (start >= end) continue;
    suggestions.push({
      key: `single-${m}`,
      label: `${m} — arrive ${fmt12(start)} → out ${fmt12(end)}`,
      start,
      end,
      meals: [m],
    });
  }

  // Combined doubles for any two adjacent enabled periods (e.g. Lunch + Dinner).
  for (let i = 0; i + 1 < enabled.length; i++) {
    const a = enabled[i]!, b = enabled[i + 1]!;
    const start = maxTime(dayOpen, subMin(mealPeriods[a].start, arrival));
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

export function isAvailableFor(av: DayAvailability | undefined, start: string, periods?: MealPeriods): boolean {
  if (!av || av.kind === "full") return true;
  if (av.kind === "none") return false;
  const meal = mealForShiftStart(start, periods);
  if (meal === null) return true; // no configured periods → don't block
  return av.meals.includes(meal);
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
  const violating = touched.filter((m) => !av.meals.includes(m));
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
  photoUrl?: string;
  invitedAt: string;
  onboardingStarted: boolean;
  personalInfoComplete: boolean;
  progress: VideoProgress[];
  position?: Position;
  section?: Section;
  seniority?: number; // 1-5, higher = more experienced
  // Carry-forward context from the application that created this employee
  hiredFromApplicationId?: string;
  applicationPitch?: string;
  appliedAt?: string;
  workExperience?: WorkExperience[];
  specialTalents?: string;
}

export interface Shift {
  id: string;
  employeeId: string;
  role: Role;
  date: string;
  start: string;
  end: string;
  notes?: string;
  position?: Position;
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

export type ApplicationStatus = "new" | "reviewing" | "interview" | "hired" | "rejected";
export type ApplicationSource = "Walk-in" | "Instagram" | "Indeed" | "Friend" | "Google" | "Other";
export type AiScore = "Strong" | "Average" | "Weak";

export type HiringStage =
  | "new"
  | "video_offered"
  | "video_scheduled"
  | "interviewed"
  | "shadow_scheduled"
  | "hired"
  | "rejected";

export type AvailabilityHours = "Mornings" | "Afternoons" | "Evenings" | "Open availability";

export type InterviewType = "video" | "in_person" | "phone";

export interface ShadowShiftDetails {
  date: string;
  time: string;
  instructions: string;
  dressCode?: string;
}

export interface WorkExperience {
  employer: string;
  position: string;
  duration: "Less than 6 months" | "6 months - 1 year" | "1 - 2 years" | "2 - 5 years" | "5+ years" | "";
}

export interface JobApplication {
  id: string;
  jobId?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone: string;
  role?: Role;
  pitch?: string;
  source?: ApplicationSource;
  weeklyAvailability?: WeeklyAvailability;
  availabilityDays: string[];
  availabilityHours: AvailabilityHours;
  note?: string;
  appliedAt: string;
  status: ApplicationStatus;
  stage?: HiringStage;
  verified: boolean;
  aiScore?: AiScore;
  interviewSentAt?: string;
  interviewNotes?: string;
  interviewType?: InterviewType;
  offeredSlots?: string[];
  selectedSlot?: string;
  shadowShift?: ShadowShiftDetails;
  shadowConfirmedAt?: string | null;
  shadowResponseNote?: string | null;
  archived?: boolean;
  hiredEmployeeId?: string;
  workExperience?: WorkExperience[];
  specialTalents?: string;
  assignedTo?: string | null;
}

export function getHiringStage(a: Pick<JobApplication, "stage" | "status">): HiringStage {
  if (a.stage) return a.stage;
  if (a.status === "hired") return "hired";
  if (a.status === "rejected") return "rejected";
  if (a.status === "interview") return "video_offered";
  return "new";
}

export type TimeOffStatus = "pending" | "approved" | "denied";

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reasonType?: string;
  reason: string;
  status: TimeOffStatus;
  createdAt: string;
  resolvedAt?: string;
  decisionNote?: string;
}

export interface MenuUpload {
  name: string;
  type: string;
  sizeKB: number;
  uploadedAt: string;
  generatedAt?: string;
  preview?: string;
}

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

interface Store {
  currentUser: { type: "manager"; id: "owner" } | { type: "employee"; id: string };
  setCurrentUser: (u: Store["currentUser"]) => void;
  employeeHydrating: boolean;
  employees: Employee[];
  videos: TrainingVideo[];
  shifts: Shift[];
  trades: Trade[];
  jobs: JobPosting[];
  applications: JobApplication[];
  timeOff: TimeOffRequest[];
  menu: MenuUpload | null;
  drinkMenu: MenuUpload | null;
  restaurantProfile: RestaurantProfile | null;
  restaurantHours: RestaurantHours;
  mealPeriods: MealPeriods;
  setRestaurantHours: (h: RestaurantHours) => void;
  updateRestaurantDay: (day: DayKey, patch: Partial<DayHours>) => void;
  setMealPeriods: (p: MealPeriods) => void;
  updateMealPeriod: (meal: Meal, patch: Partial<MealPeriodConfig>) => void;
  arrivalOffsets: ArrivalOffsets;
  setArrivalOffsets: (o: ArrivalOffsets) => void;
  activeRoles: Role[];
  setActiveRoles: (roles: Role[]) => void;
  customRoles: CustomRole[];
  addCustomRole: (role: CustomRole) => void;
  removeCustomRole: (name: string) => void;
  setupCompleted: boolean;
  notifications: Notification[];
  setMenu: (m: MenuUpload | null) => void;
  setDrinkMenu: (m: MenuUpload | null) => void;
  markMenuGenerated: () => void;
  completeSetup: (profile: Omit<RestaurantProfile, "completedAt">, food: MenuUpload | null, drink: MenuUpload | null) => void;
  resetSetup: () => void;
  markNotificationsRead: () => void;
  inviteEmployee: (data: { name: string; email: string; role: Role }) => void;
  joinStaff: (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    role: Role;
    weeklyAvailability: WeeklyAvailability;
    emergencyContact: EmergencyContact;
  }) => string;
  updateRestaurantSlug: (slug: string) => void;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  clearAllEmployees: () => void;
  recordVideoProgress: (employeeId: string, videoId: string, patch: Partial<VideoProgress>) => void;
  recordQuizAttempt: (employeeId: string, videoId: string, score: number, passed: boolean) => void;
  postTrade: (shiftId: string, note?: string) => void;
  upsertShift: (shift: Shift) => void;
  deleteShift: (id: string) => void;
  claimTrade: (tradeId: string, employeeId: string) => void;
  resolveTrade: (tradeId: string, approved: boolean) => void;
  postJob: (data: Omit<JobPosting, "id" | "postedAt" | "open">) => void;
  toggleJobOpen: (id: string) => void;
  removeJob: (id: string) => void;
  submitApplication: (data: Omit<JobApplication, "id" | "appliedAt" | "status" | "aiScore">) => string;
  setApplicationStatus: (id: string, status: ApplicationStatus) => void;
  scheduleInterview: (id: string) => void;
  setInterviewNotes: (id: string, notes: string) => void;
  declineApplication: (id: string) => void;
  reconsiderApplication: (id: string) => void;
  hireApplication: (id: string, overrides?: Partial<Employee>) => string | null;
  approveForInterview: (id: string, type: InterviewType, slots: string[]) => void;
  applicantSelectSlot: (id: string, slot: string) => void;
  completeInterview: (id: string, notes?: string) => void;
  inviteShadowShift: (id: string, details: ShadowShiftDetails) => void;
  reassignApplication: (id: string, teamMemberId: string | null) => Promise<void>;
  requestTimeOff: (data: Omit<TimeOffRequest, "id" | "createdAt" | "status">) => void;
  resolveTimeOff: (id: string, approved: boolean, note?: string) => void;
}

const Ctx = createContext<Store | null>(null);

// Quiz question pools — drawn from existing role-specific content. Each module
// pulls its questions from the pool that matches its training category.
const QUIZ_POOLS: Record<TrainingCategory, QuizQuestion[]> = {
  Server: [
    { question: "When should you greet a guest after they're seated?", options: ["Within 5 minutes", "Within 2 minutes & offer water", "When you have time", "Only if they wave"], answerIndex: 1 },
    { question: "How should allergies be handled?", options: ["Ignore them", "Note & alert kitchen immediately", "Tell guest to be careful", "Guess what's safe"], answerIndex: 1 },
    { question: "A guest is unhappy with their dish. What do you do first?", options: ["Argue politely", "Listen, apologize, then offer a fix", "Comp the meal silently", "Ignore it"], answerIndex: 1 },
    { question: "How often should you check back after entrées drop?", options: ["Never", "Within 2 bites", "After 15 minutes", "Only when called"], answerIndex: 1 },
    { question: "Best way to deliver a check?", options: ["Toss on table", "Wait until asked, then promptly", "Drop with appetizers", "Hand directly to host"], answerIndex: 1 },
    { question: "When clearing plates, you should…", options: ["Stack loudly at table", "Clear quietly from the right when all are done", "Leave them all night", "Ask guests to help"], answerIndex: 1 },
    { question: "Best way to upsell wine?", options: ["Push the most expensive", "Pair to the dish they ordered", "Ignore wine list", "Suggest random"], answerIndex: 1 },
    { question: "If you don't know an ingredient, you should:", options: ["Make it up", "Check with the kitchen", "Skip the question", "Say it's a secret"], answerIndex: 1 },
    { question: "When describing a dish, focus on:", options: ["Calories", "Ingredients, preparation, and flavor", "Pricing", "Allergens only"], answerIndex: 1 },
    { question: "Modifiers must be entered…", options: ["After food delivered", "Before sending the ticket", "Only if reminded", "Never"], answerIndex: 1 },
  ],
  Bartender: [
    { question: "When must you ID a guest?", options: ["Never", "After 10pm only", "Anyone appearing under 30", "Weekends only"], answerIndex: 2 },
    { question: "Visibly intoxicated guest orders another drink. You:", options: ["Serve", "Politely refuse, offer water/food", "Charge double", "Ask coworker to serve"], answerIndex: 1 },
    { question: "Signs of intoxication include:", options: ["Quietness", "Slurred speech, unsteady balance", "Ordering food", "Asking for the check"], answerIndex: 1 },
    { question: "Standard single pour is:", options: ["0.5 oz", "1.5 oz", "3 oz", "Whatever feels right"], answerIndex: 1 },
    { question: "Why use a jigger?", options: ["Tradition", "Consistency and cost control", "Looks cool", "It's faster"], answerIndex: 1 },
    { question: "Fresh citrus should be juiced:", options: ["Weekly", "Daily", "Monthly", "Pre-bottled is fine"], answerIndex: 1 },
    { question: "Red wine is typically served at:", options: ["32°F", "55–65°F", "85°F", "Boiling"], answerIndex: 1 },
    { question: "Best draft beer pour leaves:", options: ["No head", "About 1-inch head", "All foam", "Half foam"], answerIndex: 1 },
    { question: "FIFO inventory applies to:", options: ["Only food", "Beer kegs and wine inventory too", "Nothing", "Just wine"], answerIndex: 1 },
  ],
  Host: [
    { question: "Greet every guest within:", options: ["30 seconds", "2 minutes", "5 minutes", "When you have time"], answerIndex: 0 },
    { question: "When the wait is 45+ minutes you should:", options: ["Hide the truth", "Quote accurately & offer alternatives", "Tell them to leave", "Quote 10 min"], answerIndex: 1 },
    { question: "Rotating sections helps:", options: ["Confuse staff", "Balance server workload & tips", "Slow service", "Annoy guests"], answerIndex: 1 },
    { question: "When seating a guest with accessibility needs:", options: ["Far booth", "Ask their preference, accommodate", "Closest table only", "Skip them"], answerIndex: 1 },
    { question: "If you mis-seat into a closed section:", options: ["Leave them", "Apologize, move them, notify server", "Argue", "Ignore"], answerIndex: 1 },
    { question: "A reservation no-shows after 15 minutes — best move:", options: ["Hold forever", "Release the table & note the no-show", "Charge them", "Re-book immediately"], answerIndex: 1 },
    { question: "Phone reservation best practice:", options: ["Rush the call", "Confirm name, party, time, contact, special needs", "Take only the name", "Refuse phone bookings"], answerIndex: 1 },
  ],
  Kitchen: [
    { question: "Safe internal temp for chicken (°F):", options: ["120", "145", "165", "200"], answerIndex: 2 },
    { question: "Cutting board color for raw poultry:", options: ["Green", "Red", "Yellow", "Blue"], answerIndex: 2 },
    { question: "Hands must be washed:", options: ["Once a shift", "Between tasks and after contamination", "Only after bathroom", "When dirty visibly"], answerIndex: 1 },
    { question: "Danger zone temperature range (°F):", options: ["0–32", "41–135", "150–200", "200+"], answerIndex: 1 },
    { question: "Raw meat in the walk-in should be stored:", options: ["On top shelf", "Below ready-to-eat foods", "Anywhere", "Next to dairy"], answerIndex: 1 },
    { question: "Mise en place means:", options: ["Cleaning at close", "Everything in its place before service", "A French sauce", "A knife type"], answerIndex: 1 },
    { question: "If you 86 an item, you should:", options: ["Keep selling it", "Notify FOH immediately", "Wait an hour", "Tell only one server"], answerIndex: 1 },
    { question: "Walk-in temperature should be at or below:", options: ["50°F", "41°F", "60°F", "32°F"], answerIndex: 1 },
    { question: "Sanitizer bucket should be changed:", options: ["Weekly", "Every 2–4 hours", "Once a month", "Never"], answerIndex: 1 },
    { question: "Hot oil disposal:", options: ["Down drain", "Cool, then to designated grease bin", "Trash bag hot", "Leave in fryer indefinitely"], answerIndex: 1 },
  ],
};

// Role-specific module assignments. Each module is auto-assigned to every role
// listed in `roles`. Manager / Assistant Manager get every module plus their own.
type ModuleDef = {
  id: string;
  title: string;
  category: TrainingCategory;
  roles: Role[];
};

const LINE_COOK_ROLES: Role[] = ["Line Cook", "Saute", "Grill", "Fry Cook"];
const CHEF_ROLES: Role[] = ["Chef", "Sous Chef"];

const MODULE_DEFS: ModuleDef[] = [
  // Server
  { id: "server-menu-knowledge", title: "Menu Knowledge & Storytelling", category: "Server", roles: ["Server"] },
  { id: "server-wine-pairing", title: "Wine & Beverage Pairing", category: "Server", roles: ["Server"] },
  { id: "server-service-standards", title: "Service Standards", category: "Server", roles: ["Server"] },
  // Bartender
  { id: "bar-signature-cocktails", title: "Signature Cocktails", category: "Bartender", roles: ["Bartender"] },
  { id: "bar-wine-beer-program", title: "Wine & Beer Program", category: "Bartender", roles: ["Bartender"] },
  { id: "bar-responsible-service", title: "Responsible Service", category: "Bartender", roles: ["Bartender"] },
  // Host
  { id: "host-guest-experience", title: "Guest Experience", category: "Host", roles: ["Host"] },
  { id: "host-reservation-management", title: "Reservation Management", category: "Host", roles: ["Host"] },
  { id: "host-first-impressions", title: "First Impressions", category: "Host", roles: ["Host"] },
  // Busser / Server Assistant
  { id: "support-table-setup", title: "Table Setup Standards", category: "Server", roles: ["Busser", "Server Assistant"] },
  { id: "support-guest-interaction", title: "Guest Interaction Basics", category: "Server", roles: ["Busser", "Server Assistant"] },
  { id: "support-service-flow", title: "Service Flow", category: "Server", roles: ["Busser", "Server Assistant"] },
  // Bar Back
  { id: "barback-setup-maintenance", title: "Bar Setup & Maintenance", category: "Bartender", roles: ["Bar Back"] },
  { id: "barback-inventory", title: "Inventory Basics", category: "Bartender", roles: ["Bar Back"] },
  { id: "barback-support-standards", title: "Bar Support Standards", category: "Bartender", roles: ["Bar Back"] },
  // Chef / Sous Chef
  { id: "chef-leadership", title: "Kitchen Leadership", category: "Kitchen", roles: CHEF_ROLES },
  { id: "chef-food-safety-compliance", title: "Food Safety & Compliance", category: "Kitchen", roles: CHEF_ROLES },
  { id: "chef-menu-development", title: "Menu Development", category: "Kitchen", roles: CHEF_ROLES },
  // Line Cook / Saute / Grill / Fry
  { id: "line-setup-menu", title: "Line Setup & Menu Items", category: "Kitchen", roles: LINE_COOK_ROLES },
  { id: "line-allergens", title: "Allergens & Cross-Contamination", category: "Kitchen", roles: LINE_COOK_ROLES },
  { id: "line-food-safety", title: "Food Safety", category: "Kitchen", roles: LINE_COOK_ROLES },
  // Garde Manger
  { id: "garde-cold-station", title: "Cold Station Setup", category: "Kitchen", roles: ["Garde Manger"] },
  { id: "garde-plating", title: "Plating Standards", category: "Kitchen", roles: ["Garde Manger"] },
  { id: "garde-food-safety", title: "Food Safety", category: "Kitchen", roles: ["Garde Manger"] },
  // Pizza
  { id: "pizza-production", title: "Pizza Production", category: "Kitchen", roles: ["Pizza"] },
  { id: "pizza-dough-ingredients", title: "Dough & Ingredient Standards", category: "Kitchen", roles: ["Pizza"] },
  { id: "pizza-food-safety", title: "Food Safety", category: "Kitchen", roles: ["Pizza"] },
  // Dishwasher
  { id: "dish-sanitation", title: "Sanitation Standards", category: "Kitchen", roles: ["Dishwasher"] },
  { id: "dish-equipment-care", title: "Equipment Care", category: "Kitchen", roles: ["Dishwasher"] },
  { id: "dish-kitchen-safety", title: "Kitchen Safety", category: "Kitchen", roles: ["Dishwasher"] },
  // Prep
  { id: "prep-standards", title: "Prep Standards", category: "Kitchen", roles: ["Prep"] },
  { id: "prep-food-safety-basics", title: "Food Safety Basics", category: "Kitchen", roles: ["Prep"] },
  { id: "prep-knife-skills", title: "Knife Skills", category: "Kitchen", roles: ["Prep"] },
  // Manager / Assistant Manager (their own three; they also receive all others)
  { id: "mgr-leadership", title: "Leadership & Team Management", category: "Server", roles: ["Manager", "Assistant Manager"] },
  { id: "mgr-scheduling-ops", title: "Scheduling & Operations", category: "Server", roles: ["Manager", "Assistant Manager"] },
  { id: "mgr-guest-recovery", title: "Guest Recovery", category: "Server", roles: ["Manager", "Assistant Manager"] },
];

export function trainingCategoryForRole(role: Role, customRoles: CustomRole[] = []): TrainingCategory {
  if (role === "Host") return "Host";
  if (role === "Bartender" || role === "Bar Back") return "Bartender";
  if (["Chef", "Sous Chef", "Line Cook", "Fry Cook", "Saute", "Grill", "Pizza", "Garde Manger", "Dishwasher", "Prep"].includes(role)) return "Kitchen";
  const custom = customRoles.find((c) => c.name === role);
  if (custom) return custom.section === "BOH" ? "Kitchen" : "Server";
  return "Server";
}

function seedVideos(): TrainingVideo[] {
  return MODULE_DEFS.map((m) => ({
    id: m.id,
    title: m.title,
    durationSec: 15,
    role: m.category,
    passingScore: 80,
    quiz: pickRandomQuestions(QUIZ_POOLS[m.category], Math.min(6, QUIZ_POOLS[m.category].length)),
  }));
}

const MANAGER_ROLES: Role[] = ["Manager", "Assistant Manager"];

/** All module ids assigned to a single role. Manager/Asst Manager receive every module. */
export function moduleIdsForRole(role: Role, customRoles: CustomRole[] = []): string[] {
  if (MANAGER_ROLES.includes(role)) return MODULE_DEFS.map((m) => m.id);
  const custom = customRoles.find((c) => c.name === role);
  if (custom) {
    const cat: TrainingCategory = custom.section === "BOH" ? "Kitchen" : "Server";
    return MODULE_DEFS.filter((m) => m.category === cat).map((m) => m.id);
  }
  return MODULE_DEFS.filter((m) => m.roles.includes(role)).map((m) => m.id);
}

/** Union of module ids across an employee's approved roles (or primary role as fallback). */
export function moduleIdsForEmployee(emp: { primaryRole: Role; approvedRoles?: Role[] }, customRoles: CustomRole[] = []): string[] {
  const roles = emp.approvedRoles && emp.approvedRoles.length > 0 ? emp.approvedRoles : [emp.primaryRole];
  const ids = new Set<string>();
  roles.forEach((r) => moduleIdsForRole(r, customRoles).forEach((id) => ids.add(id)));
  return Array.from(ids);
}

function seedEmployees(): Employee[] {
  type Seed = {
    first: string; last: string; position: Position; section: Section; role: Role;
    seniority: number; availability?: string;
    weekly?: Partial<WeeklyAvailability>;
  };
  const dinnerOnly: DayAvailability = { kind: "partial", meals: ["Dinner"] };
  const lunchOnly: DayAvailability = { kind: "partial", meals: ["Lunch"] };
  const notAvailable: DayAvailability = { kind: "none" };

  const seeds: Seed[] = [
    // FOH
    { first: "Maria", last: "Santos", position: "Hostess", section: "FOH", role: "Host", seniority: 4 },
    { first: "Jenny", last: "Torres", position: "Hostess", section: "FOH", role: "Host", seniority: 3 },
    { first: "Cara", last: "Mitchell", position: "Hostess", section: "FOH", role: "Host", seniority: 2, weekly: { Mon: notAvailable } },
    { first: "Mike", last: "Reynolds", position: "Bartender", section: "FOH", role: "Bartender", seniority: 5, availability: "Full shifts" },
    { first: "Danny", last: "Kim", position: "Bartender", section: "FOH", role: "Bartender", seniority: 3, availability: "Swing 4hr", weekly: { Mon: notAvailable, Tue: notAvailable, Wed: dinnerOnly, Thu: dinnerOnly, Fri: dinnerOnly, Sat: dinnerOnly, Sun: dinnerOnly } },
    { first: "Anthony", last: "Bianchi", position: "Server", section: "FOH", role: "Server", seniority: 5 },
    { first: "Sofia", last: "Lopez", position: "Server", section: "FOH", role: "Server", seniority: 5 },
    { first: "James", last: "Walker", position: "Server", section: "FOH", role: "Server", seniority: 4 },
    { first: "Nina", last: "Patel", position: "Server", section: "FOH", role: "Server", seniority: 4, weekly: { Sun: notAvailable } },
    { first: "Chris", last: "Thompson", position: "Server", section: "FOH", role: "Server", seniority: 4 },
    { first: "Amanda", last: "Rivera", position: "Server", section: "FOH", role: "Server", seniority: 3 },
    { first: "Joe", last: "DeLuca", position: "Server", section: "FOH", role: "Server", seniority: 3 },
    { first: "Lisa", last: "Martinez", position: "Server", section: "FOH", role: "Server", seniority: 2, weekly: { Sun: notAvailable, Mon: notAvailable } },
    { first: "Kevin", last: "Stone", position: "Server", section: "FOH", role: "Server", seniority: 2 },
    { first: "Carlos", last: "Mendez", position: "Busser", section: "FOH", role: "Busser", seniority: 3 },
    { first: "Pedro", last: "Ruiz", position: "Busser", section: "FOH", role: "Busser", seniority: 2 },
    { first: "Tommy", last: "Hall", position: "Bar Back", section: "FOH", role: "Bar Back", seniority: 3 },
    { first: "Rico", last: "Vasquez", position: "Bar Back", section: "FOH", role: "Bar Back", seniority: 2 },
    { first: "Sarah", last: "Klein", position: "Manager", section: "FOH", role: "Manager", seniority: 5 },
    { first: "Frank", last: "D'Amato", position: "Assistant Manager", section: "FOH", role: "Assistant Manager", seniority: 4 },
    { first: "Luis", last: "Garcia", position: "Busser", section: "FOH", role: "Busser", seniority: 2 },
    { first: "Mario", last: "Tessaro", position: "Busser", section: "FOH", role: "Busser", seniority: 2 },
    // BOH
    { first: "Marco", last: "Bianchi", position: "Chef", section: "BOH", role: "Chef", seniority: 5 },
    { first: "Tony", last: "Romano", position: "Sous Chef", section: "BOH", role: "Sous Chef", seniority: 5 },
    { first: "Alex", last: "Park", position: "Line Cook", section: "BOH", role: "Line Cook", seniority: 4 },
    { first: "Ramon", last: "Silva", position: "Line Cook", section: "BOH", role: "Line Cook", seniority: 4 },
    { first: "Diego", last: "Morales", position: "Line Cook", section: "BOH", role: "Line Cook", seniority: 3 },
    { first: "Chris", last: "Lin", position: "Line Cook", section: "BOH", role: "Line Cook", seniority: 3 },
    { first: "Pat", last: "O'Brien", position: "Line Cook", section: "BOH", role: "Line Cook", seniority: 2, weekly: { Mon: lunchOnly, Tue: lunchOnly, Wed: lunchOnly, Thu: lunchOnly, Fri: lunchOnly, Sat: notAvailable, Sun: notAvailable } },
    { first: "Juan", last: "Castro", position: "Dishwasher", section: "BOH", role: "Dishwasher", seniority: 3 },
    { first: "Mike", last: "Tran", position: "Dishwasher", section: "BOH", role: "Dishwasher", seniority: 2 },
    { first: "Sam", last: "Reyes", position: "Dishwasher", section: "BOH", role: "Dishwasher", seniority: 2 },
    { first: "Ana", last: "Gomez", position: "Prep Cook", section: "BOH", role: "Prep", seniority: 4 },
    { first: "Luis", last: "Mejia", position: "Prep Cook", section: "BOH", role: "Prep", seniority: 3 },
  ];
  const relPool: Relationship[] = ["Spouse", "Parent", "Sibling", "Friend", "Other"];
  return seeds.map((s, i) => {
    const name = `${s.first} ${s.last}`;
    const handle = `${s.first}.${s.last}`.toLowerCase().replace(/[^a-z.]/g, "");
    const phoneTail = String(2000 + i).padStart(4, "0");
    const weekly = { ...defaultWeeklyAvailability(), ...(s.weekly ?? {}) };
    return {
      id: `e${i + 1}`,
      name,
      firstName: s.first,
      lastName: s.last,
      email: `${handle}@perlos.com`,
      phone: `(555) 412-${phoneTail}`,
      primaryRole: s.role,
      approvedRoles: [s.role],
      autoApproveRoles: s.seniority >= 4 ? [s.role] : [],
      availability: s.availability ?? "Flexible",
      weeklyAvailability: weekly,
      emergencyContact: {
        firstName: ["Sam","Jordan","Alex","Taylor","Chris"][i % 5],
        lastName: s.last,
        phone: `(555) 887-${phoneTail}`,
        relationship: relPool[i % relPool.length],
      },
      invitedAt: "2026-05-01",
      onboardingStarted: true,
      personalInfoComplete: true,
      progress: [],
      position: s.position,
      section: s.section,
      seniority: s.seniority,
    };
  });
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

function seedApplications(): JobApplication[] {
  return [];
}

function seedTimeOff(): TimeOffRequest[] {
  const d = (offset: number) => {
    const x = new Date(); x.setDate(x.getDate() + offset);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return [
    {
      id: "to1", employeeId: "e2", startDate: d(14), endDate: d(18),
      reason: "Family wedding out of state.", status: "pending",
      createdAt: new Date().toISOString(),
    },
  ];
}

const STORAGE_KEY = "sidework-store-v9";

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

export function SideworkProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState(() => ({
    currentUser: { type: "manager", id: "owner" } as Store["currentUser"],
    employees: seedEmployees(),
    videos: seedVideos(),
    shifts: seedShifts(),
    trades: seedTrades(),
    jobs: seedJobs(),
    applications: seedApplications(),
    timeOff: seedTimeOff(),
    menu: null as MenuUpload | null,
    drinkMenu: null as MenuUpload | null,
    restaurantProfile: null as RestaurantProfile | null,
    restaurantHours: defaultRestaurantHours(),
    mealPeriods: defaultMealPeriods(),
    arrivalOffsets: defaultArrivalOffsets(),
    activeRoles: [
      "Host","Server Assistant","Busser","Bar Back","Bartender","Server","Manager","Assistant Manager",
      "Chef","Sous Chef","Saute","Grill","Line Cook","Fry Cook","Pizza","Garde Manger","Prep","Dishwasher",
    ] as Role[],
    customRoles: [] as CustomRole[],
    setupCompleted: false,
    notifications: [] as Notification[],
  }));

  useEffect(() => {
    try {
      // Clear any prior versions that may contain "Porter" seed data.
      for (let i = 1; i <= 8; i++) {
        try { localStorage.removeItem(`sidework-store-v${i}`); } catch {}
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = sanitizePorter(JSON.parse(raw));
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

  // Owner-scoped Supabase sync for the hiring pipeline (jobs + applications)
  // AND the employee roster + restaurant hours (Wave A of scheduling).
  // Uses the "effective owner id" from AuthContext so both real owners and
  // hiring-managers (with can_manage_hiring granted for that owner) hydrate
  // against the same owner's data.
  const { effectiveOwner, loading: authLoading } = useAuth();
  const ownerIdRef = useRef<string | null>(null);
  const effectiveOwnerId = effectiveOwner?.ownerId ?? null;
  const acting = effectiveOwner?.acting ?? null;
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
      setState((s) => ({ ...s, jobs: [], applications: [], shifts: [], trades: [], timeOff: [] }));
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const [postings, apps, remoteEmployeesInitial, remoteHours, remoteShiftsInitial, remoteTimeOffInitial, remoteTradesInitial] = await Promise.all([
          fetchOwnerPostings(effectiveOwnerId),
          fetchOwnerApplications(effectiveOwnerId),
          fetchOwnerEmployees(effectiveOwnerId),
          fetchRestaurantHours(effectiveOwnerId),
          fetchOwnerShifts(effectiveOwnerId),
          fetchOwnerTimeOff(effectiveOwnerId),
          fetchOwnerTrades(effectiveOwnerId),
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
        if (
          remoteEmployees.length === 0 &&
          acting === "owner" &&
          local.employees.length > 0 &&
          !alreadyBootstrapped
        ) {
          bootstrappedOwnersRef.current.add(effectiveOwnerId);
          try {
            remoteEmployees = await bootstrapLocalEmployees(effectiveOwnerId, local.employees);
            if (cancelled) return;
            // Build local→cloud id map to translate FKs on shifts/trades/time-off.
            const idMap = new Map<string, string>();
            for (const e of remoteEmployees) {
              // The bootstrap stored the old id in local_id; refetch that mapping.
              // fetchOwnerEmployees doesn't return local_id, but we know 1:1 by
              // matching name+email+phone+invitedAt against the local list. We
              // instead re-derive the map by matching each local employee to
              // the cloud row created for the same name (safe for our data).
            }
            // Fetch local_id map directly.
            const { supabase } = await import("@/integrations/supabase/client");
            const { data: mapRows } = await supabase
              .from("restaurant_employees")
              .select("id, local_id")
              .eq("owner_id", effectiveOwnerId)
              .not("local_id", "is", null);
            for (const r of (mapRows ?? []) as Array<{ id: string; local_id: string | null }>) {
              if (r.local_id) idMap.set(r.local_id, r.id);
            }
            // Wave B: also bootstrap schedule/time-off/trades.
            if (local.shifts.length > 0 || local.timeOff.length > 0 || local.trades.length > 0) {
              try {
                const { shifts: bs, timeOff: bt, trades: btr } = await bootstrapLocalSchedule(
                  effectiveOwnerId,
                  {
                    shifts: local.shifts,
                    timeOff: local.timeOff,
                    trades: local.trades,
                    localToCloudEmployeeId: idMap,
                  },
                );
                remoteShifts = bs;
                remoteTimeOff = bt;
                remoteTrades = btr;
              } catch (e) {
                console.error("[schedule-bootstrap] failed", e);
              }
            }
          } catch (e) {
            // Roll back the guard so a transient failure can retry next mount.
            bootstrappedOwnersRef.current.delete(effectiveOwnerId);
            console.error("[employees-bootstrap] failed", e);
            remoteEmployees = [];
          }
        }

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


        setState((s) => ({
          ...s,
          jobs: postings,
          applications: apps,
          // If nothing remote and no bootstrap happened, keep local (single-device owner).
          employees: remoteEmployees.length > 0 ? remoteEmployees : s.employees,
          shifts: remoteShifts,
          timeOff: remoteTimeOff.length > 0 ? remoteTimeOff : s.timeOff,
          trades: remoteTrades,
          ...hoursPatch,
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
  useEffect(() => {
    if (!hydrated || authLoading) return;
    if (effectiveOwnerId) return; // owner/manager branch already handled it
    if (!employeeCtxOwnerId || !employeeCtxEmployeeId) return;
    let cancelled = false;
    setEmployeeHydrating(true);
    ownerIdRef.current = employeeCtxOwnerId;
    (async () => {
      try {
        const [me, myShifts, openTrades, myTimeOff, coworkers] = await Promise.all([
          fetchMyEmployeeRow(employeeCtxEmployeeId),
          fetchMyShifts(employeeCtxEmployeeId),
          fetchOwnerOpenTrades(employeeCtxOwnerId),
          fetchMyTimeOff(employeeCtxEmployeeId),
          fetchCoworkerNames(employeeCtxOwnerId),
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
        setState((s) => ({
          ...s,
          employees: me ? [me, ...coworkerStubs] : coworkerStubs,
          shifts: [...myShifts, ...boardShifts],
          trades: openTrades,
          timeOff: myTimeOff,
          // Owner-only surfaces cleared for employee sessions
          jobs: [],
          applications: [],
        }));
        // Auto-select this employee as currentUser so /employee finds them.
        setState((s) => ({
          ...s,
          currentUser: { type: "employee", id: employeeCtxEmployeeId },
        }));
      } catch (e) {
        console.error("[employee-sync] failed to load", e);
      } finally {
        if (!cancelled) setEmployeeHydrating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, hydrated, effectiveOwnerId, employeeCtxOwnerId, employeeCtxEmployeeId]);


  const uid = (prefix: string) => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const newUuid = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const store: Store = {
    ...state,
    employeeHydrating,
    setRestaurantHours: (h) => {
      setState((s) => ({ ...s, restaurantHours: h }));
      const oid = ownerIdRef.current;
      if (oid) saveRestaurantHours(oid, serializeRestaurantHoursConfig(h, latestStateRef.current.mealPeriods)).catch((e) => console.error("[setRestaurantHours]", e));
    },
    updateRestaurantDay: (day, patch) =>
      setState((s) => {
        const next = { ...s.restaurantHours, [day]: { ...s.restaurantHours[day], ...patch } };
        const oid = ownerIdRef.current;
        if (oid) saveRestaurantHours(oid, serializeRestaurantHoursConfig(next, s.mealPeriods)).catch((e) => console.error("[updateRestaurantDay]", e));
        return { ...s, restaurantHours: next };
      }),
    setMealPeriods: (p) => {
      setState((s) => ({ ...s, mealPeriods: p }));
      const oid = ownerIdRef.current;
      if (oid) saveRestaurantHours(oid, serializeRestaurantHoursConfig(latestStateRef.current.restaurantHours, p)).catch((e) => console.error("[setMealPeriods]", e));
    },
    updateMealPeriod: (meal, patch) =>
      setState((s) => {
        const next = { ...s.mealPeriods, [meal]: { ...s.mealPeriods[meal], ...patch } };
        const oid = ownerIdRef.current;
        if (oid) saveRestaurantHours(oid, serializeRestaurantHoursConfig(s.restaurantHours, next)).catch((e) => console.error("[updateMealPeriod]", e));
        return { ...s, mealPeriods: next };
      }),
    setActiveRoles: (roles) => setState((s) => ({ ...s, activeRoles: roles })),
    addCustomRole: (role) =>
      setState((s) => {
        if (s.customRoles.some((c) => c.name === role.name) || (BUILT_IN_ROLES as readonly string[]).includes(role.name)) {
          return s;
        }
        return {
          ...s,
          customRoles: [...s.customRoles, role],
          activeRoles: s.activeRoles.includes(role.name) ? s.activeRoles : [...s.activeRoles, role.name],
        };
      }),
    removeCustomRole: (name) =>
      setState((s) => ({
        ...s,
        customRoles: s.customRoles.filter((c) => c.name !== name),
        activeRoles: s.activeRoles.filter((r) => r !== name),
      })),
    setCurrentUser: (u) => setState((s) => ({ ...s, currentUser: u })),
    clearAllEmployees: () => {
      setState((s) => ({ ...s, employees: [], shifts: [], trades: [], timeOff: [] }));
      const oid = ownerIdRef.current;
      if (oid) deleteAllOwnerEmployees(oid).catch((e) => console.error("[clearAllEmployees]", e));
    },
    inviteEmployee: ({ name, email, role }) => {
      const newId = newUuid();
      const employee: Employee = {
        id: newId, name, email, primaryRole: role,
        approvedRoles: [role], autoApproveRoles: [], availability: "",
        invitedAt: new Date().toISOString().slice(0, 10),
        onboardingStarted: false, personalInfoComplete: false, progress: [],
      };
      setState((s) => ({
        ...s,
        employees: [...s.employees, employee],
        notifications: [
          {
            id: uid("n"),
            type: "training_passed",
            message: `Training automatically assigned to ${name} based on their ${role} position.`,
            employeeId: newId,
            createdAt: new Date().toISOString(),
            read: false,
          },
          ...s.notifications,
        ],
      }));
      const oid = ownerIdRef.current;
      if (oid) {
        insertEmployee(oid, employee, { localId: newId }).catch((e) =>
          console.error("[inviteEmployee]", e),
        );
      }
    },
    joinStaff: (data) => {
      const empId = newUuid();
      const fullName = `${data.firstName} ${data.lastName}`.trim();
      const employee: Employee = {
        id: empId,
        name: fullName,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        primaryRole: data.role,
        approvedRoles: [data.role],
        autoApproveRoles: [],
        availability: "",
        weeklyAvailability: data.weeklyAvailability,
        emergencyContact: data.emergencyContact,
        invitedAt: new Date().toISOString().slice(0, 10),
        onboardingStarted: true,
        personalInfoComplete: true,
        progress: [],
        seniority: 1,
      };
      setState((s) => ({
        ...s,
        employees: [...s.employees, employee],
        notifications: [
          {
            id: uid("n"),
            type: "training_passed",
            message: `${fullName} just joined 86Paper!`,
            employeeId: empId,
            createdAt: new Date().toISOString(),
            read: false,
          },
          ...s.notifications,
        ],
      }));
      const oid = ownerIdRef.current;
      if (oid) {
        insertEmployee(oid, employee, { localId: empId }).catch((e) =>
          console.error("[joinStaff]", e),
        );
      }
      return empId;
    },
    updateRestaurantSlug: (slug) =>
      setState((s) => ({
        ...s,
        restaurantProfile: s.restaurantProfile ? { ...s.restaurantProfile, slug } : s.restaurantProfile,
      })),
    updateEmployee: (id, patch) => {
      setState((s) => {
        const before = s.employees.find((e) => e.id === id);
        const employees = s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e));
        const after = employees.find((e) => e.id === id);
        let notifications = s.notifications;
        if (before && after) {
          const beforeIds = new Set(moduleIdsForEmployee(before));
          const afterIds = moduleIdsForEmployee(after);
          const added = afterIds.filter((mid) => !beforeIds.has(mid));
          if (added.length > 0) {
            notifications = [
              {
                id: uid("n"),
                type: "training_passed",
                message: `Training updated for ${after.name}: ${added.length} new module${added.length === 1 ? "" : "s"} assigned for ${after.primaryRole} role.`,
                employeeId: after.id,
                createdAt: new Date().toISOString(),
                read: false,
              },
              ...notifications,
            ];
          }
        }
        return { ...s, employees, notifications };
      });
      const oid = ownerIdRef.current;
      if (oid) updateEmployeeRow(id, patch).catch((e) => console.error("[updateEmployee]", e));
    },
    recordVideoProgress: (employeeId, videoId, patch) =>
      setState((s) => ({
        ...s,
        employees: s.employees.map((e) => {
          if (e.id !== employeeId) return e;
          const existing = e.progress.find((p) => p.videoId === videoId);
          const next = existing
            ? e.progress.map((p) => (p.videoId === videoId ? { ...p, ...patch } : p))
            : [...e.progress, { videoId, watchedSec: 0, attempts: 0, ...patch }];
          return { ...e, progress: next };
        }),
      })),
    recordQuizAttempt: (employeeId, videoId, score, passed) =>
      setState((s) => {
        const emp = s.employees.find((e) => e.id === employeeId);
        const video = s.videos.find((v) => v.id === videoId);
        if (!emp || !video) return s;
        const existing = emp.progress.find((p) => p.videoId === videoId);
        const attempts = (existing?.attempts ?? 0) + 1;
        const lockedOut = !passed && attempts >= 3;
        const nextProgress = existing
          ? emp.progress.map((p) => p.videoId === videoId
              ? { ...p, attempts, quizScore: score, passed: passed || p.passed, completedAt: passed ? new Date().toISOString() : p.completedAt, lockedOut }
              : p)
          : [...emp.progress, { videoId, watchedSec: video.durationSec, attempts, quizScore: score, passed, completedAt: passed ? new Date().toISOString() : undefined, lockedOut }];
        const newNotif: Notification = {
          id: uid("n"),
          type: passed ? "training_passed" : lockedOut ? "training_locked" : "training_failed",
          message: passed
            ? `${emp.name} passed "${video.title}" with ${score}%`
            : lockedOut
              ? `${emp.name} is locked out of "${video.title}" after 3 failed attempts`
              : `${emp.name} failed "${video.title}" (${score}%) — attempt ${attempts}/3`,
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
      }),
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
          // If a fresh insert produced a new uuid, replace the optimistic row.
          if (saved.id !== shift.id) {
            setState((s) => ({
              ...s,
              shifts: s.shifts.map((x) => (x.id === shift.id ? saved : x)),
            }));
          }
        })
        .catch((e) => console.error("[upsertShift]", e));
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
    submitApplication: (data) => {
      // Public path: insert to Supabase. Local state append is skipped because
      // unauthenticated submitters can't read applications back (RLS).
      // For a signed-in owner previewing their own careers page, the row will
      // load via fetchOwnerApplications on next refresh; we also optimistically
      // append when the current user owns the referenced job.
      const withScore = { ...data, aiScore: aiScoreFor(data as JobApplication) };
      const tempId = uid("a");
      insertApplication(withScore)
        .then((app) => {
          setState((s) => {
            // Replace optimistic row if present, else prepend.
            const exists = s.applications.some((a) => a.id === tempId);
            const applications = exists
              ? s.applications.map((a) => (a.id === tempId ? app : a))
              : [app, ...s.applications];
            return { ...s, applications };
          });
        })
        .catch((e) => {
          console.error("[submitApplication] failed", e);
          toast.error("Couldn't submit application. Please try again.");
          setState((s) => ({ ...s, applications: s.applications.filter((a) => a.id !== tempId) }));
        });
      // Optimistic local append so the manager preview sees it right away.
      setState((s) => ({
        ...s,
        applications: [
          { id: tempId, appliedAt: new Date().toISOString(), status: "new", ...withScore } as JobApplication,
          ...s.applications,
        ],
      }));
      return tempId;
    },
    setApplicationStatus: (id, status) => {
      setState((s) => ({ ...s, applications: s.applications.map((a) => (a.id === id ? { ...a, status } : a)) }));
      updateApplication(id, { status }).catch((e) => console.error("[setApplicationStatus]", e));
    },
    scheduleInterview: (id) => {
      const patch = { status: "interview" as ApplicationStatus, interviewSentAt: new Date().toISOString(), archived: false };
      setState((s) => ({
        ...s,
        applications: s.applications.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      }));
      updateApplication(id, patch).catch((e) => console.error("[scheduleInterview]", e));
    },
    setInterviewNotes: (id, notes) => {
      setState((s) => ({
        ...s,
        applications: s.applications.map((a) => (a.id === id ? { ...a, interviewNotes: notes } : a)),
      }));
      updateApplication(id, { interviewNotes: notes }).catch((e) => console.error("[setInterviewNotes]", e));
    },
    declineApplication: (id) => {
      const patch = { status: "rejected" as ApplicationStatus, stage: "rejected" as HiringStage, archived: true };
      setState((s) => ({
        ...s,
        applications: s.applications.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      }));
      updateApplication(id, patch).catch((e) => console.error("[declineApplication]", e));
    },
    reconsiderApplication: (id) => {
      const patch = { status: "new" as ApplicationStatus, stage: "new" as HiringStage, archived: false, hiredEmployeeId: undefined };
      setState((s) => ({
        ...s,
        applications: s.applications.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      }));
      updateApplication(id, patch).catch((e) => console.error("[reconsiderApplication]", e));
    },
    hireApplication: (id, overrides) => {
      let createdId: string | null = null;
      let createdEmployee: Employee | null = null;
      setState((s) => {
        const a = s.applications.find((x) => x.id === id);
        if (!a) return s;
        const empId = newUuid();
        createdId = empId;
        const first = overrides?.firstName ?? a.firstName ?? a.name.split(" ")[0] ?? "";
        const last = overrides?.lastName ?? a.lastName ?? a.name.split(" ").slice(1).join(" ") ?? "";
        const role: Role = overrides?.primaryRole ?? a.role ?? "Server";
        const employee: Employee = {
          id: empId,
          name: `${first} ${last}`.trim() || a.name,
          firstName: first,
          lastName: last,
          email: overrides?.email ?? a.email ?? "",
          phone: overrides?.phone ?? a.phone,
          primaryRole: role,
          approvedRoles: overrides?.approvedRoles ?? [role],
          autoApproveRoles: overrides?.autoApproveRoles ?? [],
          availability: overrides?.availability ?? a.availabilityHours ?? "",
          weeklyAvailability: overrides?.weeklyAvailability ?? a.weeklyAvailability ?? defaultWeeklyAvailability(),
          emergencyContact: overrides?.emergencyContact,
          invitedAt: new Date().toISOString().slice(0, 10),
          onboardingStarted: false,
          personalInfoComplete: false,
          progress: [],
          section: overrides?.section,
          position: overrides?.position,
          seniority: overrides?.seniority ?? 1,
          hiredFromApplicationId: a.id,
          applicationPitch: a.pitch ?? a.note,
          appliedAt: a.appliedAt,
          workExperience: a.workExperience,
        };
        createdEmployee = employee;
        const restaurantName = s.restaurantProfile?.name ?? "86Paper";
        return {
          ...s,
          employees: [...s.employees, employee],
          applications: s.applications.map((x) =>
            x.id === id ? { ...x, status: "hired", stage: "hired", archived: true, hiredEmployeeId: empId } : x,
          ),
          notifications: [
            {
              id: uid("n"),
              type: "training_passed",
              message: `Training automatically assigned to ${employee.name} based on their ${role} position.`,
              employeeId: empId,
              createdAt: new Date().toISOString(),
              read: false,
            },
            {
              id: uid("n"),
              type: "training_passed",
              message: `Welcome to ${restaurantName}! ${employee.name} has been added to 86Paper. Welcome link sent so they can complete their profile and start training.`,
              employeeId: empId,
              createdAt: new Date().toISOString(),
              read: false,
            },
            ...s.notifications,
          ],
        };
      });
      if (createdId) {
        // Persist application → hired
        updateApplication(id, {
          status: "hired",
          stage: "hired",
          archived: true,
          hiredEmployeeId: createdId,
        }).catch((e) => console.error("[hireApplication:updateApp]", e));
        // Persist the new employee row
        const oid = ownerIdRef.current;
        if (oid && createdEmployee) {
          insertEmployee(oid, createdEmployee, { localId: createdId }).catch((e) =>
            console.error("[hireApplication:insertEmployee]", e),
          );
        }
      }
      return createdId;
    },
    approveForInterview: (id, type, slots) => {
      const patch = {
        status: "interview" as ApplicationStatus,
        stage: "video_offered" as HiringStage,
        interviewType: type,
        offeredSlots: slots,
        interviewSentAt: new Date().toISOString(),
        archived: false,
      };
      setState((s) => {
        const label = type === "video" ? "Video interview" : type === "in_person" ? "In-person interview" : "Phone interview";
        return {
          ...s,
          applications: s.applications.map((a) => (a.id === id ? { ...a, ...patch } : a)),
          notifications: [
            {
              id: uid("n"),
              type: "training_passed",
              message: `${label} invite sent — ${slots.length} time slot${slots.length === 1 ? "" : "s"} offered.`,
              createdAt: new Date().toISOString(),
              read: false,
            },
            ...s.notifications,
          ],
        };
      });
      updateApplication(id, patch).catch((e) => console.error("[approveForInterview]", e));
    },
    applicantSelectSlot: (id, slot) => {
      const patch = { stage: "video_scheduled" as HiringStage, selectedSlot: slot };
      setState((s) => {
        const app = s.applications.find((a) => a.id === id);
        return {
          ...s,
          applications: s.applications.map((a) => (a.id === id ? { ...a, ...patch } : a)),
          notifications: [
            {
              id: uid("n"),
              type: "training_passed",
              message: `${app?.firstName ?? app?.name ?? "Applicant"} confirmed ${app?.interviewType === "in_person" ? "in-person" : app?.interviewType === "phone" ? "phone" : "video"} interview for ${new Date(slot).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`,
              createdAt: new Date().toISOString(),
              read: false,
            },
            ...s.notifications,
          ],
        };
      });
      confirmApplicantSlot(id, slot).catch((e) => console.error("[applicantSelectSlot]", e));
    },
    completeInterview: (id, notes) => {
      setState((s) => ({
        ...s,
        applications: s.applications.map((a) =>
          a.id === id ? { ...a, stage: "interviewed", interviewNotes: notes ?? a.interviewNotes } : a,
        ),
      }));
      const patch: Partial<JobApplication> = { stage: "interviewed" };
      if (notes !== undefined) patch.interviewNotes = notes;
      updateApplication(id, patch).catch((e) => console.error("[completeInterview]", e));
    },
    inviteShadowShift: (id, details) => {
      const patch = { stage: "shadow_scheduled" as HiringStage, shadowShift: details };
      setState((s) => ({
        ...s,
        applications: s.applications.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      }));
      updateApplication(id, patch).catch((e) => console.error("[inviteShadowShift]", e));
    },
    reassignApplication: async (id, teamMemberId) => {
      let previous: string | null | undefined;
      setState((s) => ({
        ...s,
        applications: s.applications.map((a) => {
          if (a.id !== id) return a;
          previous = a.assignedTo ?? null;
          return { ...a, assignedTo: teamMemberId };
        }),
      }));
      try {
        await updateApplication(id, { assignedTo: teamMemberId });
      } catch (e) {
        // Revert optimistic update on failure
        setState((s) => ({
          ...s,
          applications: s.applications.map((a) =>
            a.id === id ? { ...a, assignedTo: previous ?? undefined } : a,
          ),
        }));
        console.error("[reassignApplication]", e);
        throw e;
      }
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
    resolveTimeOff: (id, approved, note) => {
      const patch = {
        status: (approved ? "approved" : "denied") as TimeOffStatus,
        resolvedAt: new Date().toISOString(),
        decisionNote: note ?? null,
      };
      setState((s) => ({
        ...s,
        timeOff: s.timeOff.map((t) =>
          t.id === id
            ? { ...t, status: patch.status, resolvedAt: patch.resolvedAt, decisionNote: note }
            : t,
        ),
      }));
      if (/^[0-9a-f-]{36}$/i.test(id)) {
        updateTimeOffRow(id, patch).catch((e) => console.error("[resolveTimeOff]", e));
      }
    },
    setMenu: (m) => setState((s) => ({ ...s, menu: m })),
    setDrinkMenu: (m) => setState((s) => ({ ...s, drinkMenu: m })),
    markMenuGenerated: () =>
      setState((s) => ({ ...s, menu: s.menu ? { ...s.menu, generatedAt: new Date().toISOString() } : s.menu })),
    completeSetup: (profile, food, drink) =>
      setState((s) => ({
        ...s,
        restaurantProfile: { ...profile, completedAt: new Date().toISOString() },
        menu: food ? { ...food, generatedAt: new Date().toISOString() } : s.menu,
        drinkMenu: drink ? { ...drink, generatedAt: new Date().toISOString() } : s.drinkMenu,
        setupCompleted: true,
      })),
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

export function videosForRole(videos: TrainingVideo[], role: Role, customRoles: CustomRole[] = []) {
  const ids = new Set(moduleIdsForRole(role, customRoles));
  return videos.filter((v) => ids.has(v.id));
}

/** Videos assigned across all of an employee's approved roles. */
export function videosForEmployee(videos: TrainingVideo[], employee: { primaryRole: Role; approvedRoles?: Role[] }, customRoles: CustomRole[] = []) {
  const ids = new Set(moduleIdsForEmployee(employee, customRoles));
  return videos.filter((v) => ids.has(v.id));
}

export function aiScoreFor(a: Partial<JobApplication>): AiScore {
  let pts = 0;
  if (a.firstName && a.lastName) pts += 1;
  if (a.email) pts += 1;
  if (a.phone) pts += 1;
  if (a.role) pts += 1;
  const pitchText = (a.pitch ?? a.note ?? "").trim();
  const words = pitchText ? pitchText.split(/\s+/).length : 0;
  if (words >= 100) pts += 3;
  else if (words >= 40) pts += 2;
  else if (words >= 15) pts += 1;
  if ((a.specialTalents ?? "").trim().length > 0) pts += 1;
  // Legacy applications may still carry weeklyAvailability/availabilityDays;
  // give them credit but don't require it from new short-form applications.
  const days = a.weeklyAvailability
    ? DAY_KEYS.filter((d) => a.weeklyAvailability![d]?.kind !== "none").length
    : (a.availabilityDays?.length ?? 0);
  if (days >= 5) pts += 2;
  else if (days >= 3) pts += 1;
  if (pts >= 7) return "Strong";
  if (pts >= 4) return "Average";
  return "Weak";
}

export function onboardingStatus(employee: Employee, videos: TrainingVideo[]) {
  const assigned = videosForEmployee(videos, employee);
  const passed = assigned.filter((v) => employee.progress.find((p) => p.videoId === v.id)?.passed).length;
  const total = assigned.length;
  const fullyOnboarded = employee.personalInfoComplete && total > 0 && passed === total;
  return { passed, total, fullyOnboarded, pct: total ? Math.round((passed / total) * 100) : 0 };
}

/** Pick N random questions from a pool (without replacement). */
export function pickRandomQuestions(pool: QuizQuestion[], n: number): QuizQuestion[] {
  const copy = [...pool];
  const out: QuizQuestion[] = [];
  while (out.length < n && copy.length > 0) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}
