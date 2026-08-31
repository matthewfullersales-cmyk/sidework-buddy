import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Logo } from "@/components/sidework/Logo";
import {
  useStore,
  type CustomRole,
  type Role,
  type ServiceStyle,
} from "@/lib/sidework-store";
import {
  FOH_ROLES_ORDERED,
  BOH_ROLES_ORDERED,
  ROLES_ORDERED,
  nextCustomColor,
} from "@/lib/role-colors";
import { PhoneInput } from "@/components/ui/phone-input";
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

const RESTAURANT_TYPES: RestaurantType[] = [
  "Fine Dining", "Casual Dining", "Fast Casual", "Bar/Nightlife", "Cafe", "Food Truck", "Other",
];

type Answers = {
  // basics
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  type: RestaurantType | "";
  // team
  fohRoles: string[];
  bohRoles: string[];
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

const TOTAL_STEPS = 4;

const EMPTY: Answers = {
  name: "", street: "", city: "", state: "", zip: "", phone: "", email: "",
  website: "", instagram: "", facebook: "", tiktok: "", type: "",
  fohRoles: [], bohRoles: [],
};

/* ---------------------------- Component --------------------------- */

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const { completeSetup, setBusinessInfo, setDisabledRoles, customRoles, addCustomRole } = useStore();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      from: "bot",
      text:
        "Welcome to 86Paper! Just a few quick questions so I can set up your restaurant profile and roles. This takes about a minute. Ready?",
    },
  ]);
  const [finishing, setFinishing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const progress = Math.round((step / TOTAL_STEPS) * 100);

  const wizardRoles = [...answers.fohRoles, ...answers.bohRoles] as Role[];


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
    const cityState = [answers.city, answers.state].filter(Boolean).join(", ");
    const concept = `${profileType} · ${cityState || "Location TBD"}`;

    const t = (v: string) => {
      const x = v.trim();
      return x === "" ? undefined : x;
    };
    setBusinessInfo({
      street: t(answers.street),
      city: t(answers.city),
      state: t(answers.state),
      zip: t(answers.zip),
      phone: t(answers.phone),
      email: t(answers.email),
      website: t(answers.website),
      instagram: t(answers.instagram),
      facebook: t(answers.facebook),
      tiktok: t(answers.tiktok),
    });

    setTimeout(() => {
      completeSetup(
        {
          name: answers.name.trim() || "Your Restaurant",
          concept,
          serviceStyle,
          priority: "Warm hospitality",
          guestExperience: "",
          nonNegotiables: "",
          pastProblems: "",
        },
        null,
        null,
        null,
      );
      // Persist the EXCEPTIONS only: built-in roles the owner did not pick.
      // Custom roles the owner typed in are already in the store.
      const picked = new Set(wizardRoles);
      setDisabledRoles(ROLES_ORDERED.filter((r) => !picked.has(r)));
      onComplete();
    }, 2000);
  };

  /* ------------------------- Step composers ------------------------ */

  // Use an effect to inject the bot's next prompt when entering certain steps for the first time.
  // We track which step prompts have been pushed so we don't duplicate.
  const promptedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (promptedRef.current.has(step)) return;
    const prompts: Record<number, string> = {
      2: "Awesome — let's start with the basics. Tell me your restaurant's name and type, plus the address and contact info applicants and new hires will see on your career page and hire invites.",
      3: "Now your team. Which front-of-house and back-of-house roles do you staff? You can add your own role too, and change all of this later in Settings.",
      4: "That's everything. Here's what's saved.",
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
                advance(`${v.name} · ${[v.city, v.state].filter(Boolean).join(", ")} · ${v.type}`, "");
              }}
            />
          )}

          {step === 3 && (
            <TeamForm
              value={answers}
              customRoles={customRoles}
              onAddCustomRole={addCustomRole}
              onSubmit={(v) => {
                setAnswers((a) => ({ ...a, ...v }));
                advance(
                  `FOH: ${v.fohRoles.join(", ") || "—"} | BOH: ${v.bohRoles.join(", ") || "—"}`,
                  "",
                );
              }}
            />
          )}

          {step === 4 && (
            <SummaryComposer
              answers={answers}
              roles={wizardRoles}
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
}: {
  value: Answers;
  onSubmit: (v: Omit<Answers, "fohRoles" | "bohRoles">) => void;
}) {
  const [f, setF] = useState(value);
  const set = (patch: Partial<Answers>) => setF((p) => ({ ...p, ...patch }));
  const ok = Boolean(f.name.trim() && f.type);
  return (
    <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
      <Input placeholder="Restaurant name" value={f.name} onChange={(e) => set({ name: e.target.value })} />
      <ChipGrid options={RESTAURANT_TYPES} value={f.type} onChange={(v) => set({ type: v as RestaurantType })} />
      <Input placeholder="Street address" value={f.street} onChange={(e) => set({ street: e.target.value })} aria-label="Street address" />
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="City" value={f.city} onChange={(e) => set({ city: e.target.value })} aria-label="City" />
        <Input placeholder="State" value={f.state} onChange={(e) => set({ state: e.target.value })} aria-label="State" />
        <Input placeholder="ZIP" value={f.zip} onChange={(e) => set({ zip: e.target.value })} aria-label="ZIP" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PhoneInput placeholder="(555) 555-5555" value={f.phone} onChange={(v) => set({ phone: v })} />
        <Input type="email" placeholder="hello@your-restaurant.com" value={f.email} onChange={(e) => set({ email: e.target.value })} aria-label="Business email" />
      </div>
      <Input type="url" placeholder="https://your-restaurant.com (optional)" value={f.website} onChange={(e) => set({ website: e.target.value })} aria-label="Website" />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Input placeholder="Instagram (e.g. @your_spot)" value={f.instagram} onChange={(e) => set({ instagram: e.target.value })} aria-label="Instagram" />
        <Input placeholder="Facebook (page URL or handle)" value={f.facebook} onChange={(e) => set({ facebook: e.target.value })} aria-label="Facebook" />
        <Input placeholder="TikTok (e.g. @your_spot)" value={f.tiktok} onChange={(e) => set({ tiktok: e.target.value })} aria-label="TikTok" />
      </div>
      <Button size="lg" className="w-full" disabled={!ok} onClick={() => onSubmit({ ...f, name: f.name.trim(), type: f.type })}>
        Continue →
      </Button>
    </div>
  );
}

function TeamForm({
  value, onSubmit, customRoles, onAddCustomRole,
}: {
  value: Answers;
  onSubmit: (v: Pick<Answers, "fohRoles" | "bohRoles">) => void;
  customRoles: CustomRole[];
  onAddCustomRole: (role: CustomRole) => void;
}) {
  const [foh, setFoh] = useState<string[]>(value.fohRoles);
  const [boh, setBoh] = useState<string[]>(value.bohRoles);
  const [newRole, setNewRole] = useState("");
  const [newSection, setNewSection] = useState<"FOH" | "BOH">("FOH");
  const ok = foh.length > 0 || boh.length > 0;
  const fohOptions = [
    ...FOH_ROLES_ORDERED,
    ...customRoles.filter((c) => c.section === "FOH").map((c) => c.name),
  ];
  const bohOptions = [
    ...BOH_ROLES_ORDERED,
    ...customRoles.filter((c) => c.section === "BOH").map((c) => c.name),
  ];

  const addRole = () => {
    const name = newRole.trim();
    if (!name) return;
    const taken = [...ROLES_ORDERED, ...customRoles.map((c) => c.name)].some(
      (r) => r.toLowerCase() === name.toLowerCase(),
    );
    if (taken) {
      toast.error(`"${name}" is already one of your roles.`);
      return;
    }
    onAddCustomRole({ name, section: newSection, color: nextCustomColor(customRoles) });
    if (newSection === "FOH") setFoh((v) => [...v, name]);
    else setBoh((v) => [...v, name]);
    setNewRole("");
  };
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
        <ChipGrid options={fohOptions} value={foh} multi onChange={(v) => setFoh(v as string[])} />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">BOH roles</p>
        <ChipGrid options={bohOptions} value={boh} multi onChange={(v) => setBoh(v as string[])} />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Type in your own role
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. Sommelier"
            aria-label="New role name"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRole(); } }}
          />
          <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
            {(["FOH", "BOH"] as const).map((sec) => (
              <button
                key={sec}
                type="button"
                aria-pressed={newSection === sec}
                onClick={() => setNewSection(sec)}
                className={`px-3 text-xs font-semibold ${newSection === sec ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
              >
                {sec}
              </button>
            ))}
          </div>
          <Button type="button" variant="secondary" onClick={addRole} disabled={!newRole.trim()}>
            Add
          </Button>
        </div>
      </div>
      <Button size="lg" className="w-full" disabled={!ok} onClick={() => onSubmit({ fohRoles: foh, bohRoles: boh })}>
        Continue →
      </Button>
    </div>
  );
}

function SummaryComposer({
  answers, roles, onConfirm,
}: {
  answers: Answers;
  roles: Role[];
  onConfirm: () => void;
}) {
  const items = [
    `Restaurant profile saved — ${answers.name || "your restaurant"}${[answers.city, answers.state].filter(Boolean).join(", ") ? `, ${[answers.city, answers.state].filter(Boolean).join(", ")}` : ""}${answers.type ? ` (${answers.type})` : ""}`,
    `${roles.length} role${roles.length === 1 ? "" : "s"} configured${roles.length ? `: ${roles.join(", ")}` : ""}`,
  ];
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="mb-2 text-sm font-semibold">Here's what's saved for {answers.name || "your restaurant"}:</p>
        <ul className="space-y-1.5">
          {items.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
      <Button size="lg" className="w-full" onClick={onConfirm}>
        Take me in →
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
          Setting up {name || "your restaurant"}…
        </h1>
        <p className="mt-3 text-white/80">
          Saving your restaurant profile and roles.
        </p>
      </div>
    </div>
  );
}




function CheckIcon({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
