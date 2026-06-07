import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/sidework/AppShell";
import { SetupWizard } from "@/components/sidework/SetupWizard";
import { MenuQuizGenerator } from "@/components/sidework/MenuQuizGenerator";
import { ScheduleSection } from "@/components/sidework/ScheduleSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { onboardingStatus, useStore, type Role, type ApplicationStatus, type Employee, type Relationship, DAY_KEYS, type JobApplication, type HiringStage, type ShadowShiftDetails, type InterviewType, getHiringStage } from "@/lib/sidework-store";
import { roleStyle } from "@/lib/role-colors";
import { AvailabilityEditor, RestaurantHoursEditor } from "@/components/sidework/AvailabilityEditor";
import { StaffJoinBanner, FullscreenQrDialog, StaffOnboardingCard } from "@/components/sidework/StaffOnboarding";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { slugify } from "@/lib/slug";
import { toast } from "sonner";
import { ChevronDown, Check } from "lucide-react";

type TeamSortKey =
  | "firstNameAsc" | "firstNameDesc"
  | "lastNameAsc" | "lastNameDesc"
  | "positionAsc"
  | "onboardingDesc" | "onboardingAsc";

const SORT_OPTIONS: { key: TeamSortKey; label: string }[] = [
  { key: "firstNameAsc", label: "First Name (A-Z)" },
  { key: "firstNameDesc", label: "First Name (Z-A)" },
  { key: "lastNameAsc", label: "Last Name (A-Z)" },
  { key: "lastNameDesc", label: "Last Name (Z-A)" },
  { key: "positionAsc", label: "Position (A-Z)" },
  { key: "onboardingDesc", label: "Onboarding Progress (High to Low)" },
  { key: "onboardingAsc", label: "Onboarding Progress (Low to High)" },
];

const TEAM_SORT_STORAGE_KEY = "sidework.team.sort";

const FOH_ROLES: Role[] = ["Host", "Busser", "Server Assistant", "Bar Back", "Bartender", "Server", "Manager", "Assistant Manager"];
const BOH_ROLES: Role[] = ["Chef", "Sous Chef", "Line Cook", "Fry Cook", "Saute", "Grill", "Pizza", "Garde Manger", "Dishwasher", "Prep"];
const ROLES: Role[] = [...FOH_ROLES, ...BOH_ROLES];

const nav = [
  { to: "/manager", label: "Dashboard", icon: <IconHome /> },
  { to: "/manager/team", label: "Team", icon: <IconUsers /> },
  { to: "/manager/schedule", label: "Schedule", icon: <IconCal /> },
  { to: "/manager/trades", label: "Trades", icon: <IconSwap /> },
];

export const Route = createFileRoute("/manager")({
  ssr: false,
  head: () => ({ meta: [{ title: "Manager Dashboard — Sidework" }] }),
  component: ManagerPage,
});

function ActionTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    timerRef.current = setTimeout(() => setOpen(true), 500);
  };

  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    hideTimerRef.current = setTimeout(() => setOpen(false), 1500);
  };

  const handleTouchMove = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return (
    <div className="relative inline-block" onContextMenu={(e) => e.preventDefault()}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchMove}
            onContextMenu={(e) => e.preventDefault()}
          >
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] bg-slate-900 text-white border-slate-800 text-xs text-center">
          {text}
        </TooltipContent>
      </Tooltip>
      {open && (
        <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 -translate-x-1/2 rounded-md bg-slate-900 px-3 py-2 text-xs text-white shadow-lg animate-in fade-in-0 zoom-in-95 max-w-[220px] whitespace-normal text-center leading-relaxed">
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
}

function ManagerPage() {
  const { setupCompleted, restaurantProfile, resetSetup } = useStore();
  const [tab, setTab] = useState("dashboard");
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  if (showSetupWizard) {
    return (
      <SetupWizard
        onComplete={() => {
          setShowSetupWizard(false);
          setTab("training");
        }}
      />
    );
  }

  return (
    <AppShell nav={[{ to: "/manager", label: "Dashboard", icon: <IconHome /> }]}>
      <PageHeader
        title={restaurantProfile?.name ? `${restaurantProfile.name} — Dashboard` : "Manager Dashboard"}
        subtitle="Onboarding, schedule, and trades at a glance."
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (setupCompleted) {
                if (window.confirm("Redo restaurant setup? This will reset your profile.")) {
                  resetSetup();
                  setShowSetupWizard(true);
                }
              } else {
                setShowSetupWizard(true);
              }
            }}
          >
            {setupCompleted ? "Restaurant Setup" : "Complete your setup"}
          </Button>
        }
      />
      {!setupCompleted && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="font-semibold text-primary">Your restaurant setup is incomplete</p>
              <p className="text-sm text-muted-foreground">Finish a few questions so Sidework can build your custom training program.</p>
            </div>
            <Button size="sm" onClick={() => setShowSetupWizard(true)}>Complete your setup</Button>
          </CardContent>
        </Card>
      )}
      <ManagerTabs tab={tab} setTab={setTab} onOpenSetup={() => setShowSetupWizard(true)} />
    </AppShell>
  );
}

function ManagerTabs({ tab, setTab, onOpenSetup }: { tab: string; setTab: (v: string) => void; onOpenSetup: () => void }) {
  const { applications } = useStore();
  const newAppsCount = applications.filter((a) => !a.archived && getHiringStage(a) === "new").length;
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 md:grid-cols-8">
        <TabsTrigger value="dashboard">Overview</TabsTrigger>
        <TabsTrigger value="training">Training</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
        <TabsTrigger value="trades">Trades</TabsTrigger>
        <TabsTrigger value="jobs" className="relative">
          Jobs
          {newAppsCount > 0 && (
            <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-[10px] font-bold text-warning-foreground">
              {newAppsCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="timeoff">Time Off</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard"><OverviewTab /></TabsContent>
      <TabsContent value="training"><TrainingProgramTab /></TabsContent>
      <TabsContent value="team"><TeamTab /></TabsContent>
      <TabsContent value="schedule"><ScheduleTab /></TabsContent>
      <TabsContent value="trades"><TradesTab /></TabsContent>
      <TabsContent value="jobs"><JobsTab /></TabsContent>
      <TabsContent value="timeoff"><TimeOffTab /></TabsContent>
      <TabsContent value="settings"><SettingsTab onOpenSetup={onOpenSetup} /></TabsContent>
    </Tabs>
  );
}


function OverviewTab() {
  const { employees, videos, trades, shifts, applications, timeOff } = useStore();
  const stats = useMemo(() => {
    const onboarded = employees.filter((e) => onboardingStatus(e, videos).fullyOnboarded).length;
    const pending = trades.filter((t) => t.status === "pending_approval").length;
    const newApps = applications.filter((a) => a.status === "new").length;
    const pendingTO = timeOff.filter((t) => t.status === "pending").length;
    return { onboarded, total: employees.length, pending, newApps, pendingTO, shifts: shifts.length };
  }, [employees, videos, trades, shifts, applications, timeOff]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Team" value={`${stats.onboarded}/${stats.total}`} hint="Fully onboarded" />
        <Stat label="Pending trades" value={stats.pending} hint="Need your approval" tone={stats.pending > 0 ? "warn" : undefined} />
        <Stat label="New applications" value={stats.newApps} hint="Awaiting review" tone={stats.newApps > 0 ? "warn" : undefined} />
        <Stat label="Time off pending" value={stats.pendingTO} hint="Need a decision" tone={stats.pendingTO > 0 ? "warn" : undefined} />
      </div>
      <NotificationsCard />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Onboarding progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {employees.map((e) => {
            const s = onboardingStatus(e, videos);
            return (
              <div key={e.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Avatar name={e.name} />
                    <span className="font-medium">{e.name}</span>
                    <Badge style={roleStyle(e.primaryRole)} className="border-transparent">{e.primaryRole}</Badge>
                    {s.fullyOnboarded && <Badge className="bg-success text-success-foreground hover:bg-success">Onboarded</Badge>}
                  </div>
                  <span className="text-muted-foreground">{s.passed}/{s.total} videos</span>
                </div>
                <Progress value={s.pct} className="h-1.5" />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsCard() {
  const { notifications, markNotificationsRead } = useStore();
  const recent = notifications.slice(0, 6);
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Training notifications</CardTitle>
          {unread > 0 && <Badge className="bg-primary text-primary-foreground hover:bg-primary">{unread} new</Badge>}
        </div>
        {unread > 0 && (
          <Button variant="ghost" size="sm" onClick={markNotificationsRead}>Mark all read</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {recent.length === 0 && <p className="text-sm text-muted-foreground">No notifications yet. You'll be alerted when staff pass or fail training.</p>}
        {recent.map((n) => {
          const tone = n.type === "training_passed" ? "border-success/30 bg-success/10"
            : n.type === "training_locked" ? "border-destructive/30 bg-destructive/10"
            : "border-warning/30 bg-warning/10";
          const icon = n.type === "training_passed" ? "✓" : n.type === "training_locked" ? "🔒" : "!";
          return (
            <div key={n.id} className={`flex items-start gap-3 rounded-lg border p-3 ${tone} ${!n.read ? "ring-1 ring-primary/20" : ""}`}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-card text-sm font-bold">{icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.message}</p>
                <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TeamTab() {
  const { employees, videos, inviteEmployee, restaurantProfile } = useStore();
  const [open, setOpen] = useState(false);
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "Server" as Role });
  const [editing, setEditing] = useState<Employee | null>(null);

  const [sortKey, setSortKey] = useState<TeamSortKey>("firstNameAsc");
  const [filters, setFilters] = useState<Set<string>>(new Set(["all"]));
  const [sfOpen, setSfOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TEAM_SORT_STORAGE_KEY);
      if (saved && SORT_OPTIONS.some((o) => o.key === saved)) setSortKey(saved as TeamSortKey);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(TEAM_SORT_STORAGE_KEY, sortKey); } catch {}
  }, [sortKey]);

  const toggleFilter = (key: string) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (key === "all") return new Set(["all"]);
      next.delete("all");
      if (next.has(key)) next.delete(key); else next.add(key);
      if (next.size === 0) next.add("all");
      return next;
    });
  };
  const clearFilters = () => setFilters(new Set(["all"]));
  const activeFilterCount = filters.has("all") ? 0 : filters.size;

  const visibleEmployees = useMemo(() => {
    const list = employees.filter((e) => {
      if (filters.has("all")) return true;
      const role = e.primaryRole;
      const isFoh = (FOH_ROLES as string[]).includes(role);
      const status = onboardingStatus(e, videos);
      for (const f of filters) {
        if (f === "foh" && isFoh) return true;
        if (f === "boh" && !isFoh) return true;
        if (f === "onboarded" && status.fullyOnboarded) return true;
        if (f === "inprogress" && !status.fullyOnboarded) return true;
        if (f === role) return true;
      }
      return false;
    });
    const firstOf = (e: Employee) => (e.firstName ?? e.name.split(" ")[0] ?? "").toLowerCase();
    const lastOf = (e: Employee) => (e.lastName ?? e.name.split(" ").slice(1).join(" ") ?? "").toLowerCase();
    const pctOf = (e: Employee) => onboardingStatus(e, videos).pct;
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "firstNameAsc": return firstOf(a).localeCompare(firstOf(b));
        case "firstNameDesc": return firstOf(b).localeCompare(firstOf(a));
        case "lastNameAsc": return lastOf(a).localeCompare(lastOf(b));
        case "lastNameDesc": return lastOf(b).localeCompare(lastOf(a));
        case "positionAsc": return a.primaryRole.localeCompare(b.primaryRole);
        case "onboardingDesc": return pctOf(b) - pctOf(a);
        case "onboardingAsc": return pctOf(a) - pctOf(b);
        default: return 0;
      }
    });
    return sorted;
  }, [employees, videos, filters, sortKey]);

  const joinSlug = restaurantProfile?.slug ?? (restaurantProfile?.name ? slugify(restaurantProfile.name) : "team");
  const copyJoinLink = async () => {
    const url = `${window.location.origin}/join/${joinSlug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Join link copied", { description: url });
    } catch {
      toast.message("Copy this link", { description: url });
    }
  };


  return (
    <div className="space-y-4">
      <StaffJoinBanner onShowQr={() => setShowQr(true)} />

      <div className="flex flex-wrap justify-end gap-2">
        <Popover open={sfOpen} onOpenChange={setSfOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-h-11 gap-1.5">
              Sort & Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              <ChevronDown className={`h-4 w-4 transition-transform ${sfOpen ? "rotate-180" : ""}`} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-[min(92vw,22rem)] max-h-[70vh] overflow-y-auto p-0">
            <div className="p-3">
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">Sort</p>
              <div className="space-y-0.5">
                {SORT_OPTIONS.map((o) => {
                  const active = sortKey === o.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setSortKey(o.key)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2.5 text-left text-sm min-h-11 ${active ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
                    >
                      <span>{o.label}</span>
                      {active && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-border p-3">
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">Filter</p>
              <div className="space-y-0.5">
                {[
                  { key: "all", label: "All Staff" },
                  { key: "foh", label: "Front of House only" },
                  { key: "boh", label: "Back of House only" },
                  ...FOH_ROLES.map((r) => ({ key: r, label: r })),
                  ...BOH_ROLES.map((r) => ({ key: r, label: r })),
                  { key: "onboarded", label: "Fully onboarded only" },
                  { key: "inprogress", label: "In progress only" },
                ].map((o) => {
                  const active = filters.has(o.key);
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => toggleFilter(o.key)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2.5 text-left text-sm min-h-11 ${active ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
                    >
                      <span>{o.label}</span>
                      {active && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="sticky bottom-0 border-t border-border bg-card p-2">
              <Button variant="ghost" size="sm" className="w-full min-h-11" onClick={clearFilters} disabled={activeFilterCount === 0}>
                Clear all filters
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Dialog open={addStaffOpen} onOpenChange={setAddStaffOpen}>
          <DialogTrigger asChild><Button>+ Add Staff</Button></DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Add staff to your team</DialogTitle></DialogHeader>
            <div className="grid gap-2 py-2">
              <button
                type="button"
                onClick={() => { setAddStaffOpen(false); copyJoinLink(); }}
                className="rounded-xl border-2 border-border p-4 text-left hover:border-primary hover:bg-primary/5"
              >
                <p className="font-semibold">📩 Send invite link</p>
                <p className="text-sm text-muted-foreground">Copies your join link so you can text or email it.</p>
              </button>
              <button
                type="button"
                onClick={() => { setAddStaffOpen(false); setShowQr(true); }}
                className="rounded-xl border-2 border-border p-4 text-left hover:border-primary hover:bg-primary/5"
              >
                <p className="font-semibold">📱 Show QR code</p>
                <p className="text-sm text-muted-foreground">Display fullscreen for staff to scan in person.</p>
              </button>
              <button
                type="button"
                onClick={() => { setAddStaffOpen(false); setOpen(true); }}
                className="rounded-xl border-2 border-border p-4 text-left hover:border-primary hover:bg-primary/5"
              >
                <p className="font-semibold">✍️ Add manually</p>
                <p className="text-sm text-muted-foreground">Enter the employee's details yourself.</p>
              </button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite a new employee</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2"><Label>Full name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="grid gap-2">
                <Label>Primary role</Label>
                <Select value={form.role} onValueChange={(v: Role) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Front of House</SelectLabel>
                      {FOH_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Back of House</SelectLabel>
                      {BOH_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => {
                if (!form.name || !form.email) return toast.error("Name and email required");
                inviteEmployee(form);
                toast.success(`Invite sent to ${form.email}`);
                setOpen(false);
                setForm({ name: "", email: "", role: "Server" });
              }}>Send invite</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {showQr && <FullscreenQrDialog onClose={() => setShowQr(false)} />}

      <div className="grid gap-4">
        {visibleEmployees.length === 0 && (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No staff match the current filters.</CardContent></Card>
        )}
        {visibleEmployees.map((e) => {
          const s = onboardingStatus(e, videos);
          const fullName = e.firstName && e.lastName ? `${e.firstName} ${e.lastName}` : e.name;
          return (
            <Card key={e.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <Avatar name={fullName} large />
                    <div className="min-w-0">
                      <p className="font-semibold">{fullName}</p>
                      <p className="text-sm text-muted-foreground break-all">{e.email}</p>
                      {e.phone && <p className="text-sm text-muted-foreground">{e.phone}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge style={roleStyle(e.primaryRole)} className="border-transparent">{e.primaryRole}</Badge>
                        {e.approvedRoles.filter((r) => r !== e.primaryRole).map((r) => (
                          <Badge key={r} style={roleStyle(r)} className="border-transparent opacity-90">{r}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {s.fullyOnboarded
                      ? <Badge className="bg-success text-success-foreground hover:bg-success">Fully onboarded</Badge>
                      : <Badge variant="secondary">Onboarding · {s.pct}%</Badge>}
                    <p className="mt-1 text-xs text-muted-foreground">{s.passed}/{s.total} videos passed</p>
                    <Progress value={s.pct} className="mt-2 h-1.5 w-32" />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Weekly availability</p>
                    <div className="mt-2 grid grid-cols-7 gap-1 text-center">
                      {DAY_KEYS.map((d) => {
                        const av = e.weeklyAvailability?.[d] ?? { kind: "full" as const };
                        const tone = av.kind === "full"
                          ? "bg-primary/15 text-primary border-primary/30"
                          : av.kind === "none"
                            ? "bg-muted text-muted-foreground border-border"
                            : "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300";
                        const sym = av.kind === "full" ? "✓" : av.kind === "none" ? "—" : "◐";
                        return (
                          <div key={d} className={`rounded border px-1 py-1 text-[10px] ${tone}`}>
                            <div className="font-semibold">{d}</div>
                            <div>{sym}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Emergency contact</p>
                    {e.emergencyContact ? (
                      <div className="mt-1 text-sm">
                        <p className="font-medium">{e.emergencyContact.name} <span className="text-xs text-muted-foreground">· {e.emergencyContact.relationship}</span></p>
                        <a href={`tel:${e.emergencyContact.phone}`} className="text-xs text-primary underline">{e.emergencyContact.phone}</a>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Not on file</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(e)}>Edit profile</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {editing && (
        <EmployeeProfileDialog
          employee={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EmployeeProfileDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { updateEmployee } = useStore();
  const [firstName, setFirstName] = useState(employee.firstName ?? employee.name.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(employee.lastName ?? employee.name.split(" ").slice(1).join(" ") ?? "");
  const [email, setEmail] = useState(employee.email);
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [approvedRoles, setApprovedRoles] = useState<Role[]>(employee.approvedRoles);
  const [autoApprove, setAutoApprove] = useState<Role[]>(employee.autoApproveRoles);
  const [weekly, setWeekly] = useState(employee.weeklyAvailability);
  const [ec, setEc] = useState(employee.emergencyContact ?? { name: "", phone: "", relationship: "Other" as Relationship });

  const save = () => {
    if (!firstName.trim()) return toast.error("First name is required");
    updateEmployee(employee.id, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name: `${firstName.trim()} ${lastName.trim()}`.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      approvedRoles,
      autoApproveRoles: autoApprove.filter((r) => approvedRoles.includes(r)),
      weeklyAvailability: weekly,
      emergencyContact: ec.name || ec.phone ? ec : undefined,
    });
    toast.success("Profile saved");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit employee profile</DialogTitle></DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>First name</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Last name</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Phone</Label><Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Approved roles</Label>
            <div className="mt-2 space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Front of House</p>
                <div className="flex flex-wrap gap-2">
                  {FOH_ROLES.map((r) => {
                    const checked = approvedRoles.includes(r);
                    return (
                      <label key={r} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm min-h-11 ${checked ? "border-primary bg-primary-soft" : "border-border"}`}>
                        <Checkbox checked={checked} onCheckedChange={(v) => {
                          setApprovedRoles((prev) => v ? [...new Set([...prev, r])] : prev.filter((x) => x !== r));
                        }} />
                        {r}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Back of House</p>
                <div className="flex flex-wrap gap-2">
                  {BOH_ROLES.map((r) => {
                    const checked = approvedRoles.includes(r);
                    return (
                      <label key={r} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm min-h-11 ${checked ? "border-primary bg-primary-soft" : "border-border"}`}>
                        <Checkbox checked={checked} onCheckedChange={(v) => {
                          setApprovedRoles((prev) => v ? [...new Set([...prev, r])] : prev.filter((x) => x !== r));
                        }} />
                        {r}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Auto-approve trades for</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {approvedRoles.length === 0 && <p className="text-sm text-muted-foreground">Approve a role first.</p>}
              {approvedRoles.map((r) => {
                const on = autoApprove.includes(r);
                return (
                  <div key={r} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                    <span>{r}</span>
                    <Switch checked={on} onCheckedChange={(v) => {
                      setAutoApprove((prev) => v ? [...new Set([...prev, r])] : prev.filter((x) => x !== r));
                    }} />
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Weekly availability</p>
            <AvailabilityEditor value={weekly} onChange={setWeekly} />
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emergency contact (manager-only)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label>Full name</Label><Input value={ec.name} onChange={(e) => setEc({ ...ec, name: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Phone</Label><Input type="tel" value={ec.phone} onChange={(e) => setEc({ ...ec, phone: e.target.value })} /></div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Relationship</Label>
                <Select value={ec.relationship} onValueChange={(v: Relationship) => setEc({ ...ec, relationship: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["Spouse","Parent","Sibling","Child","Friend","Other"] as Relationship[]).map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleTab() {
  return <ScheduleSection />;
}


function TradesTab() {
  const { trades, shifts, employees, resolveTrade } = useStore();
  const pending = trades.filter((t) => t.status === "pending_approval");
  const open = trades.filter((t) => t.status === "open");
  const history = trades.filter((t) => ["approved", "denied", "cancelled"].includes(t.status));

  const row = (t: typeof trades[number]) => {
    const shift = shifts.find((s) => s.id === t.shiftId);
    const from = employees.find((e) => e.id === t.postedBy);
    const to = t.claimedBy ? employees.find((e) => e.id === t.claimedBy) : null;
    return (
      <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
        <div className="text-sm">
          <p className="font-medium">{from?.name} → {to?.name ?? "open"}</p>
          <p className="text-xs text-muted-foreground">
            {shift?.role} · {shift?.date} · {shift?.start}–{shift?.end}
            {t.autoApproved && " · auto-approved"}
          </p>
        </div>
        {t.status === "pending_approval" && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { resolveTrade(t.id, false); toast.message("Trade denied"); }}>Deny</Button>
            <Button size="sm" onClick={() => { resolveTrade(t.id, true); toast.success("Trade approved"); }}>Approve</Button>
          </div>
        )}
        {t.status !== "pending_approval" && (
          <Badge variant={t.status === "approved" ? "default" : "secondary"} className={t.status === "approved" ? "bg-success text-success-foreground hover:bg-success" : ""}>{t.status}</Badge>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Pending approval ({pending.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waiting on you.</p> : pending.map(row)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Open on the board ({open.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {open.length === 0 ? <p className="text-sm text-muted-foreground">No open trades.</p> : open.map(row)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? <p className="text-sm text-muted-foreground">No past trades yet.</p> : history.map(row)}
        </CardContent>
      </Card>
    </div>
  );
}

function JobsTab() {
  const {
    jobs,
    applications,
    postJob,
    toggleJobOpen,
    removeJob,
    setInterviewNotes,
    declineApplication,
    reconsiderApplication,
    hireApplication,
    approveForInterview,
    applicantSelectSlot,
    completeInterview,
    inviteShadowShift,
    restaurantProfile,
  } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", role: "Server" as Role, type: "Full-time" as "Full-time" | "Part-time", payRange: "", description: "" });
  const [hireFor, setHireFor] = useState<string | null>(null);
  const [pickTypeFor, setPickTypeFor] = useState<string | null>(null);
  const [approveFor, setApproveFor] = useState<{ id: string; type: InterviewType } | null>(null);
  const [callFor, setCallFor] = useState<string | null>(null);
  const [shadowFor, setShadowFor] = useState<string | null>(null);
  const [declineConfirmFor, setDeclineConfirmFor] = useState<{ id: string; postInterview?: boolean } | null>(null);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);

  const submit = () => {
    if (!form.title || !form.payRange || !form.description) return toast.error("Fill in title, pay range, and description.");
    postJob(form);
    toast.success("Job posted");
    setOpen(false);
    setForm({ title: "", role: "Server", type: "Full-time", payRange: "", description: "" });
  };

  const restaurantName = restaurantProfile?.name ?? "our restaurant";

  const active = applications.filter((a) => !a.archived);
  const newApps = active.filter((a) => getHiringStage(a) === "new");
  const videoApps = active.filter((a) => {
    const st = getHiringStage(a);
    return st === "video_offered" || st === "video_scheduled" || st === "interviewed";
  });
  const shadowApps = active.filter((a) => getHiringStage(a) === "shadow_scheduled");
  const archived = applications.filter((a) => a.archived);

  const hireApp = applications.find((a) => a.id === hireFor) ?? null;
  const approveApp = approveFor ? applications.find((a) => a.id === approveFor.id) ?? null : null;
  const pickTypeApp = pickTypeFor ? applications.find((a) => a.id === pickTypeFor) ?? null : null;
  const callApp = applications.find((a) => a.id === callFor) ?? null;
  const shadowApp = applications.find((a) => a.id === shadowFor) ?? null;
  const declineApp = declineConfirmFor ? applications.find((a) => a.id === declineConfirmFor.id) ?? null : null;

  const copyApplicationLink = async (jobId: string) => {
    const url = `${window.location.origin}/careers?job=${jobId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Application link copied", { description: url });
    } catch {
      toast.message("Copy this link", { description: url });
    }
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Job postings</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Public careers page: <code className="rounded bg-muted px-1.5 py-0.5">/careers</code></p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>+ Post a job</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Post a new job</DialogTitle></DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2"><Label>Job title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Experienced Line Cook" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={(v: Role) => setForm({ ...form, role: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Front of House</SelectLabel>
                          {FOH_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectGroup>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Back of House</SelectLabel>
                          {BOH_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v: "Full-time" | "Part-time") => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Full-time">Full-time</SelectItem><SelectItem value="Part-time">Part-time</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2"><Label>Pay range</Label><Input value={form.payRange} onChange={(e) => setForm({ ...form, payRange: e.target.value })} placeholder="e.g. $20–$25/hr" /></div>
                <div className="grid gap-2"><Label>Description</Label><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={submit}>Post job</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs posted yet.</p>}
          {jobs.map((j) => {
            const count = applications.filter((a) => a.jobId === j.id).length;
            return (
              <div key={j.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{j.title}</p>
                      <Badge variant="secondary">{j.role}</Badge>
                      <Badge variant="outline">{j.type}</Badge>
                      {j.open
                        ? <Badge className="bg-success text-success-foreground hover:bg-success">Open</Badge>
                        : <Badge variant="secondary">Closed</Badge>}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-primary">{j.payRange}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{count} application{count === 1 ? "" : "s"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => copyApplicationLink(j.id)}>Copy Application Link</Button>
                    <ActionTooltip text="Temporarily pauses this job posting. No new applications will be accepted. You can reopen this anytime.">
                      <Button size="sm" variant="outline" onClick={() => toggleJobOpen(j.id)}>{j.open ? "Close" : "Reopen"}</Button>
                    </ActionTooltip>
                    <ActionTooltip text="Permanently removes this job posting and all associated applications. This cannot be undone.">
                      <Button size="sm" variant="ghost" onClick={() => setDeleteJobId(j.id)}>Delete</Button>
                    </ActionTooltip>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Share this link on Indeed, Instagram, or anywhere you recruit.</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <ApplicationSection
        title="New Applications"
        subtitle="Needs review"
        items={newApps}
        accent={newApps.length > 0 ? "warn" : undefined}
        emptyText="No new applications."
        renderActions={(a) => (
          <>
            <Button size="sm" onClick={() => setPickTypeFor(a.id)}>Approve for Interview</Button>
            <Button size="sm" variant="outline" onClick={() => setDeclineConfirmFor({ id: a.id })}>Decline</Button>
          </>
        )}
      />

      <ApplicationSection
        title="Interview Scheduled"
        subtitle="Awaiting time confirmation or interview"
        items={videoApps}
        emptyText="No interviews in progress."
        renderExtra={(a) => <InterviewStageDetails app={a} restaurantName={restaurantName} />}
        renderActions={(a) => {
          const stage = getHiringStage(a);
          if (stage === "video_offered") {
            return (
              <>
                <Button size="sm" variant="outline" disabled>Awaiting applicant</Button>
                <Button size="sm" variant="outline" onClick={() => setDeclineConfirmFor({ id: a.id })}>Decline</Button>
              </>
            );
          }
          if (stage === "video_scheduled") {
            const type = a.interviewType ?? "video";
            return (
              <>
                {type === "video" ? (
                  <Button size="sm" onClick={() => setCallFor(a.id)}>Join Video Call</Button>
                ) : (
                  <Button size="sm" onClick={() => {
                    completeInterview(a.id);
                    toast.success("Interview marked complete", { description: "Add notes and decide next step." });
                  }}>Mark Interview Complete</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setDeclineConfirmFor({ id: a.id })}>Decline</Button>
              </>
            );
          }
          // interviewed
          return (
            <>
              <Button size="sm" onClick={() => setShadowFor(a.id)}>Invite for Shadow Shift</Button>
              <Button size="sm" variant="outline" onClick={() => setDeclineConfirmFor({ id: a.id, postInterview: true })}>Decline</Button>
            </>
          );
        }}
      />

      <ApplicationSection
        title="Shadow Shift Scheduled"
        subtitle="Awaiting in-person shift"
        items={shadowApps}
        emptyText="No shadow shifts scheduled."
        renderExtra={(a) => a.shadowShift && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-semibold text-primary">Shadow shift scheduled</p>
            <p className="mt-1">{a.shadowShift.date} at {a.shadowShift.time}</p>
            {a.shadowShift.dressCode && <p className="text-xs text-muted-foreground">Dress code: {a.shadowShift.dressCode}</p>}
            {a.shadowShift.instructions && <p className="mt-1 text-xs text-muted-foreground">{a.shadowShift.instructions}</p>}
          </div>
        )}
        renderActions={(a) => (
          <>
            <Button size="sm" onClick={() => setHireFor(a.id)}>Hire</Button>
            <Button size="sm" variant="outline" onClick={() => setDeclineConfirmFor({ id: a.id })}>Decline</Button>
          </>
        )}
      />

      <ApplicationSection
        title="Archived"
        subtitle="Hired or declined"
        items={archived}
        emptyText="No archived applications."
        compact
        renderActions={(a) => (
          a.status !== "hired" ? (
            <Button size="sm" variant="outline" onClick={() => {
              reconsiderApplication(a.id);
              toast.success(`${a.firstName ?? a.name} moved back to New`);
            }}>Reconsider</Button>
          ) : null
        )}
      />

      {pickTypeApp && (
        <InterviewTypeDialog
          application={pickTypeApp}
          onClose={() => setPickTypeFor(null)}
          onPick={(type) => {
            setPickTypeFor(null);
            setApproveFor({ id: pickTypeApp.id, type });
          }}
        />
      )}

      {approveApp && approveFor && (
        <ApproveInterviewDialog
          application={approveApp}
          type={approveFor.type}
          onClose={() => setApproveFor(null)}
          onConfirm={(slots) => {
            approveForInterview(approveApp.id, approveFor.type, slots);
            const name = approveApp.firstName ?? approveApp.name;
            const label = approveFor.type === "video" ? "Video interview" : approveFor.type === "in_person" ? "In-person interview" : "Phone interview";
            toast.success(`${label} invite sent to ${name}`, {
              description: `Text & email with ${slots.length} time slot${slots.length === 1 ? "" : "s"}. Applicant link: /interview/${approveApp.id}`,
            });
            setApproveFor(null);
          }}
        />
      )}

      {callApp && (
        <VideoCallDialog
          application={callApp}
          restaurantName={restaurantName}
          onClose={() => setCallFor(null)}
          onEnd={(notes) => {
            completeInterview(callApp.id, notes);
            toast.success("Interview complete", { description: "Ready for your decision." });
            setCallFor(null);
          }}
        />
      )}

      {shadowApp && (
        <ShadowShiftDialog
          application={shadowApp}
          restaurantName={restaurantName}
          onClose={() => setShadowFor(null)}
          onConfirm={(details) => {
            inviteShadowShift(shadowApp.id, details);
            const name = shadowApp.firstName ?? shadowApp.name;
            toast.success(`Shadow shift invite sent to ${name}`, {
              description: `${details.date} at ${details.time}`,
            });
            setShadowFor(null);
          }}
        />
      )}

      {declineApp && declineConfirmFor && (
        <Dialog open onOpenChange={(o) => { if (!o) setDeclineConfirmFor(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Decline application?</DialogTitle></DialogHeader>
            <div className="py-2 text-sm text-muted-foreground">
              {declineConfirmFor.postInterview ? (
                <>
                  <p>Send the following message to <span className="font-semibold text-foreground">{declineApp.firstName ?? declineApp.name}</span>?</p>
                  <p className="mt-2 rounded-md bg-muted p-3 italic">
                    "Hi {declineApp.firstName ?? declineApp.name}, thank you for taking the time to speak with us. We've decided to move forward with other candidates at this time. We wish you the best!"
                  </p>
                </>
              ) : (
                <>
                  <p>Send the following message to <span className="font-semibold text-foreground">{declineApp.firstName ?? declineApp.name}</span>?</p>
                  <p className="mt-2 rounded-md bg-muted p-3 italic">
                    "Hi {declineApp.firstName ?? declineApp.name}, thank you for your interest in {restaurantName}. We appreciate your time and will keep your application on file for future opportunities. Best of luck!"
                  </p>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeclineConfirmFor(null)}>Cancel</Button>
              <Button onClick={() => {
                declineApplication(declineApp.id);
                toast.message(`Decline message sent to ${declineApp.firstName ?? declineApp.name}`);
                setDeclineConfirmFor(null);
              }}>Send & Decline</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {hireApp && (
        <HireReviewDialog
          application={hireApp}
          onClose={() => setHireFor(null)}
          onConfirm={(overrides) => {
            const id = hireApplication(hireApp.id, overrides);
            if (id) {
              const name = (overrides.firstName ?? hireApp.firstName ?? hireApp.name);
              toast.success(`${name} hired!`, {
                description: `Welcome message sent. Training assigned for ${overrides.primaryRole}.`,
              });
            }
            setHireFor(null);
          }}
        />
      )}
      {deleteJobId && (
        <Dialog open onOpenChange={(o) => { if (!o) setDeleteJobId(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Delete job posting?</DialogTitle></DialogHeader>
            <p className="py-2 text-sm text-muted-foreground">
              Are you sure? This will permanently delete this job posting and all applications. This cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteJobId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => {
                removeJob(deleteJobId);
                toast.message("Job removed");
                setDeleteJobId(null);
              }}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

const INTERVIEW_TYPE_META: Record<InterviewType, { emoji: string; label: string; tagline: string; bullets: string[] }> = {
  video: {
    emoji: "📹",
    label: "Video Call",
    tagline: "5 minute video call inside Sidework",
    bullets: [
      "You pick available time slots",
      "Applicant picks a time that works",
      "Video happens inside Sidework via Daily.co",
      "5-minute timer visible during call",
    ],
  },
  in_person: {
    emoji: "🤝",
    label: "In Person",
    tagline: "Meet at your restaurant",
    bullets: [
      "You pick available dates and times",
      "Applicant picks a time that works",
      "Confirmation includes restaurant address",
      "Reminders 24 hours and 1 hour before",
    ],
  },
  phone: {
    emoji: "📞",
    label: "Phone Call",
    tagline: "Quick phone screen",
    bullets: [
      "You pick available time slots",
      "Applicant picks a time that works",
      "Confirmation includes your phone number",
      "Reminder 30 minutes before",
    ],
  },
};


function InterviewStageDetails({ app, restaurantName }: { app: JobApplication; restaurantName: string }) {
  const stage = getHiringStage(app);
  const type = app.interviewType ?? "video";
  const meta = INTERVIEW_TYPE_META[type];
  if (stage === "video_offered" && app.offeredSlots) {
    return (
      <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
        <p className="font-semibold">{meta.emoji} {meta.label} — awaiting applicant time selection</p>
        <p className="mt-1 text-xs text-muted-foreground">Offered {app.offeredSlots.length} slot{app.offeredSlots.length === 1 ? "" : "s"}. They'll get a text + email with the link.</p>
        <p className="mt-2 text-xs">Applicant link: <code className="rounded bg-background px-1.5 py-0.5">/interview/{app.id}</code></p>
      </div>
    );
  }
  if (stage === "video_scheduled" && app.selectedSlot) {
    const reminderCopy =
      type === "video" ? "Both parties get a reminder 30 minutes before with the join link."
      : type === "in_person" ? `Both parties get reminders 24 hours and 1 hour before. They'll meet at ${restaurantName}.`
      : "Both parties get a reminder 30 minutes before the call.";
    return (
      <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
        <p className="font-semibold text-primary">{meta.emoji} {meta.label} confirmed</p>
        <p className="mt-1">{new Date(app.selectedSlot).toLocaleString([], { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
        <p className="mt-1 text-xs text-muted-foreground">{reminderCopy}</p>
      </div>
    );
  }
  if (stage === "interviewed") {
    return (
      <div className="mt-3 grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
        <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Interview notes ({meta.label.toLowerCase()})</Label>
        {app.interviewNotes
          ? <p className="text-sm italic text-foreground/90">"{app.interviewNotes}"</p>
          : <p className="text-xs text-muted-foreground">No notes recorded.</p>}
      </div>
    );
  }
  return null;
}

function InterviewTypeDialog({
  application, onClose, onPick,
}: {
  application: JobApplication;
  onClose: () => void;
  onPick: (type: InterviewType) => void;
}) {
  const name = application.firstName ?? application.name;
  const types: InterviewType[] = ["video", "in_person", "phone"];
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>How would you like to interview {name}?</DialogTitle>
          <p className="text-sm text-muted-foreground">Choose a format. Next, you'll pick the times that work for you.</p>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {types.map((t) => {
            const meta = INTERVIEW_TYPE_META[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => onPick(t)}
                className="group flex w-full items-start gap-3 rounded-xl border-2 border-border bg-background p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:border-primary focus-visible:outline-none"
              >
                <div className="text-3xl leading-none">{meta.emoji}</div>
                <div className="flex-1">
                  <div className="text-base font-semibold text-foreground">{meta.label}</div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{meta.tagline}</p>
                  <ul className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
                    {meta.bullets.map((b) => <li key={b}>• {b}</li>)}
                  </ul>
                </div>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveInterviewDialog({
  application, type, onClose, onConfirm,
}: {
  application: JobApplication;
  type: InterviewType;
  onClose: () => void;
  onConfirm: (slots: string[]) => void;
}) {
  const meta = INTERVIEW_TYPE_META[type];
  const suggested = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    const hours = [10, 12, 14, 16, 18];
    for (let day = 1; day <= 7 && out.length < 15; day++) {
      const d = new Date(now);
      d.setDate(d.getDate() + day);
      hours.forEach((h) => {
        const slot = new Date(d);
        slot.setHours(h, 0, 0, 0);
        out.push(slot.toISOString());
      });
    }
    return out;
  }, [application.id]);
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (s: string) => {
    setSelected((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s);
      if (prev.length >= 5) {
        toast.message("Max 5 slots", { description: "Deselect one to add another." });
        return prev;
      }
      return [...prev, s];
    });
  };

  const submit = () => {
    if (selected.length < 1) return toast.error("Pick at least one time slot.");
    if (selected.length > 5) return toast.error("Pick up to 5 time slots.");
    onConfirm(selected);
  };

  const name = application.firstName ?? application.name;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{meta.emoji} Pick your available times</DialogTitle>
          <p className="text-sm text-muted-foreground">Tap any time slot to mark as available. Up to 5 slots. {name} will pick their preferred time.</p>
        </DialogHeader>
        <div className="grid max-h-[50vh] gap-2 overflow-y-auto py-2 sm:grid-cols-2">
          {suggested.map((s) => {
            const on = selected.includes(s);
            const d = new Date(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                className={`min-h-12 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
              >
                {d.toLocaleString([], { weekday: "long", month: "short", day: "numeric" })}
                <span className="block text-xs opacity-80">at {d.toLocaleString([], { hour: "numeric", minute: "2-digit" })}</span>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={selected.length === 0}>
            Confirm {selected.length || ""} slot{selected.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VideoCallDialog({
  application, restaurantName, onClose, onEnd,
}: {
  application: JobApplication;
  restaurantName: string;
  onClose: () => void;
  onEnd: (notes: string) => void;
}) {
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getOrCreateInterviewRoom } = await import("@/lib/daily.functions");
        const res = await getOrCreateInterviewRoom({ data: { applicationId: application.id } });
        if (!cancelled) setRoomUrl(res.url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not start video call");
      }
    })();
    return () => { cancelled = true; };
  }, [application.id]);

  const name = application.firstName && application.lastName ? `${application.firstName} ${application.lastName}` : application.name;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { if (!ended) setEnded(true); else onClose(); } }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{ended ? "Interview ended" : `Video interview with ${name}`}</DialogTitle>
        </DialogHeader>
        {!ended ? (
          <div className="space-y-3">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
              {error ? (
                <div className="grid h-full place-items-center p-6 text-center text-sm text-destructive-foreground">
                  {error}
                </div>
              ) : !roomUrl ? (
                <div className="grid h-full place-items-center text-sm text-white/80">
                  Connecting to video…
                </div>
              ) : (
                <iframe
                  title={`Daily video call with ${name}`}
                  src={`${roomUrl}?userName=${encodeURIComponent(restaurantName)}`}
                  allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
                  className="h-full w-full border-0"
                />
              )}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Powered by Daily.co · Applicant joins from their interview link
            </p>
            <div className="flex justify-center">
              <Button variant="destructive" size="lg" onClick={() => setEnded(true)}>End call</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Add your interview notes</Label>
            <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add your interview notes here…" />
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={onClose}>Save & close</Button>
              <Button onClick={() => onEnd(notes)}>Save notes</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


function ShadowShiftDialog({
  application, restaurantName, onClose, onConfirm,
}: {
  application: JobApplication;
  restaurantName: string;
  onClose: () => void;
  onConfirm: (details: ShadowShiftDetails) => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [instructions, setInstructions] = useState("Ask for the manager on duty when you arrive.");
  const [dressCode, setDressCode] = useState("Black non-slip shoes, black pants, white collared shirt.");

  const submit = () => {
    if (!date || !time) return toast.error("Pick a date and time.");
    onConfirm({ date, time, instructions, dressCode });
  };

  const name = application.firstName ?? application.name;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite {name} for a shadow shift</DialogTitle>
          <p className="text-sm text-muted-foreground">They'll receive a text and email confirmation immediately.</p>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Time</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
          <div className="grid gap-1.5"><Label>Dress code</Label><Input value={dressCode} onChange={(e) => setDressCode(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Instructions</Label><Textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></div>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Preview: "Congratulations {name}! We'd like to invite you for a shadow shift at {restaurantName}. {date && time ? `Please arrive on ${date} at ${time}. ` : ""}Dress code: {dressCode} {instructions} We look forward to meeting you!"
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function ApplicationSection({
  title, subtitle, items, emptyText, renderActions, renderExtra, accent, compact,
}: {
  title: string;
  subtitle?: string;
  items: ReturnType<typeof useStore>["applications"];
  emptyText: string;
  renderActions: (a: ReturnType<typeof useStore>["applications"][number]) => React.ReactNode;
  renderExtra?: (a: ReturnType<typeof useStore>["applications"][number]) => React.ReactNode;
  accent?: "warn";
  compact?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{title} ({items.length})</CardTitle>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {accent === "warn" && items.length > 0 && (
            <Badge className="bg-warning text-warning-foreground hover:bg-warning">{items.length} new</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          items.map((a) => <ApplicantCard key={a.id} a={a} actions={renderActions(a)} extra={renderExtra?.(a)} compact={compact} />)
        )}
      </CardContent>
    </Card>
  );
}

function aiScoreReasons(a: JobApplication): string[] {
  const reasons: string[] = [];
  if (!a.firstName || !a.lastName) reasons.push("missing full name");
  if (!a.email) reasons.push("missing email");
  if (!a.phone) reasons.push("missing phone");
  if (!a.role) reasons.push("missing position");
  const pitchText = (a.pitch ?? a.note ?? "").trim();
  const words = pitchText ? pitchText.split(/\s+/).length : 0;
  if (words < 40) reasons.push("short pitch");
  const days = a.weeklyAvailability
    ? DAY_KEYS.filter((d) => a.weeklyAvailability![d]?.kind !== "none").length
    : (a.availabilityDays?.length ?? 0);
  if (days < 3) reasons.push("limited availability");
  if (reasons.length === 0) return ["complete profile, strong pitch, good availability"];
  return reasons;
}

function ApplicantCard({
  a, actions, extra, compact,
}: {
  a: ReturnType<typeof useStore>["applications"][number];
  actions: React.ReactNode;
  extra?: React.ReactNode;
  compact?: boolean;
}) {
  const fullName = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.name;
  const score = a.aiScore ?? "Average";
  const scoreClass =
    score === "Strong" ? "bg-success text-success-foreground hover:bg-success" :
    score === "Weak" ? "bg-destructive text-destructive-foreground hover:bg-destructive" :
    "bg-secondary text-secondary-foreground hover:bg-secondary";
  const scoreReasons = aiScoreReasons(a);

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{fullName}</p>
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className={`cursor-help ${scoreClass}`}>AI: {score}</Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-semibold">AI score: {score}</p>
                  <ul className="mt-1 list-disc pl-4">
                    {scoreReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <StatusBadge status={a.status} />
          </div>
          {a.role && (
            <p className="mt-0.5 text-sm text-muted-foreground">Applying for <span className="font-medium text-foreground">{a.role}</span></p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {a.email && <a href={`mailto:${a.email}`} className="underline break-all">{a.email}</a>}
            <a href={`tel:${a.phone}`} className="underline">{a.phone}</a>
            <span>Applied {new Date(a.appliedAt).toLocaleDateString()}</span>
            {a.source && <span>· via {a.source}</span>}
          </div>
        </div>
      </div>

      {!compact && (
        <div className="mt-3 grid gap-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Availability</p>
            <div className="mt-1.5 grid grid-cols-7 gap-1 text-center">
              {DAY_KEYS.map((d) => {
                const on = a.weeklyAvailability
                  ? a.weeklyAvailability[d]?.kind !== "none"
                  : a.availabilityDays.includes(d);
                return (
                  <div
                    key={d}
                    className={`rounded border px-1 py-1 text-[10px] ${on ? "border-primary/30 bg-primary/15 text-primary" : "border-border bg-muted text-muted-foreground"}`}
                  >
                    <div className="font-semibold">{d}</div>
                    <div>{on ? "✓" : "—"}</div>
                  </div>
                );
              })}
            </div>
          </div>
          {(a.pitch || a.note) && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pitch</p>
              <p className="mt-1 text-sm italic text-foreground/90">"{a.pitch ?? a.note}"</p>
            </div>
          )}
        </div>
      )}

      {extra}

      {actions && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">{actions}</div>
      )}
    </div>
  );
}

function HireReviewDialog({
  application, onClose, onConfirm,
}: {
  application: ReturnType<typeof useStore>["applications"][number];
  onClose: () => void;
  onConfirm: (overrides: Partial<Employee>) => void;
}) {
  const [firstName, setFirstName] = useState(application.firstName ?? application.name.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(application.lastName ?? application.name.split(" ").slice(1).join(" ") ?? "");
  const [email, setEmail] = useState(application.email ?? "");
  const [phone, setPhone] = useState(application.phone);
  const [role, setRole] = useState<Role>(application.role ?? "Server");
  const [submitting, setSubmitting] = useState(false);

  const confirm = async () => {
    if (!firstName.trim() || !lastName.trim()) return toast.error("Name required.");
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 500));
    onConfirm({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      primaryRole: role,
      approvedRoles: [role],
      weeklyAvailability: application.weeklyAvailability,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirm hire</DialogTitle>
          <p className="text-sm text-muted-foreground">All info from the application is pre-filled. Review and edit anything if needed, then confirm.</p>
        </DialogHeader>
        <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
            <p className="font-semibold text-primary">From application</p>
            <p className="mt-1 text-muted-foreground">
              Applied {new Date(application.appliedAt).toLocaleDateString()}
              {application.source ? ` · via ${application.source}` : ""}
              {application.availabilityHours ? ` · ${application.availabilityHours}` : ""}
            </p>
            {(application.pitch || application.note) && (
              <p className="mt-2 italic text-foreground/90">"{application.pitch ?? application.note}"</p>
            )}
            {application.workExperience && application.workExperience.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="font-semibold text-primary">Work experience</p>
                {application.workExperience.map((w, i) => (
                  <div key={i} className="text-muted-foreground">
                    {w.employer && w.position ? (
                      <span>{w.employer} — {w.position}{w.duration ? ` · ${w.duration}` : ""}</span>
                    ) : w.employer ? (
                      <span>{w.employer}{w.duration ? ` · ${w.duration}` : ""}</span>
                    ) : w.position ? (
                      <span>{w.position}{w.duration ? ` · ${w.duration}` : ""}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 grid grid-cols-7 gap-1 text-center">
              {DAY_KEYS.map((d) => {
                const on = application.weeklyAvailability
                  ? application.weeklyAvailability[d]?.kind !== "none"
                  : application.availabilityDays.includes(d);
                return (
                  <div key={d} className={`rounded border px-1 py-0.5 text-[10px] ${on ? "border-primary/30 bg-primary/15 text-primary" : "border-border bg-muted text-muted-foreground"}`}>
                    <div className="font-semibold">{d}</div>
                    <div>{on ? "✓" : "—"}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label>First name</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Last name</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Phone</Label><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div className="grid gap-1.5">
            <Label>Position</Label>
            <Select value={role} onValueChange={(v: Role) => setRole(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Front of House</SelectLabel>
                  {FOH_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Back of House</SelectLabel>
                  {BOH_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Availability from the application carries over automatically. Emergency contact and profile photo will be added by the employee from the welcome link. Training and menu quiz are assigned automatically based on the selected position.
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={confirm} disabled={submitting}>
            {submitting ? "Hiring…" : "Confirm hire"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const map: Record<ApplicationStatus, string> = {
    new: "bg-warning text-warning-foreground hover:bg-warning",
    reviewing: "bg-secondary text-secondary-foreground hover:bg-secondary",
    interview: "bg-primary text-primary-foreground hover:bg-primary",
    hired: "bg-success text-success-foreground hover:bg-success",
    rejected: "bg-destructive text-destructive-foreground hover:bg-destructive",
  };
  return <Badge className={map[status]}>{status}</Badge>;
}

function TimeOffTab() {
  const { timeOff, employees, resolveTimeOff } = useStore();
  const pending = timeOff.filter((t) => t.status === "pending");
  const history = timeOff.filter((t) => t.status !== "pending");

  const row = (t: typeof timeOff[number]) => {
    const emp = employees.find((e) => e.id === t.employeeId);
    return (
      <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
        <div className="text-sm">
          <p className="font-semibold">{emp?.name} <span className="text-muted-foreground">· {emp?.primaryRole}</span></p>
          <p className="text-xs text-muted-foreground">{t.startDate} → {t.endDate} · {t.reason}</p>
        </div>
        {t.status === "pending" ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { resolveTimeOff(t.id, false); toast.message("Denied"); }}>Deny</Button>
            <Button size="sm" onClick={() => { resolveTimeOff(t.id, true); toast.success("Approved"); }}>Approve</Button>
          </div>
        ) : (
          <Badge className={t.status === "approved" ? "bg-success text-success-foreground hover:bg-success" : "bg-destructive text-destructive-foreground hover:bg-destructive"}>{t.status}</Badge>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Pending requests ({pending.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">No pending requests.</p> : pending.map(row)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? <p className="text-sm text-muted-foreground">No history yet.</p> : history.map(row)}
        </CardContent>
      </Card>
    </div>
  );
}

function TrainingProgramTab() {
  const { menu, drinkMenu, restaurantProfile } = useStore();
  return (
    <div className="grid gap-6">
      {restaurantProfile && (
        <Card className="overflow-hidden border-primary/20">
          <div className="bg-gradient-to-br from-primary to-[oklch(0.22_0.05_155)] p-5 text-primary-foreground sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] opacity-80">Your vision</p>
            <h2 className="mt-1 text-xl font-semibold sm:text-2xl">{restaurantProfile.name}</h2>
            <p className="mt-1 text-sm opacity-90">{restaurantProfile.concept}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-white/15 text-white hover:bg-white/15">{restaurantProfile.serviceStyle}</Badge>
              <Badge className="bg-white/15 text-white hover:bg-white/15">{restaurantProfile.priority}</Badge>
            </div>
          </div>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
            <MenuMini label="Food menu" menu={menu} />
            <MenuMini label="Drink menu" menu={drinkMenu} />
          </CardContent>
        </Card>
      )}
      <TrainingProgram menuName={menu?.name ?? "your menus"} />
      <MenuQuizGenerator menuName={menu?.name} />
    </div>
  );
}

function MenuMini({ label, menu }: { label: string; menu: { name: string; sizeKB: number; preview?: string } | null }) {
  if (!menu) return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
      {label}: not uploaded
    </div>
  );
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
      {menu.preview ? (
        <img src={menu.preview} alt="" className="h-10 w-10 rounded border border-border object-cover" />
      ) : (
        <div className="grid h-10 w-10 place-items-center rounded bg-primary-soft text-primary">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{menu.name}</p>
      </div>
    </div>
  );
}

function MenuTab() {
  const { menu, setMenu, markMenuGenerated } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!menu || menu.generatedAt) {
      setGenerating(false);
      return;
    }

    setGenerating(true);
    const t = window.setTimeout(() => {
      markMenuGenerated();
      setGenerating(false);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [menu?.uploadedAt, menu?.generatedAt]);

  const handleFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isPdf = file.type === "application/pdf" || ext === "pdf";
    const isImage = file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext);

    if (!isPdf && !isImage) return toast.error("Upload a menu as a PDF or photo.");
    if (file.size > 25 * 1024 * 1024) return toast.error("File must be under 25MB.");

    const saveMenu = (preview?: string) => {
      setMenu({
        name: file.name,
        type: file.type || (isPdf ? "application/pdf" : "image/*"),
        sizeKB: Math.max(1, Math.round(file.size / 1024)),
        uploadedAt: new Date().toISOString(),
        preview,
      });
      toast.success("Menu uploaded — generating training program");
    };

    if (isImage && file.size <= 750 * 1024 && !["heic", "heif"].includes(ext)) {
      const reader = new FileReader();
      reader.onload = () => saveMenu(reader.result as string);
      reader.onerror = () => saveMenu();
      reader.readAsDataURL(file);
      return;
    }

    saveMenu();
  };

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-primary to-[oklch(0.22_0.05_155)] p-6 text-primary-foreground">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] opacity-80">Menu intelligence</p>
          <h2 className="mt-1 text-2xl font-semibold">Upload your food & drink menu</h2>
          <p className="mt-1 text-sm opacity-90">We'll generate role-specific training modules tailored to your menu.</p>
        </div>
        <CardContent className="p-5">
          {!menu ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              className="grid place-items-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 p-10 text-center"
            >
              <div className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <div>
                <p className="font-semibold">Drop your menu here</p>
                <p className="text-xs text-muted-foreground">PDF or menu photo · up to 25MB</p>
              </div>
              <input ref={inputRef} type="file" accept="application/pdf,image/*,.heic,.heif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }} />
              <Button onClick={() => inputRef.current?.click()}>Choose file</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {menu.preview ? (
                  <img src={menu.preview} alt="Menu preview" className="h-16 w-16 rounded-lg border border-border object-cover" />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-lg bg-primary-soft text-primary">
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </div>
                )}
                <div>
                  <p className="font-semibold">{menu.name}</p>
                  <p className="text-xs text-muted-foreground">{menu.sizeKB} KB · uploaded {new Date(menu.uploadedAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>Replace</Button>
                <Button variant="ghost" size="sm" onClick={() => { setMenu(null); toast.message("Menu removed"); }}>Remove</Button>
                <input ref={inputRef} type="file" accept="application/pdf,image/*,.heic,.heif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {menu && (generating || !menu.generatedAt) && (
        <Card className="border-primary/30 bg-primary-soft">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground">
              <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            </div>
            <div>
              <p className="font-semibold text-primary">Your custom training program is being generated based on your menu.</p>
              <p className="text-sm text-primary/80">This usually takes less than a minute.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {menu && menu.generatedAt && <TrainingProgram menuName={menu.name} />}
    </div>
  );
}

const TRAINING_MODULES: Record<"Server" | "Bartender" | "Kitchen", { title: string; videos: string[] }[]> = {
  Server: [
    { title: "Menu Knowledge & Storytelling", videos: ["Starters & shareables walkthrough", "Entrée specs and allergens", "Dessert pairings & upsell cues"] },
    { title: "Wine & Beverage Pairing", videos: ["House pours & by-the-glass list", "Pairing guide for tonight's menu"] },
    { title: "Service Standards", videos: ["Greeting & table touch sequence", "Handling allergies and substitutions"] },
  ],
  Bartender: [
    { title: "Signature Cocktails", videos: ["House cocktail builds & specs", "Garnish and glassware standards", "Batching for peak hours"] },
    { title: "Wine & Beer Program", videos: ["Wine list overview", "Draft program & rotation"] },
    { title: "Responsible Service", videos: ["ID verification & refusal of service"] },
  ],
  Kitchen: [
    { title: "Line Setup & Menu Items", videos: ["Mise en place by station", "Cook times & plating standards", "Specials & 86 procedures"] },
    { title: "Allergens & Cross-Contamination", videos: ["Top 9 allergen handling", "Color-coded board protocol"] },
    { title: "Food Safety", videos: ["Cooking & holding temperatures", "Closing checklist"] },
  ],
};

function TrainingProgram({ menuName }: { menuName: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Custom training program</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Generated from <span className="font-medium text-foreground">{menuName}</span></p>
          </div>
          <Badge className="bg-success text-success-foreground hover:bg-success">Ready</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-3">
        {(Object.keys(TRAINING_MODULES) as Array<keyof typeof TRAINING_MODULES>).map((role) => (
          <div key={role} className="rounded-xl border border-border bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">{role}</p>
              <Badge variant="secondary">{TRAINING_MODULES[role].reduce((n, m) => n + m.videos.length, 0)} videos</Badge>
            </div>
            <div className="space-y-3">
              {TRAINING_MODULES[role].map((mod, i) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <p className="text-sm font-semibold">{mod.title}</p>
                  <ul className="mt-2 space-y-1.5">
                    {mod.videos.map((v, j) => (
                      <li key={j} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-primary-soft text-[10px] font-semibold text-primary">{j + 1}</span>
                        <span className="flex-1">{v}</span>
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      </li>
                    ))}
                    <li className="mt-2 flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      Quiz · unlocks after all videos
                    </li>
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SettingsTab({ onOpenSetup }: { onOpenSetup: () => void }) {
  const { setupCompleted, restaurantProfile, resetSetup, restaurantHours, updateRestaurantDay } = useStore();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Restaurant Setup</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {setupCompleted ? (
            <>
              <p className="text-sm text-muted-foreground">Setup completed for <span className="font-medium text-foreground">{restaurantProfile?.name ?? "your restaurant"}</span>.</p>
              <Button variant="outline" onClick={() => { if (window.confirm("Redo setup? This will reset your profile.")) { resetSetup(); onOpenSetup(); } }}>Redo restaurant setup</Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Your restaurant profile is incomplete. Finish setup to unlock your custom training program.</p>
              <Button onClick={onOpenSetup}>Complete your setup</Button>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Restaurant hours</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">AI scheduling only books staff during the hours you're open.</p>
        </CardHeader>
        <CardContent>
          <RestaurantHoursEditor value={restaurantHours} onChange={updateRestaurantDay} />
        </CardContent>
      </Card>
      {setupCompleted && <StaffOnboardingCard />}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: "warn" }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-2 text-3xl font-semibold ${tone === "warn" ? "text-warning" : ""}`}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Avatar({ name, large }: { name: string; large?: boolean }) {
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={`grid place-items-center rounded-full bg-primary-soft font-semibold text-primary ${large ? "h-12 w-12 text-base" : "h-9 w-9 text-xs"}`}>
      {initials}
    </div>
  );
}

function IconHome() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/></svg>; }
function IconUsers() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IconCal() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>; }
function IconSwap() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l-4-4m4 4l4-4"/></svg>; }
