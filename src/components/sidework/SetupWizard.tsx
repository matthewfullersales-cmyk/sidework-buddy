import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Logo } from "@/components/sidework/Logo";
import { useStore, type MenuUpload, type ServiceStyle } from "@/lib/sidework-store";
import { toast } from "sonner";

/* ----------------------------- Types ----------------------------- */

type RestaurantType =
  | "Fine Dining"
  | "Casual Dining"
  | "Fast Casual"
  | "Bar/Nightlife"
  | "Cafe"
  | "Food Truck"
  | "Other";

const FOH_ROLES = [
  "Host", "Busser", "Server Assistant", "Bar Back", "Bartender", "Server",
  "Manager", "Assistant Manager",
] as const;

const BOH_ROLES = [
  "Chef", "Sous Chef", "Line Cook", "Fry Cook", "Saute",
  "Grill", "Pizza", "Garde Manger", "Dishwasher", "Prep",
] as const;

const PAIN_POINTS = [
  "Staff training", "Menu knowledge", "Scheduling", "Paperwork",
  "Side work", "Turnover", "Sick calls", "Shift trading",
] as const;

const RESTAURANT_TYPES: RestaurantType[] = [
  "Fine Dining", "Casual Dining", "Fast Casual", "Bar/Nightlife", "Cafe", "Food Truck", "Other",
];

type Answers = {
  // basics
  name: string;
  cityState: string;
  type: RestaurantType | "";
  // operations
  seats: string;
  daysOpen: string;
  hours: string;
  busiestNight: string;
  avgCovers: string;
  // team
  fohRoles: string[];
  bohRoles: string[];
  minStaff: string;
  scheduler: string;
  // pain
  painPoints: string[];
  // training
  currentTraining: string;
  trainingHeadache: string;
  menuChanges: string;
  // scheduling
  schedAdvance: string;
  tradeRules: string;
  sickProcess: string;
  schedRules: string;
  // hiring
  hiring: string;
  positions: string;
  hiringProcess: string;
  hiringMatters: string;
};

type ChatMsg =
  | { from: "bot"; text: string }
  | { from: "user"; text: string };

const SERVICE_MAP: Record<RestaurantType, ServiceStyle> = {
  "Fine Dining": "Fine Dining",
  "Casual Dining": "Casual Dining",
  "Fast Casual": "Fast Casual",
  "Bar/Nightlife": "Bar and Nightlife",
  Cafe: "Casual Dining",
  "Food Truck": "Fast Casual",
  Other: "Casual Dining",
};

const TOTAL_STEPS = 10;

const EMPTY: Answers = {
  name: "", cityState: "", type: "",
  seats: "", daysOpen: "", hours: "", busiestNight: "", avgCovers: "",
  fohRoles: [], bohRoles: [], minStaff: "", scheduler: "",
  painPoints: [],
  currentTraining: "", trainingHeadache: "", menuChanges: "",
  schedAdvance: "", tradeRules: "", sickProcess: "", schedRules: "",
  hiring: "", positions: "", hiringProcess: "", hiringMatters: "",
};

/* ---------------------------- Component --------------------------- */

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const { completeSetup } = useStore();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [foodMenu, setFoodMenu] = useState<MenuUpload | null>(null);
  const [drinkMenu, setDrinkMenu] = useState<MenuUpload | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      from: "bot",
      text:
        "Welcome to 86Paper! I'm your restaurant intelligence assistant. I'm going to ask you a few questions so I can customize everything specifically for your restaurant. This takes about 5 minutes. Ready?",
    },
  ]);
  const [finishing, setFinishing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const progress = Math.round((step / TOTAL_STEPS) * 100);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, step]);

  const pushUser = (text: string) => setMessages((m) => [...m, { from: "user", text }]);
  const pushBot = (text: string) =>
    setMessages((m) => [...m, { from: "bot", text }]);

  const advance = (userSummary: string, nextBotPrompt: string) => {
    pushUser(userSummary);
    setTimeout(() => {
      if (nextBotPrompt) pushBot(nextBotPrompt);
      setStep((s) => s + 1);
    }, 250);
  };

  const finish = () => {
    setFinishing(true);
    const profileType = (answers.type || "Other") as RestaurantType;
    const serviceStyle = SERVICE_MAP[profileType];
    const concept = `${profileType} · ${answers.cityState || "Location TBD"}`;
    const guestExperience = [
      `${answers.seats || "?"} seats, open ${answers.daysOpen || "—"}, ${answers.hours || "—"}.`,
      `Busiest night ${answers.busiestNight || "—"} (~${answers.avgCovers || "—"} covers).`,
      `FOH: ${answers.fohRoles.join(", ") || "—"}.`,
      `BOH: ${answers.bohRoles.join(", ") || "—"}.`,
      `Min staff/shift: ${answers.minStaff || "—"}. Scheduler: ${answers.scheduler || "—"}.`,
    ].join(" ");
    const nonNegotiables = [
      `Schedules posted ${answers.schedAdvance || "—"} in advance.`,
      `Trade rules: ${answers.tradeRules || "—"}.`,
      `Sick call: ${answers.sickProcess || "—"}.`,
      answers.schedRules ? `Rules: ${answers.schedRules}.` : "",
    ].filter(Boolean).join(" ");
    const pastProblems = [
      `Pain points: ${answers.painPoints.join(", ") || "—"}.`,
      `Current training: ${answers.currentTraining || "—"}.`,
      `Biggest training headache: ${answers.trainingHeadache || "—"}.`,
      `Menu changes: ${answers.menuChanges || "—"}.`,
      answers.hiring ? `Hiring: ${answers.hiring}. Positions: ${answers.positions || "—"}. Process: ${answers.hiringProcess || "—"}. Priorities: ${answers.hiringMatters || "—"}.` : "",
    ].filter(Boolean).join(" ");

    setTimeout(() => {
      completeSetup(
        {
          name: answers.name.trim() || "Your Restaurant",
          concept,
          serviceStyle,
          priority: "Warm hospitality",
          guestExperience,
          nonNegotiables,
          pastProblems,
        },
        foodMenu,
        drinkMenu,
      );
      onComplete();
    }, 2500);
  };

  /* ------------------------- Step composers ------------------------ */

  // Use an effect to inject the bot's next prompt when entering certain steps for the first time.
  // We track which step prompts have been pushed so we don't duplicate.
  const promptedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (promptedRef.current.has(step)) return;
    const prompts: Record<number, string> = {
      2: "Awesome — let's start with the basics. What's the name of your restaurant, what city/state are you in, and what type of restaurant is it?",
      3: "Great. Now tell me about operations — how many seats do you have, which days are you open, your hours, your busiest night, and roughly how many covers you do on that busy night?",
      4: "Let's talk team structure. Which front-of-house roles do you staff, which back-of-house roles, what's your minimum staff per shift, and who actually builds the schedule?",
      5: "What are your biggest day-to-day pain points? Pick all that apply.",
      6: "Now training — how do you train staff today, what's your biggest training headache, and how often does your menu change?",
      7: "Time to make this real. Upload your food menu and your drink menu (PDF or photo) and I'll generate a custom staff knowledge quiz instantly.",
      8: "Let's set scheduling preferences — how far in advance do you post schedules, what are your shift trade rules, how should staff call in sick, and any other scheduling rules?",
      9: "Last topic — hiring. Are you currently hiring? Which positions, what's your process, and what matters most to you in a new hire?",
      10: "All set. Here's everything I've configured for you.",
    };
    if (prompts[step]) {
      const t = setTimeout(() => pushBot(prompts[step]), 200);
      promptedRef.current.add(step);
      return () => clearTimeout(t);
    }
    promptedRef.current.add(step);
  }, [step]);

  /* ---------------------------- Render ----------------------------- */

  if (finishing) return <FinalizingScreen name={answers.name} />;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-br from-background via-background to-primary-soft">
      {/* Header */}
      <div className="border-b border-border bg-background/80 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <Logo />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Step {step} of {TOTAL_STEPS}
          </span>
        </div>
        <div className="mx-auto mt-2 max-w-2xl">
          <Progress value={progress} className="h-1.5" />
        </div>
      </div>

      {/* Chat */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.map((m, i) => (
            <Bubble key={i} from={m.from}>{m.text}</Bubble>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-2xl">
          {step === 1 && (
            <Button size="lg" className="w-full" onClick={() => advance("Ready!", "")}>
              I'm ready — let's go →
            </Button>
          )}

          {step === 2 && (
            <BasicsForm
              value={answers}
              onSubmit={(v) => {
                setAnswers((a) => ({ ...a, ...v }));
                advance(
                  `${v.name} · ${v.cityState} · ${v.type}`,
                  "",
                );
              }}
            />
          )}

          {step === 3 && (
            <OperationsForm
              value={answers}
              onSubmit={(v) => {
                setAnswers((a) => ({ ...a, ...v }));
                advance(
                  `${v.seats} seats · ${v.daysOpen} · ${v.hours} · busiest ${v.busiestNight} (~${v.avgCovers} covers)`,
                  "",
                );
              }}
            />
          )}

          {step === 4 && (
            <TeamForm
              value={answers}
              onSubmit={(v) => {
                setAnswers((a) => ({ ...a, ...v }));
                advance(
                  `FOH: ${v.fohRoles.join(", ") || "—"} | BOH: ${v.bohRoles.join(", ") || "—"} | Min ${v.minStaff}/shift, scheduled by ${v.scheduler}`,
                  "",
                );
              }}
            />
          )}

          {step === 5 && (
            <MultiSelectComposer
              options={[...PAIN_POINTS]}
              selected={answers.painPoints}
              onSubmit={(sel) => {
                setAnswers((a) => ({ ...a, painPoints: sel }));
                advance(sel.length ? sel.join(", ") : "None right now", "");
              }}
            />
          )}

          {step === 6 && (
            <TrainingForm
              value={answers}
              onSubmit={(v) => {
                setAnswers((a) => ({ ...a, ...v }));
                advance(
                  `Trains via "${v.currentTraining}", headache: "${v.trainingHeadache}", menu changes ${v.menuChanges}`,
                  "",
                );
              }}
            />
          )}

          {step === 7 && (
            <MenuUploadComposer
              food={foodMenu}
              drink={drinkMenu}
              onFood={setFoodMenu}
              onDrink={setDrinkMenu}
              onSubmit={() => {
                if (!foodMenu || !drinkMenu) {
                  toast.error("Upload both your food and drink menus to continue.");
                  return;
                }
                advance(
                  `Uploaded ${foodMenu.name} + ${drinkMenu.name} — generating quiz ✨`,
                  "",
                );
              }}
            />
          )}

          {step === 8 && (
            <SchedulingForm
              value={answers}
              onSubmit={(v) => {
                setAnswers((a) => ({ ...a, ...v }));
                advance(
                  `Posted ${v.schedAdvance} ahead · trades: ${v.tradeRules} · sick: ${v.sickProcess}`,
                  "",
                );
              }}
            />
          )}

          {step === 9 && (
            <HiringForm
              value={answers}
              onSubmit={(v) => {
                setAnswers((a) => ({ ...a, ...v }));
                advance(
                  v.hiring.toLowerCase().startsWith("y")
                    ? `Hiring for ${v.positions || "open roles"}`
                    : "Not actively hiring",
                  "",
                );
              }}
            />
          )}

          {step === 10 && (
            <SummaryComposer
              answers={answers}
              foodMenu={foodMenu}
              drinkMenu={drinkMenu}
              onConfirm={finish}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Bubbles ---------------------------- */

function Bubble({ from, children }: { from: "bot" | "user"; children: React.ReactNode }) {
  const isBot = from === "bot";
  return (
    <div className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm sm:text-[15px] ${
          isBot
            ? "rounded-bl-md bg-card text-card-foreground border border-border"
            : "rounded-br-md bg-primary text-primary-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------- Sub-composers -------------------------- */

function BasicsForm({
  value, onSubmit,
}: { value: Answers; onSubmit: (v: Pick<Answers, "name" | "cityState" | "type">) => void }) {
  const [name, setName] = useState(value.name);
  const [cityState, setCityState] = useState(value.cityState);
  const [type, setType] = useState<RestaurantType | "">(value.type);
  return (
    <div className="space-y-3">
      <Input placeholder="Restaurant name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="City, State" value={cityState} onChange={(e) => setCityState(e.target.value)} />
      <ChipGrid options={RESTAURANT_TYPES} value={type} onChange={(v) => setType(v as RestaurantType)} />
      <Button
        size="lg" className="w-full"
        disabled={!name.trim() || !cityState.trim() || !type}
        onClick={() => onSubmit({ name: name.trim(), cityState: cityState.trim(), type: type as RestaurantType })}
      >
        Continue →
      </Button>
    </div>
  );
}

function OperationsForm({
  value, onSubmit,
}: { value: Answers; onSubmit: (v: Pick<Answers, "seats" | "daysOpen" | "hours" | "busiestNight" | "avgCovers">) => void }) {
  const [seats, setSeats] = useState(value.seats);
  const [daysOpen, setDaysOpen] = useState(value.daysOpen);
  const [hours, setHours] = useState(value.hours);
  const [busiestNight, setBusiestNight] = useState(value.busiestNight);
  const [avgCovers, setAvgCovers] = useState(value.avgCovers);
  const ok = seats && daysOpen && hours && busiestNight && avgCovers;
  return (
    <div className="space-y-2.5">
      <Input inputMode="numeric" placeholder="Number of seats (e.g. 80)" value={seats} onChange={(e) => setSeats(e.target.value)} />
      <Input placeholder="Days open (e.g. Tue–Sun)" value={daysOpen} onChange={(e) => setDaysOpen(e.target.value)} />
      <Input placeholder="Hours (e.g. 5pm–11pm)" value={hours} onChange={(e) => setHours(e.target.value)} />
      <Input placeholder="Busiest night (e.g. Saturday)" value={busiestNight} onChange={(e) => setBusiestNight(e.target.value)} />
      <Input inputMode="numeric" placeholder="Avg covers on busy night" value={avgCovers} onChange={(e) => setAvgCovers(e.target.value)} />
      <Button size="lg" className="w-full" disabled={!ok} onClick={() => onSubmit({ seats, daysOpen, hours, busiestNight, avgCovers })}>
        Continue →
      </Button>
    </div>
  );
}

function TeamForm({
  value, onSubmit,
}: { value: Answers; onSubmit: (v: Pick<Answers, "fohRoles" | "bohRoles" | "minStaff" | "scheduler">) => void }) {
  const [foh, setFoh] = useState<string[]>(value.fohRoles);
  const [boh, setBoh] = useState<string[]>(value.bohRoles);
  const [minStaff, setMinStaff] = useState(value.minStaff);
  const [scheduler, setScheduler] = useState(value.scheduler);
  const ok = (foh.length || boh.length) && minStaff && scheduler;
  const recommended =
    value.type === "Fine Dining" ? "Server Assistant" :
    value.type === "Casual Dining" || value.type === "Fast Casual" ? "Busser" :
    null;
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">FOH roles</p>
        {recommended && (
          <p className="mb-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
            For {value.type}, we recommend <strong>{recommended}</strong> on your FOH team. Both Busser and Server Assistant are always available.
          </p>
        )}
        <ChipGrid options={[...FOH_ROLES]} value={foh} multi onChange={(v) => setFoh(v as string[])} />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">BOH roles</p>
        <ChipGrid options={[...BOH_ROLES]} value={boh} multi onChange={(v) => setBoh(v as string[])} />
      </div>
      <Input inputMode="numeric" placeholder="Minimum staff per shift" value={minStaff} onChange={(e) => setMinStaff(e.target.value)} />
      <Input placeholder="Who makes the schedule? (e.g. GM, Owner)" value={scheduler} onChange={(e) => setScheduler(e.target.value)} />
      <Button size="lg" className="w-full" disabled={!ok} onClick={() => onSubmit({ fohRoles: foh, bohRoles: boh, minStaff, scheduler })}>
        Continue →
      </Button>
    </div>
  );
}

function MultiSelectComposer({
  options, selected, onSubmit,
}: { options: string[]; selected: string[]; onSubmit: (sel: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(selected);
  return (
    <div className="space-y-3">
      <ChipGrid options={options} value={sel} multi onChange={(v) => setSel(v as string[])} />
      <Button size="lg" className="w-full" onClick={() => onSubmit(sel)}>Continue →</Button>
    </div>
  );
}

function TrainingForm({
  value, onSubmit,
}: { value: Answers; onSubmit: (v: Pick<Answers, "currentTraining" | "trainingHeadache" | "menuChanges">) => void }) {
  const [a, setA] = useState(value.currentTraining);
  const [b, setB] = useState(value.trainingHeadache);
  const [c, setC] = useState(value.menuChanges);
  const ok = a && b && c;
  return (
    <div className="space-y-2.5">
      <Input placeholder="Current training method (e.g. shadowing)" value={a} onChange={(e) => setA(e.target.value)} />
      <Input placeholder="Biggest training headache" value={b} onChange={(e) => setB(e.target.value)} />
      <Input placeholder="How often menu changes (e.g. seasonal)" value={c} onChange={(e) => setC(e.target.value)} />
      <Button size="lg" className="w-full" disabled={!ok} onClick={() => onSubmit({ currentTraining: a, trainingHeadache: b, menuChanges: c })}>
        Continue →
      </Button>
    </div>
  );
}

function SchedulingForm({
  value, onSubmit,
}: { value: Answers; onSubmit: (v: Pick<Answers, "schedAdvance" | "tradeRules" | "sickProcess" | "schedRules">) => void }) {
  const [a, setA] = useState(value.schedAdvance);
  const [b, setB] = useState(value.tradeRules);
  const [c, setC] = useState(value.sickProcess);
  const [d, setD] = useState(value.schedRules);
  const ok = a && b && c;
  return (
    <div className="space-y-2.5">
      <Input placeholder="How far in advance schedules are posted (e.g. 2 weeks)" value={a} onChange={(e) => setA(e.target.value)} />
      <Input placeholder="Shift trade rules (e.g. manager approval)" value={b} onChange={(e) => setB(e.target.value)} />
      <Input placeholder="Sick call process (e.g. text manager 4h ahead)" value={c} onChange={(e) => setC(e.target.value)} />
      <Input placeholder="Other scheduling rules (optional)" value={d} onChange={(e) => setD(e.target.value)} />
      <Button size="lg" className="w-full" disabled={!ok} onClick={() => onSubmit({ schedAdvance: a, tradeRules: b, sickProcess: c, schedRules: d })}>
        Continue →
      </Button>
    </div>
  );
}

function HiringForm({
  value, onSubmit,
}: { value: Answers; onSubmit: (v: Pick<Answers, "hiring" | "positions" | "hiringProcess" | "hiringMatters">) => void }) {
  const [a, setA] = useState(value.hiring);
  const [b, setB] = useState(value.positions);
  const [c, setC] = useState(value.hiringProcess);
  const [d, setD] = useState(value.hiringMatters);
  return (
    <div className="space-y-2.5">
      <ChipGrid options={["Yes, actively", "Sometimes", "Not right now"]} value={a} onChange={(v) => setA(v as string)} />
      <Input placeholder="Which positions? (optional)" value={b} onChange={(e) => setB(e.target.value)} />
      <Input placeholder="Hiring process (e.g. apply → trail shift)" value={c} onChange={(e) => setC(e.target.value)} />
      <Input placeholder="What matters most in a new hire?" value={d} onChange={(e) => setD(e.target.value)} />
      <Button size="lg" className="w-full" disabled={!a} onClick={() => onSubmit({ hiring: a, positions: b, hiringProcess: c, hiringMatters: d })}>
        Continue →
      </Button>
    </div>
  );
}

function MenuUploadComposer({
  food, drink, onFood, onDrink, onSubmit,
}: {
  food: MenuUpload | null; drink: MenuUpload | null;
  onFood: (m: MenuUpload | null) => void;
  onDrink: (m: MenuUpload | null) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-3">
      <UploadField label="Food menu" value={food} onChange={onFood} />
      <UploadField label="Drink menu" value={drink} onChange={onDrink} />
      <Button size="lg" className="w-full" disabled={!food || !drink} onClick={onSubmit}>
        Generate quiz & continue →
      </Button>
    </div>
  );
}

function SummaryComposer({
  answers, foodMenu, drinkMenu, onConfirm,
}: { answers: Answers; foodMenu: MenuUpload | null; drinkMenu: MenuUpload | null; onConfirm: () => void }) {
  const items = [
    `Scheduling grid set up with your roles (${[...answers.fohRoles, ...answers.bohRoles].length || 0} configured)`,
    `Menu quiz generated from ${foodMenu?.name ?? "food menu"} & ${drinkMenu?.name ?? "drink menu"}`,
    `Menu Knowledge Test gate enabled for ${answers.type || "your restaurant"} staff`,
    `Hiring templates created${answers.positions ? ` for ${answers.positions}` : ""}`,
    "First AI schedule ready",
  ];
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-2 text-sm font-semibold">Here's what I configured for {answers.name || "your restaurant"}:</p>
        <ul className="space-y-1.5">
          {items.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="px-1 text-sm text-muted-foreground">
        Your restaurant intelligence platform is ready. Want to invite your first staff member now?
      </p>
      <Button size="lg" className="w-full" onClick={onConfirm}>
        Yes — take me in →
      </Button>
    </div>
  );
}

/* ------------------------ Reusable bits --------------------------- */

function ChipGrid({
  options, value, multi, onChange,
}: {
  options: string[];
  value: string | string[];
  multi?: boolean;
  onChange: (v: string | string[]) => void;
}) {
  const isSelected = (opt: string) =>
    multi ? (value as string[]).includes(opt) : value === opt;
  const toggle = (opt: string) => {
    if (multi) {
      const arr = value as string[];
      onChange(arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt]);
    } else onChange(opt);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const sel = isSelected(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`min-h-[44px] rounded-full border-2 px-3.5 py-2 text-sm font-medium transition-all ${
              sel
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card hover:border-primary/50 hover:bg-primary-soft"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function UploadField({
  label, value, onChange,
}: { label: string; value: MenuUpload | null; onChange: (m: MenuUpload | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const handleFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isPdf = file.type === "application/pdf" || ext === "pdf";
    const isImage = file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext);
    if (!isPdf && !isImage) return toast.error("Upload a PDF or photo.");
    if (file.size > 25 * 1024 * 1024) return toast.error("File must be under 25MB.");
    const save = (preview?: string) => onChange({
      name: file.name,
      type: file.type || (isPdf ? "application/pdf" : "image/*"),
      sizeKB: Math.max(1, Math.round(file.size / 1024)),
      uploadedAt: new Date().toISOString(),
      preview,
    });
    if (isImage && file.size <= 750 * 1024 && !["heic", "heif"].includes(ext)) {
      const r = new FileReader();
      r.onload = () => save(r.result as string);
      r.onerror = () => save();
      r.readAsDataURL(file);
    } else save();
  };
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {!value ? (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex items-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 p-3.5 text-left transition-colors hover:border-primary hover:bg-primary-soft"
        >
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <div>
            <p className="text-sm font-semibold">Upload {label.toLowerCase()}</p>
            <p className="text-xs text-muted-foreground">PDF or photo · up to 25MB</p>
          </div>
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
          <div className="flex min-w-0 items-center gap-3">
            {value.preview ? (
              <img src={value.preview} alt="" className="h-10 w-10 rounded-md border border-border object-cover" />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-md bg-primary-soft text-primary">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{value.name}</p>
              <p className="text-xs text-muted-foreground">{value.sizeKB} KB</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Remove</Button>
        </div>
      )}
      <input ref={ref} type="file" accept="application/pdf,image/*,.heic,.heif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }} />
    </div>
  );
}

function FinalizingScreen({ name }: { name: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-gradient-hero px-4 text-primary-foreground">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-white/10 backdrop-blur">
          <svg viewBox="0 0 24 24" className="h-10 w-10 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Building your platform for {name || "your restaurant"}…
        </h1>
        <p className="mt-3 text-white/80">
          Customizing schedules, training, and hiring templates from your answers.
        </p>
      </div>
    </div>
  );
}


function CheckIcon({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
