import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Role = "Server" | "Bartender" | "Kitchen" | "Host";

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
}

export interface TrainingVideo {
  id: string;
  title: string;
  durationSec: number;
  role: Role;
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
  | "Hostess" | "Bartender" | "Server" | "Busser" | "Bar Back"
  | "Manager" | "Assistant Manager" | "Porter"
  | "Chef" | "Sous Chef" | "Line Cook" | "Dishwasher" | "Prep Cook";

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
  name: string;
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
  invitedAt: string;
  onboardingStarted: boolean;
  personalInfoComplete: boolean;
  progress: VideoProgress[];
  position?: Position;
  section?: Section;
  seniority?: number; // 1-5, higher = more experienced
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

export type AvailabilityHours = "Mornings" | "Afternoons" | "Evenings" | "Open availability";

export interface JobApplication {
  id: string;
  jobId: string;
  name: string;
  phone: string;
  availabilityDays: string[];
  availabilityHours: AvailabilityHours;
  note?: string;
  appliedAt: string;
  status: ApplicationStatus;
  verified: boolean;
}

export type TimeOffStatus = "pending" | "approved" | "denied";

export interface TimeOffRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
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
  setupCompleted: boolean;
  notifications: Notification[];
  setMenu: (m: MenuUpload | null) => void;
  setDrinkMenu: (m: MenuUpload | null) => void;
  markMenuGenerated: () => void;
  completeSetup: (profile: Omit<RestaurantProfile, "completedAt">, food: MenuUpload | null, drink: MenuUpload | null) => void;
  resetSetup: () => void;
  markNotificationsRead: () => void;
  inviteEmployee: (data: { name: string; email: string; role: Role }) => void;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
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
  submitApplication: (data: Omit<JobApplication, "id" | "appliedAt" | "status">) => void;
  setApplicationStatus: (id: string, status: ApplicationStatus) => void;
  requestTimeOff: (data: Omit<TimeOffRequest, "id" | "createdAt" | "status">) => void;
  resolveTimeOff: (id: string, approved: boolean, note?: string) => void;
}

const Ctx = createContext<Store | null>(null);

const ROLE_VIDEOS: Record<Role, Omit<TrainingVideo, "id" | "role">[]> = {
  Server: [
    {
      title: "Welcome to the Floor: Service Standards",
      durationSec: 15,
      passingScore: 80,
      quiz: [
        { question: "When should you greet a guest after they're seated?", options: ["Within 5 minutes", "Within 2 minutes & offer water", "When you have time", "Only if they wave"], answerIndex: 1 },
        { question: "How should allergies be handled?", options: ["Ignore them", "Note & alert kitchen immediately", "Tell guest to be careful", "Guess what's safe"], answerIndex: 1 },
        { question: "A guest is unhappy with their dish. What do you do first?", options: ["Argue politely", "Listen, apologize, then offer a fix", "Comp the meal silently", "Ignore it"], answerIndex: 1 },
        { question: "How often should you check back after entrées drop?", options: ["Never", "Within 2 bites", "After 15 minutes", "Only when called"], answerIndex: 1 },
        { question: "Best way to deliver a check?", options: ["Toss on table", "Wait until asked, then promptly", "Drop with appetizers", "Hand directly to host"], answerIndex: 1 },
        { question: "When clearing plates, you should…", options: ["Stack loudly at table", "Clear quietly from the right when all are done", "Leave them all night", "Ask guests to help"], answerIndex: 1 },
        { question: "If a guest looks lost in the menu:", options: ["Walk away", "Offer a recommendation or guidance", "Order for them", "Bring the manager"], answerIndex: 1 },
      ],
    },
    {
      title: "POS System & Order Entry",
      durationSec: 15,
      passingScore: 80,
      quiz: [
        { question: "Modifiers must be entered…", options: ["After food delivered", "Before sending the ticket", "Only if reminded", "Never"], answerIndex: 1 },
        { question: "Why send appetizers and entrées on separate courses?", options: ["Faster bill", "Proper kitchen timing", "Tradition", "Saves paper"], answerIndex: 1 },
        { question: "If POS is down, you should:", options: ["Stop taking orders", "Take handwritten orders & notify manager", "Tell guests to leave", "Guess prices"], answerIndex: 1 },
        { question: "Splitting a check is best done…", options: ["At the end after arguing", "When asked at start of meal", "Never offered", "Only by manager"], answerIndex: 1 },
        { question: "Voiding an item requires:", options: ["Nothing", "Manager approval", "A guest signature", "A receipt"], answerIndex: 1 },
        { question: "Best practice for entering a complex order:", options: ["Memorize all", "Enter immediately at the terminal", "Wait until break", "Tell the kitchen verbally"], answerIndex: 1 },
      ],
    },
    {
      title: "Menu Knowledge & Upselling",
      durationSec: 15,
      passingScore: 80,
      quiz: [
        { question: "Best way to upsell wine?", options: ["Push the most expensive", "Pair to the dish they ordered", "Ignore wine list", "Suggest random"], answerIndex: 1 },
        { question: "If you don't know an ingredient, you should:", options: ["Make it up", "Check with the kitchen", "Skip the question", "Say it's a secret"], answerIndex: 1 },
        { question: "Which is a soft upsell?", options: ["Demanding dessert", "'Our pastry chef's tart is a guest favorite tonight'", "Charging extra silently", "Repeating the menu"], answerIndex: 1 },
        { question: "When describing a dish, focus on:", options: ["Calories", "Ingredients, preparation, and flavor", "Pricing", "Allergens only"], answerIndex: 1 },
        { question: "Suggesting add-ons works best:", options: ["At every step naturally", "Only at end", "Never", "When tipped"], answerIndex: 0 },
        { question: "If a guest asks 'what's good?' say:", options: ["Everything", "A specific personal pick + why", "I don't eat here", "Check Yelp"], answerIndex: 1 },
      ],
    },
  ],
  Bartender: [
    {
      title: "Responsible Alcohol Service",
      durationSec: 15,
      passingScore: 80,
      quiz: [
        { question: "When must you ID a guest?", options: ["Never", "After 10pm only", "Anyone appearing under 30", "Weekends only"], answerIndex: 2 },
        { question: "Visibly intoxicated guest orders another drink. You:", options: ["Serve", "Politely refuse, offer water/food", "Charge double", "Ask coworker to serve"], answerIndex: 1 },
        { question: "Acceptable forms of ID include:", options: ["Costco card", "Government-issued photo ID", "Library card", "School yearbook"], answerIndex: 1 },
        { question: "Signs of intoxication include:", options: ["Quietness", "Slurred speech, unsteady balance", "Ordering food", "Asking for the check"], answerIndex: 1 },
        { question: "If you refuse service, you should:", options: ["Yell at the guest", "Stay calm, notify a manager", "Pour anyway", "Walk off the floor"], answerIndex: 1 },
        { question: "Pregnant guest orders alcohol. You:", options: ["Refuse and shame", "Serve as requested without comment", "Question them", "Call security"], answerIndex: 1 },
      ],
    },
    {
      title: "House Cocktail Specs",
      durationSec: 15,
      passingScore: 80,
      quiz: [
        { question: "Standard single pour is:", options: ["0.5 oz", "1.5 oz", "3 oz", "Whatever feels right"], answerIndex: 1 },
        { question: "Why use a jigger?", options: ["Tradition", "Consistency and cost control", "Looks cool", "It's faster"], answerIndex: 1 },
        { question: "Shaken vs stirred — which is shaken?", options: ["Manhattan", "Daiquiri", "Negroni", "Old Fashioned"], answerIndex: 1 },
        { question: "Fresh citrus should be juiced:", options: ["Weekly", "Daily", "Monthly", "Pre-bottled is fine"], answerIndex: 1 },
        { question: "Garnish on a Martini is traditionally:", options: ["Cherry", "Olive or twist", "Mint", "Pineapple"], answerIndex: 1 },
        { question: "Batching cocktails is helpful for:", options: ["Slow nights", "High-volume service consistency", "Just one drink", "Coffee"], answerIndex: 1 },
      ],
    },
    {
      title: "Wine & Beer Program",
      durationSec: 15,
      passingScore: 80,
      quiz: [
        { question: "Red wine is typically served at:", options: ["32°F", "55–65°F", "85°F", "Boiling"], answerIndex: 1 },
        { question: "First-in-first-out (FIFO) applies to:", options: ["Only food", "Beer kegs and wine inventory too", "Nothing", "Just wine"], answerIndex: 1 },
        { question: "Wine list rotation should occur:", options: ["Never", "Regularly with the chef/sommelier", "Yearly only", "Daily"], answerIndex: 1 },
        { question: "Best draft beer pour leaves:", options: ["No head", "About 1-inch head", "All foam", "Half foam"], answerIndex: 1 },
        { question: "If a guest sends back wine because they don't like it (not corked):", options: ["Refuse", "Replace politely; charge if policy", "Drink it", "Argue"], answerIndex: 1 },
      ],
    },
  ],
  Kitchen: [
    {
      title: "Food Safety & Cross-Contamination",
      durationSec: 15,
      passingScore: 80,
      quiz: [
        { question: "Safe internal temp for chicken (°F):", options: ["120", "145", "165", "200"], answerIndex: 2 },
        { question: "Cutting board color for raw poultry:", options: ["Green", "Red", "Yellow", "Blue"], answerIndex: 2 },
        { question: "Hands must be washed:", options: ["Once a shift", "Between tasks and after contamination", "Only after bathroom", "When dirty visibly"], answerIndex: 1 },
        { question: "Danger zone temperature range (°F):", options: ["0–32", "41–135", "150–200", "200+"], answerIndex: 1 },
        { question: "Raw meat in the walk-in should be stored:", options: ["On top shelf", "Below ready-to-eat foods", "Anywhere", "Next to dairy"], answerIndex: 1 },
        { question: "If you cut yourself on the line:", options: ["Keep working", "Stop, clean, bandage, glove, notify chef", "Hide it", "Use tape only"], answerIndex: 1 },
      ],
    },
    {
      title: "Line Setup & Mise en Place",
      durationSec: 15,
      passingScore: 80,
      quiz: [
        { question: "Mise en place means:", options: ["Cleaning at close", "Everything in its place before service", "A French sauce", "A knife type"], answerIndex: 1 },
        { question: "Best time to prep mise:", options: ["During rush", "Before service starts", "After close", "Never"], answerIndex: 1 },
        { question: "If you 86 an item, you should:", options: ["Keep selling it", "Notify FOH immediately", "Wait an hour", "Tell only one server"], answerIndex: 1 },
        { question: "Ticket times should be tracked:", options: ["Never", "Every ticket for pacing", "Only on busy nights", "By servers only"], answerIndex: 1 },
        { question: "Plate temperature matters because:", options: ["Looks pretty", "Maintains food temp & quality", "Saves dish soap", "Tradition"], answerIndex: 1 },
        { question: "Communication during rush should be:", options: ["Silent", "Clear, loud call-backs", "Whispered", "Texted"], answerIndex: 1 },
      ],
    },
    {
      title: "Closing & Sanitation",
      durationSec: 15,
      passingScore: 80,
      quiz: [
        { question: "Walk-in temperature should be at or below:", options: ["50°F", "41°F", "60°F", "32°F"], answerIndex: 1 },
        { question: "Sanitizer bucket should be changed:", options: ["Weekly", "Every 2–4 hours", "Once a month", "Never"], answerIndex: 1 },
        { question: "Hot oil disposal:", options: ["Down drain", "Cool, then to designated grease bin", "Trash bag hot", "Leave in fryer indefinitely"], answerIndex: 1 },
        { question: "Closing checklist exists to:", options: ["Slow you down", "Ensure consistency and safety", "Punish staff", "Track tips"], answerIndex: 1 },
        { question: "Last person out should:", options: ["Leave doors open", "Verify locks, lights off, alarms set", "Skip the walk-through", "Take the cash"], answerIndex: 1 },
      ],
    },
  ],
  Host: [
    {
      title: "Guest Greeting & Seating Flow",
      durationSec: 15,
      passingScore: 80,
      quiz: [
        { question: "Greet every guest within:", options: ["30 seconds", "2 minutes", "5 minutes", "When you have time"], answerIndex: 0 },
        { question: "When the wait is 45+ minutes you should:", options: ["Hide the truth", "Quote accurately & offer alternatives", "Tell them to leave", "Quote 10 min"], answerIndex: 1 },
        { question: "Rotating sections helps:", options: ["Confuse staff", "Balance server workload & tips", "Slow service", "Annoy guests"], answerIndex: 1 },
        { question: "When seating a guest with accessibility needs:", options: ["Far booth", "Ask their preference, accommodate", "Closest table only", "Skip them"], answerIndex: 1 },
        { question: "If you mis-seat into a closed section:", options: ["Leave them", "Apologize, move them, notify server", "Argue", "Ignore"], answerIndex: 1 },
      ],
    },
  ],
};

function seedVideos(): TrainingVideo[] {
  const out: TrainingVideo[] = [];
  (Object.keys(ROLE_VIDEOS) as Role[]).forEach((role) => {
    ROLE_VIDEOS[role].forEach((v, i) => {
      out.push({ ...v, id: `${role}-${i}`, role });
    });
  });
  return out;
}

function seedEmployees(): Employee[] {
  type Seed = { name: string; position: Position; section: Section; role: Role; seniority: number; availability?: string };
  const seeds: Seed[] = [
    // FOH
    { name: "Maria S", position: "Hostess", section: "FOH", role: "Host", seniority: 4 },
    { name: "Jenny T", position: "Hostess", section: "FOH", role: "Host", seniority: 3 },
    { name: "Cara M", position: "Hostess", section: "FOH", role: "Host", seniority: 2 },
    { name: "Mike R", position: "Bartender", section: "FOH", role: "Bartender", seniority: 5, availability: "Full shifts" },
    { name: "Danny K", position: "Bartender", section: "FOH", role: "Bartender", seniority: 3, availability: "Swing 4hr" },
    { name: "Anthony B", position: "Server", section: "FOH", role: "Server", seniority: 5 },
    { name: "Sofia L", position: "Server", section: "FOH", role: "Server", seniority: 5 },
    { name: "James W", position: "Server", section: "FOH", role: "Server", seniority: 4 },
    { name: "Nina P", position: "Server", section: "FOH", role: "Server", seniority: 4 },
    { name: "Chris T", position: "Server", section: "FOH", role: "Server", seniority: 4 },
    { name: "Amanda R", position: "Server", section: "FOH", role: "Server", seniority: 3 },
    { name: "Joe D", position: "Server", section: "FOH", role: "Server", seniority: 3 },
    { name: "Lisa M", position: "Server", section: "FOH", role: "Server", seniority: 2 },
    { name: "Kevin S", position: "Server", section: "FOH", role: "Server", seniority: 2 },
    { name: "Carlos M", position: "Busser", section: "FOH", role: "Server", seniority: 3 },
    { name: "Pedro R", position: "Busser", section: "FOH", role: "Server", seniority: 2 },
    { name: "Tommy H", position: "Bar Back", section: "FOH", role: "Bartender", seniority: 3 },
    { name: "Rico V", position: "Bar Back", section: "FOH", role: "Bartender", seniority: 2 },
    { name: "Sarah K", position: "Manager", section: "FOH", role: "Server", seniority: 5 },
    { name: "Frank D", position: "Assistant Manager", section: "FOH", role: "Server", seniority: 4 },
    { name: "Luis G", position: "Porter", section: "FOH", role: "Kitchen", seniority: 2 },
    { name: "Mario T", position: "Porter", section: "FOH", role: "Kitchen", seniority: 2 },
    // BOH
    { name: "Marco B", position: "Chef", section: "BOH", role: "Kitchen", seniority: 5 },
    { name: "Tony R", position: "Sous Chef", section: "BOH", role: "Kitchen", seniority: 5 },
    { name: "Alex P", position: "Line Cook", section: "BOH", role: "Kitchen", seniority: 4 },
    { name: "Ramon S", position: "Line Cook", section: "BOH", role: "Kitchen", seniority: 4 },
    { name: "Diego M", position: "Line Cook", section: "BOH", role: "Kitchen", seniority: 3 },
    { name: "Chris L", position: "Line Cook", section: "BOH", role: "Kitchen", seniority: 3 },
    { name: "Pat O", position: "Line Cook", section: "BOH", role: "Kitchen", seniority: 2 },
    { name: "Juan C", position: "Dishwasher", section: "BOH", role: "Kitchen", seniority: 3 },
    { name: "Mike T", position: "Dishwasher", section: "BOH", role: "Kitchen", seniority: 2 },
    { name: "Sam R", position: "Dishwasher", section: "BOH", role: "Kitchen", seniority: 2 },
    { name: "Ana G", position: "Prep Cook", section: "BOH", role: "Kitchen", seniority: 4 },
    { name: "Luis M", position: "Prep Cook", section: "BOH", role: "Kitchen", seniority: 3 },
  ];
  return seeds.map((s, i) => ({
    id: `e${i + 1}`,
    name: s.name,
    email: `${s.name.toLowerCase().replace(/[^a-z]/g, "")}@perlos.com`,
    primaryRole: s.role,
    approvedRoles: [s.role],
    autoApproveRoles: s.seniority >= 4 ? [s.role] : [],
    availability: s.availability ?? "Flexible",
    invitedAt: "2026-05-01",
    onboardingStarted: true,
    personalInfoComplete: true,
    progress: [],
    position: s.position,
    section: s.section,
    seniority: s.seniority,
  }));
}

function seedShifts(): Shift[] {
  return [];
}

function seedTrades(): Trade[] {
  return [];
}

function seedJobs(): JobPosting[] {
  return [
    {
      id: "j1", title: "Experienced Line Cook", role: "Kitchen", type: "Full-time",
      payRange: "$22–$28/hr",
      description: "We're hiring a line cook for our busy dinner service. Mediterranean menu, scratch kitchen, fast pace.",
      postedAt: new Date().toISOString(), open: true,
    },
    {
      id: "j2", title: "Weekend Server", role: "Server", type: "Part-time",
      payRange: "$18/hr + tips",
      description: "Friday and Saturday evenings. Wine knowledge a plus.",
      postedAt: new Date().toISOString(), open: true,
    },
  ];
}

function seedApplications(): JobApplication[] {
  return [
    {
      id: "a1", jobId: "j1", name: "Jordan Rivera",
      phone: "555-204-3311",
      availabilityDays: ["Tue", "Wed", "Thu", "Fri", "Sat"],
      availabilityHours: "Open availability",
      note: "Loved your menu when I dined last month.",
      appliedAt: new Date().toISOString(), status: "new", verified: true,
    },
  ];
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

const STORAGE_KEY = "sidework-store-v4";

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
    setupCompleted: false,
    notifications: [] as Notification[],
  }));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setState((s) => ({ ...s, ...parsed }));
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const uid = (prefix: string) => `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;

  const store: Store = {
    ...state,
    setCurrentUser: (u) => setState((s) => ({ ...s, currentUser: u })),
    inviteEmployee: ({ name, email, role }) =>
      setState((s) => ({
        ...s,
        employees: [
          ...s.employees,
          {
            id: uid("e"), name, email, primaryRole: role,
            approvedRoles: [role], autoApproveRoles: [], availability: "",
            invitedAt: new Date().toISOString().slice(0, 10),
            onboardingStarted: false, personalInfoComplete: false, progress: [],
          },
        ],
      })),
    updateEmployee: (id, patch) =>
      setState((s) => ({ ...s, employees: s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
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
    postJob: (data) =>
      setState((s) => ({
        ...s,
        jobs: [{ id: uid("j"), postedAt: new Date().toISOString(), open: true, ...data }, ...s.jobs],
      })),
    toggleJobOpen: (id) =>
      setState((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === id ? { ...j, open: !j.open } : j)) })),
    removeJob: (id) =>
      setState((s) => ({ ...s, jobs: s.jobs.filter((j) => j.id !== id) })),
    submitApplication: (data) =>
      setState((s) => ({
        ...s,
        applications: [
          { id: uid("a"), appliedAt: new Date().toISOString(), status: "new", ...data },
          ...s.applications,
        ],
      })),
    setApplicationStatus: (id, status) =>
      setState((s) => ({ ...s, applications: s.applications.map((a) => (a.id === id ? { ...a, status } : a)) })),
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

export function videosForRole(videos: TrainingVideo[], role: Role) {
  return videos.filter((v) => v.role === role);
}

export function onboardingStatus(employee: Employee, videos: TrainingVideo[]) {
  const assigned = videosForRole(videos, employee.primaryRole);
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
