import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Role = "Server" | "Bartender" | "Kitchen" | "Host";

export interface TrainingVideo {
  id: string;
  title: string;
  durationSec: number;
  role: Role;
  quiz: { question: string; options: string[]; answerIndex: number }[];
  passingScore: number;
}

export interface VideoProgress {
  videoId: string;
  watchedSec: number;
  completedAt?: string;
  quizScore?: number;
  passed?: boolean;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  primaryRole: Role;
  approvedRoles: Role[];
  autoApproveRoles: Role[];
  availability: string;
  invitedAt: string;
  onboardingStarted: boolean;
  personalInfoComplete: boolean;
  progress: VideoProgress[];
}

export interface Shift {
  id: string;
  employeeId: string;
  role: Role;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string;
}

export type TradeStatus = "open" | "pending_approval" | "approved" | "denied" | "cancelled";

export interface Trade {
  id: string;
  shiftId: string;
  postedBy: string; // employee id
  claimedBy?: string;
  status: TradeStatus;
  createdAt: string;
  resolvedAt?: string;
  approvedBy?: string;
  autoApproved?: boolean;
  note?: string;
}

interface Store {
  currentUser: { type: "manager"; id: "owner" } | { type: "employee"; id: string };
  setCurrentUser: (u: Store["currentUser"]) => void;
  employees: Employee[];
  videos: TrainingVideo[];
  shifts: Shift[];
  trades: Trade[];
  inviteEmployee: (data: { name: string; email: string; role: Role }) => void;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  recordVideoProgress: (employeeId: string, videoId: string, patch: Partial<VideoProgress>) => void;
  postTrade: (shiftId: string, note?: string) => void;
  claimTrade: (tradeId: string, employeeId: string) => void;
  resolveTrade: (tradeId: string, approved: boolean) => void;
}

const Ctx = createContext<Store | null>(null);

const ROLE_VIDEOS: Record<Role, Omit<TrainingVideo, "id" | "role">[]> = {
  Server: [
    {
      title: "Welcome to the Floor: Service Standards",
      durationSec: 20,
      passingScore: 80,
      quiz: [
        { question: "What is the first thing you do when a guest is seated?", options: ["Take their order", "Greet within 2 minutes & offer water", "Hand them a check", "Walk away"], answerIndex: 1 },
        { question: "How should allergies be handled?", options: ["Ignore them", "Note them & alert kitchen immediately", "Tell the guest to be careful", "Guess what's safe"], answerIndex: 1 },
      ],
    },
    {
      title: "POS System & Order Entry",
      durationSec: 25,
      passingScore: 80,
      quiz: [
        { question: "Modifiers must be entered…", options: ["After the food is delivered", "Before sending the ticket", "Only if guest reminds you", "Never"], answerIndex: 1 },
      ],
    },
  ],
  Bartender: [
    {
      title: "Responsible Alcohol Service",
      durationSec: 20,
      passingScore: 90,
      quiz: [
        { question: "When must you ID a guest?", options: ["Never", "Only after 10pm", "Anyone who appears under 30", "Only on weekends"], answerIndex: 2 },
        { question: "A visibly intoxicated guest orders another drink. You:", options: ["Serve it", "Politely refuse and offer water/food", "Charge double", "Ask a coworker to serve them"], answerIndex: 1 },
      ],
    },
    {
      title: "House Cocktail Specs",
      durationSec: 25,
      passingScore: 80,
      quiz: [
        { question: "Standard pour for a single is:", options: ["0.5 oz", "1.5 oz", "3 oz", "Whatever feels right"], answerIndex: 1 },
      ],
    },
  ],
  Kitchen: [
    {
      title: "Food Safety & Cross-Contamination",
      durationSec: 22,
      passingScore: 90,
      quiz: [
        { question: "Safe internal temp for chicken (°F):", options: ["120", "145", "165", "200"], answerIndex: 2 },
        { question: "Color of cutting board for raw poultry:", options: ["Green", "Red", "Yellow", "Blue"], answerIndex: 2 },
      ],
    },
    {
      title: "Line Setup & Mise en Place",
      durationSec: 20,
      passingScore: 80,
      quiz: [
        { question: "Mise en place means:", options: ["Cleaning at close", "Everything in its place before service", "A French sauce", "A type of knife"], answerIndex: 1 },
      ],
    },
  ],
  Host: [
    {
      title: "Guest Greeting & Seating Flow",
      durationSec: 18,
      passingScore: 80,
      quiz: [
        { question: "Greet every guest within:", options: ["30 seconds", "2 minutes", "5 minutes", "When you have time"], answerIndex: 0 },
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
  return [
    {
      id: "e1", name: "Maya Chen", email: "maya@bistro.com", primaryRole: "Server",
      approvedRoles: ["Server", "Host"], autoApproveRoles: ["Host"],
      availability: "Mon-Fri evenings", invitedAt: "2026-05-20",
      onboardingStarted: true, personalInfoComplete: true,
      progress: [
        { videoId: "Server-0", watchedSec: 20, completedAt: "2026-05-21", quizScore: 100, passed: true },
        { videoId: "Server-1", watchedSec: 25, completedAt: "2026-05-22", quizScore: 100, passed: true },
      ],
    },
    {
      id: "e2", name: "Diego Alvarez", email: "diego@bistro.com", primaryRole: "Bartender",
      approvedRoles: ["Bartender"], autoApproveRoles: [],
      availability: "Wed-Sun nights", invitedAt: "2026-05-28",
      onboardingStarted: true, personalInfoComplete: true,
      progress: [
        { videoId: "Bartender-0", watchedSec: 20, completedAt: "2026-05-29", quizScore: 100, passed: true },
      ],
    },
    {
      id: "e3", name: "Priya Patel", email: "priya@bistro.com", primaryRole: "Kitchen",
      approvedRoles: ["Kitchen"], autoApproveRoles: [],
      availability: "Weekends", invitedAt: "2026-06-02",
      onboardingStarted: false, personalInfoComplete: false,
      progress: [],
    },
  ];
}

function seedShifts(): Shift[] {
  const today = new Date();
  const d = (offset: number) => {
    const x = new Date(today); x.setDate(today.getDate() + offset);
    return x.toISOString().slice(0, 10);
  };
  return [
    { id: "s1", employeeId: "e1", role: "Server", date: d(1), start: "17:00", end: "23:00" },
    { id: "s2", employeeId: "e1", role: "Server", date: d(2), start: "17:00", end: "23:00" },
    { id: "s3", employeeId: "e2", role: "Bartender", date: d(1), start: "18:00", end: "00:00" },
    { id: "s4", employeeId: "e2", role: "Bartender", date: d(3), start: "18:00", end: "00:00" },
    { id: "s5", employeeId: "e3", role: "Kitchen", date: d(2), start: "15:00", end: "22:00" },
  ];
}

function seedTrades(): Trade[] {
  return [
    { id: "t1", shiftId: "s2", postedBy: "e1", status: "open", createdAt: new Date().toISOString() },
  ];
}

const STORAGE_KEY = "sidework-store-v1";

export function SideworkProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState(() => ({
    currentUser: { type: "manager", id: "owner" } as Store["currentUser"],
    employees: seedEmployees(),
    videos: seedVideos(),
    shifts: seedShifts(),
    trades: seedTrades(),
  }));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const store: Store = {
    ...state,
    setCurrentUser: (u) => setState((s) => ({ ...s, currentUser: u })),
    inviteEmployee: ({ name, email, role }) =>
      setState((s) => ({
        ...s,
        employees: [
          ...s.employees,
          {
            id: `e${Date.now()}`, name, email, primaryRole: role,
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
            : [...e.progress, { videoId, watchedSec: 0, ...patch }];
          return { ...e, progress: next };
        }),
      })),
    postTrade: (shiftId, note) =>
      setState((s) => {
        const shift = s.shifts.find((x) => x.id === shiftId);
        if (!shift) return s;
        return {
          ...s,
          trades: [
            ...s.trades,
            { id: `t${Date.now()}`, shiftId, postedBy: shift.employeeId, status: "open", createdAt: new Date().toISOString(), note },
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
                  ...t,
                  claimedBy: employeeId,
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
