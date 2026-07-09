import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { ROLE_COLORS } from "@/lib/role-colors";
import { supabase } from "@/integrations/supabase/client";
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

export function mealForShiftStart(start: string): Meal {
  if (start < "11:00") return "Breakfast";
  if (start < "16:00") return "Lunch";
  return "Dinner";
}

export function isAvailableFor(av: DayAvailability | undefined, start: string): boolean {
  if (!av || av.kind === "full") return true;
  if (av.kind === "none") return false;
  return av.meals.includes(mealForShiftStart(start));
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
  setRestaurantHours: (h: RestaurantHours) => void;
  updateRestaurantDay: (day: DayKey, patch: Partial<DayHours>) => void;
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
  reassignApplication: (id: string, teamMemberId: string | null) => void;
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
    return x.toISOString().slice(0, 10);
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

  // Owner-scoped Supabase sync for the hiring pipeline (jobs + applications).
  // On sign-in / mount, hydrate from Supabase so postings and applications
  // submitted from anywhere show up for the signed-in owner.
  const ownerIdRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loadForOwner = async (ownerId: string) => {
      try {
        const [postings, apps] = await Promise.all([
          fetchOwnerPostings(ownerId),
          fetchOwnerApplications(ownerId),
        ]);
        if (cancelled) return;
        setState((s) => ({ ...s, jobs: postings, applications: apps }));
      } catch (e) {
        console.error("[hiring-sync] failed to load", e);
      }
    };
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      ownerIdRef.current = uid;
      if (uid) loadForOwner(uid);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user.id ?? null;
      ownerIdRef.current = uid;
      if (event === "SIGNED_IN" && uid) loadForOwner(uid);
      if (event === "SIGNED_OUT") {
        setState((s) => ({ ...s, jobs: [], applications: [] }));
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const uid = (prefix: string) => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;

  const store: Store = {
    ...state,
    setRestaurantHours: (h) => setState((s) => ({ ...s, restaurantHours: h })),
    updateRestaurantDay: (day, patch) =>
      setState((s) => ({ ...s, restaurantHours: { ...s.restaurantHours, [day]: { ...s.restaurantHours[day], ...patch } } })),
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
    clearAllEmployees: () =>
      setState((s) => ({
        ...s,
        employees: [],
        shifts: [],
        trades: [],
        timeOff: [],
      })),
    inviteEmployee: ({ name, email, role }) =>
      setState((s) => {
        const newId = uid("e");
        return {
          ...s,
          employees: [
            ...s.employees,
            {
              id: newId, name, email, primaryRole: role,
              approvedRoles: [role], autoApproveRoles: [], availability: "",
              invitedAt: new Date().toISOString().slice(0, 10),
              onboardingStarted: false, personalInfoComplete: false, progress: [],
            },
          ],
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
        };
      }),
    joinStaff: (data) => {
      const empId = uid("e");
      const fullName = `${data.firstName} ${data.lastName}`.trim();
      setState((s) => {
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
        return {
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
        };
      });
      return empId;
    },
    updateRestaurantSlug: (slug) =>
      setState((s) => ({
        ...s,
        restaurantProfile: s.restaurantProfile ? { ...s.restaurantProfile, slug } : s.restaurantProfile,
      })),
    updateEmployee: (id, patch) =>
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
      }),
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
    upsertShift: (shift) =>
      setState((s) => {
        const exists = s.shifts.some((x) => x.id === shift.id);
        return {
          ...s,
          shifts: exists ? s.shifts.map((x) => (x.id === shift.id ? shift : x)) : [...s.shifts, shift],
        };
      }),
    deleteShift: (id) =>
      setState((s) => ({ ...s, shifts: s.shifts.filter((x) => x.id !== id) })),
    postTrade: (shiftId, note) =>
      setState((s) => {
        const shift = s.shifts.find((x) => x.id === shiftId);
        if (!shift) return s;
        return {
          ...s,
          trades: [
            ...s.trades,
            { id: uid("t"), shiftId, postedBy: shift.employeeId, status: "open", createdAt: new Date().toISOString(), note },
          ],
        };
      }),
    claimTrade: (tradeId, employeeId) =>
      setState((s) => {
        const trade = s.trades.find((t) => t.id === tradeId);
        if (!trade) return s;
        const shift = s.shifts.find((x) => x.id === trade.shiftId);
        if (!shift) return s;
        const claimer = s.employees.find((e) => e.id === employeeId);
        if (!claimer) return s;
        const auto = claimer.autoApproveRoles.includes(shift.role);
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
      }),
    resolveTrade: (tradeId, approved) =>
      setState((s) => {
        const trade = s.trades.find((t) => t.id === tradeId);
        if (!trade || !trade.claimedBy) return s;
        return {
          ...s,
          trades: s.trades.map((t) =>
            t.id === tradeId
              ? { ...t, status: approved ? "approved" : "denied", approvedBy: "owner", resolvedAt: new Date().toISOString() }
              : t,
          ),
          shifts: approved ? s.shifts.map((x) => (x.id === trade.shiftId ? { ...x, employeeId: trade.claimedBy! } : x)) : s.shifts,
        };
      }),
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
      setState((s) => {
        const a = s.applications.find((x) => x.id === id);
        if (!a) return s;
        const empId = uid("e");
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
        const restaurantName = s.restaurantProfile?.name ?? "86Paper";
        // Persist application status → hired
        updateApplication(id, {
          status: "hired",
          stage: "hired",
          archived: true,
          hiredEmployeeId: empId,
        }).catch((e) => console.error("[hireApplication]", e));
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
    reassignApplication: (id, teamMemberId) => {
      setState((s) => ({
        ...s,
        applications: s.applications.map((a) =>
          a.id === id ? { ...a, assignedTo: teamMemberId } : a,
        ),
      }));
      updateApplication(id, { assignedTo: teamMemberId }).catch((e) =>
        console.error("[reassignApplication]", e),
      );
    },
    requestTimeOff: (data) =>
      setState((s) => ({
        ...s,
        timeOff: [
          { id: uid("to"), createdAt: new Date().toISOString(), status: "pending", ...data },
          ...s.timeOff,
        ],
      })),
    resolveTimeOff: (id, approved, note) =>
      setState((s) => ({
        ...s,
        timeOff: s.timeOff.map((t) =>
          t.id === id
            ? { ...t, status: approved ? "approved" : "denied", resolvedAt: new Date().toISOString(), decisionNote: note }
            : t,
        ),
      })),
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
