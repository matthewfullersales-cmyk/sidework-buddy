import { createFileRoute } from "@tanstack/react-router";
import { useRequireManagerAccess } from "@/lib/use-require-manager-access";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/sidework/AppShell";
import { SetupWizard } from "@/components/sidework/SetupWizard";
import { ScheduleSection } from "@/components/sidework/ScheduleSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicantPipeline } from "@/components/sidework/ApplicantPipeline";
import { InterviewSlotsCard } from "@/components/sidework/InterviewSlotsCard";
import {
  DEFAULT_INTERVIEW_INTERVAL,
  INTERVIEW_INTERVALS,
  fetchInterviewInterval,
  saveInterviewInterval,
  type InterviewInterval,
} from "@/lib/interview-slots-supabase";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { onboardingStatus, useStore, type Role, type ApplicationStatus, type Employee, type Relationship, DAY_KEYS, hoursConfigured, type JobApplication, type HiringStage, type ShadowShiftDetails, type InterviewType, getHiringStage, isPendingRoleAssignment, isPendingJoin, isArchivedEmployee, isScheduleEligible, sectionForRole } from "@/lib/sidework-store";
import { sendReactivationEmail } from "@/lib/reactivation.functions";
import { roleStyle, fohRolesWithCustom, bohRolesWithCustom, allRolesWithCustom, FOH_ROLES_ORDERED, BOH_ROLES_ORDERED, ROLES_ORDERED, nextCustomColor } from "@/lib/role-colors";
import { defaultDressGroupForRole } from "@/lib/shadow-packet-roles";

import { PhoneInput } from "@/components/ui/phone-input";
import { copyLinkWithToast } from "@/lib/copy-to-clipboard";
import { sendStaffInvite } from "@/lib/staff-invite.functions";
import { loadMyJoinSlug } from "@/lib/restaurant-slug";
import { sendApplicantNotification } from "@/lib/applicant-notifications.functions";
import { notifyTimeOffResolved, notifyScheduleChanged } from "@/lib/notifications.functions";

import { AvailabilityEditor, RestaurantHoursEditor, MealPeriodsEditor, BusinessInfoEditor } from "@/components/sidework/AvailabilityEditor";
import { AvailabilitySummary, hasAnyAvailability } from "@/components/sidework/AvailabilitySummary";
import { fetchShadowPacket, saveShadowPacket, emptyShadowPacket, type ShadowPacket } from "@/lib/employees-supabase";
import { StaffJoinBanner, FullscreenQrDialog, StaffOnboardingCard, useJoinUrl } from "@/components/sidework/StaffOnboarding";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { ChevronDown, Check, CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
// (removed) team-permissions registry — single-login owner model.
import { fetchBookedInterviewSlots } from "@/lib/hiring-supabase";
import { cn, formatTime12h } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";

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


const nav = [
  { to: "/manager", label: "Dashboard", icon: <IconHome /> },
  { to: "/manager/team", label: "Team", icon: <IconUsers /> },
  { to: "/manager/schedule", label: "Schedule", icon: <IconCal /> },
  { to: "/manager/trades", label: "Trades", icon: <IconSwap /> },
];

export const Route = createFileRoute("/manager")({
  ssr: false,
  head: () => ({ meta: [{ title: "Manager Dashboard — 86Paper" }] }),
  component: ManagerPage,
});

function ManagerPage() {
  const { setupCompleted, restaurantProfile, resetSetup, currentUser, setCurrentUser } = useStore();
  const [tab, setTab] = useState("dashboard");
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const { checking } = useRequireManagerAccess("/login");
  useEffect(() => {
    if (currentUser.type !== "manager") {
      setCurrentUser({ type: "manager", id: "owner" });
    }
  }, [currentUser, setCurrentUser]);

  if (checking) {
    return (
      <AppShell nav={nav}>
        <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  if (showSetupWizard) {
    return (
      <SetupWizard
        onComplete={() => {
          setShowSetupWizard(false);
          setTab("dashboard");
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
              <p className="text-sm text-muted-foreground">Finish setting up your restaurant profile and roles.</p>
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
      <TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 md:grid-cols-7">
        <TabsTrigger value="dashboard">Overview</TabsTrigger>
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
  const { employees: allEmployees, customRoles, trades, shifts, applications, timeOff } = useStore();
  // Pending self-joins don't count as staff until the owner approves them.
  const employees = useMemo(() => allEmployees.filter((e) => !isPendingJoin(e)), [allEmployees]);
  const stats = useMemo(() => {
    const onboarded = employees.filter((e) => onboardingStatus(e, customRoles).fullyOnboarded).length;

    const pending = trades.filter((t) => t.status === "pending_approval").length;
    const newApps = applications.filter((a) => a.status === "new").length;
    const pendingTO = timeOff.filter((t) => t.status === "pending").length;
    return { onboarded, total: employees.length, pending, newApps, pendingTO, shifts: shifts.length };

  }, [employees, customRoles, trades, shifts, applications, timeOff]);

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
            const s = onboardingStatus(e, customRoles);
            return (
              <div key={e.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Avatar name={e.name} />
                    <span className="font-medium">{e.name}</span>
                    <Badge style={roleStyle(e.primaryRole)} className="border-transparent">{e.primaryRole}</Badge>
                    {s.fullyOnboarded && <Badge className="bg-success text-success-foreground hover:bg-success">Onboarded</Badge>}
                  </div>
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

// Manager activity feed. Training/menu-test messages are filtered OUT at
// render (their generators stay in place but are inert / dormant).
const TRAINING_NOISE = /\b(training|test|tests|quiz|quizzes|menu knowledge)\b/i;

function NotificationsCard() {
  const { notifications, markNotificationsRead } = useStore();
  const visible = useMemo(
    () => notifications.filter((n) => !TRAINING_NOISE.test(n.message)),
    [notifications],
  );
  const recent = visible.slice(0, 6);
  const unread = visible.filter((n) => !n.read).length;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Recent activity</CardTitle>
          {unread > 0 && <Badge className="bg-primary text-primary-foreground hover:bg-primary">{unread} new</Badge>}
        </div>
        {unread > 0 && (
          <Button variant="ghost" size="sm" onClick={markNotificationsRead}>Mark all read</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {recent.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing yet. Activity from your team shows up here.</p>
        )}
        {recent.map((n) => (
          <div
            key={n.id}
            className={`flex items-start gap-3 rounded-lg border border-border p-3 ${!n.read ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-card text-sm font-bold">•</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{n.message}</p>
              <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}



function PendingRoleAssignmentQueue({
  employees,
  activeRoles,
  customRoles,
  onAssign,
}: {
  employees: Employee[];
  activeRoles: Role[];
  customRoles: import("@/lib/sidework-store").CustomRole[];
  onAssign: (id: string, role: Role) => void;
}) {
  const pending = employees.filter(isPendingRoleAssignment);
  const roleChoices = allRolesWithCustom(customRoles).filter((r) => activeRoles.includes(r));
  const [drafts, setDrafts] = useState<Record<string, Role>>({});
  if (pending.length === 0) return null;
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Pending role assignment
          <span className="ml-2 text-xs font-normal text-muted-foreground">{pending.length} waiting</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          These employees finished self-onboarding but need a role assigned before you can schedule them.
        </p>
        {pending.map((e) => {
          const draft = drafts[e.id] ?? roleChoices[0] ?? "Server";
          const fullName = e.firstName && e.lastName ? `${e.firstName} ${e.lastName}` : e.name;
          return (
            <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{fullName}</p>
                <p className="text-xs text-muted-foreground truncate">{e.email}{e.phone ? ` · ${e.phone}` : ""}</p>
              </div>
              <Select value={draft} onValueChange={(v) => setDrafts((d) => ({ ...d, [e.id]: v as Role }))}>
                <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Pick a role" /></SelectTrigger>
                <SelectContent>
                  {roleChoices.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => onAssign(e.id, draft)} disabled={!draft}>Assign role</Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}


function PendingJoinRequestsQueue({
  employees,
  onApprove,
  onDecline,
}: {
  employees: Employee[];
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  const pending = employees.filter(isPendingJoin);
  if (pending.length === 0) return null;
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Join requests
          <span className="ml-2 text-xs font-normal text-muted-foreground">{pending.length} waiting</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          These people signed up through your public join link. They can't be scheduled and don't count toward your
          team until you approve them.
        </p>
        {pending.map((e) => {
          const fullName = e.firstName && e.lastName ? `${e.firstName} ${e.lastName}` : e.name;
          return (
            <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{fullName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {e.email}{e.phone ? ` · ${e.phone}` : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {e.primaryRole ? `Wants to join as ${e.primaryRole}` : "No role yet — assign one after approving"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onApprove(e.id)}>Approve</Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:border-destructive/50 hover:bg-destructive/5 hover:text-destructive"
                  onClick={() => onDecline(e.id)}
                >
                  Decline
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TeamTab() {
  const { employees: allEmployees, inviteEmployee, restaurantProfile, activeRoles, customRoles, shifts, trades, timeOff, updateEmployee, approveJoinRequest, declineJoinRequest, archiveEmployee, reactivateEmployee } = useStore();
  const pendingJoins = useMemo(() => allEmployees.filter(isPendingJoin), [allEmployees]);
  const [showArchived, setShowArchived] = useState(false);
  const employees = useMemo(
    () => allEmployees.filter((e) => !isPendingJoin(e) && (showArchived ? isArchivedEmployee(e) : !isArchivedEmployee(e))),
    [allEmployees, showArchived],
  );

  const fohActive = fohRolesWithCustom(customRoles).filter((r) => activeRoles.includes(r));
  const bohActive = bohRolesWithCustom(customRoles).filter((r) => activeRoles.includes(r));
  const [open, setOpen] = useState(false);
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", role: "Server" as Role });
  const [sending, setSending] = useState(false);

  const [editing, setEditing] = useState<Employee | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Employee | null>(null);

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
      const isFoh = sectionForRole(role, customRoles) === "FOH";
      const status = onboardingStatus(e, customRoles);
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
    const pctOf = (e: Employee) => onboardingStatus(e, customRoles).pct;
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
  }, [employees, customRoles, filters, sortKey]);

  const { url: joinUrl, ready: joinReady } = useJoinUrl();
  const copyJoinLink = () => {
    if (!joinReady) {
      toast.error("Set your restaurant name first", { description: "Your join link is generated from it." });
      return;
    }
    copyLinkWithToast(joinUrl, "Join link copied");
  };



  return (
    <div className="space-y-4">
      <StaffJoinBanner onShowQr={() => setShowQr(true)} />
      <PendingJoinRequestsQueue
        employees={pendingJoins}
        onApprove={(id) => { approveJoinRequest(id); toast.success("Approved — they're on your team"); }}
        onDecline={(id) => { declineJoinRequest(id); toast.success("Join request declined"); }}
      />
      <PendingRoleAssignmentQueue
        employees={employees}
        activeRoles={activeRoles}
        customRoles={customRoles}
        onAssign={(id, role) => {
          updateEmployee(id, { primaryRole: role, approvedRoles: [role] });
          toast.success("Role assigned");
        }}
      />


      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant={showArchived ? "default" : "outline"}
          className="min-h-11"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "Back to active" : "Show archived"}
        </Button>
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
                  ...FOH_ROLES_ORDERED.map((r) => ({ key: r, label: r })),
                  ...BOH_ROLES_ORDERED.map((r) => ({ key: r, label: r })),
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
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2"><Label>First name</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoComplete="given-name" /></div>
                <div className="grid gap-2"><Label>Last name</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} autoComplete="family-name" /></div>
              </div>
              <div className="grid gap-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" /></div>
              <div className="grid gap-2"><Label>Phone <span className="text-xs font-normal text-muted-foreground">(optional — used to text the invite)</span></Label>
                <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              </div>
              <div className="grid gap-2">
                <Label>Primary role</Label>
                <Select value={form.role} onValueChange={(v: Role) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Front of House</SelectLabel>
                      {fohActive.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Back of House</SelectLabel>
                      {bohActive.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                We'll email them a personal invite link so they can finish their own profile (availability, emergency contact, password). A copy-link fallback is always shown.
              </p>
            </div>
            <DialogFooter>
              <Button
                disabled={sending}
                onClick={async () => {
                  if (!form.firstName.trim() || !form.lastName.trim()) return toast.error("First and last name required");
                  if (!form.email.trim()) return toast.error("Email required");
                  setSending(true);
                  try {
                    const invite = await inviteEmployee({
                      firstName: form.firstName.trim(),
                      lastName: form.lastName.trim(),
                      email: form.email.trim(),
                      phone: form.phone.trim(),
                      role: form.role,
                    });
                    // Prefer the store's name, but fall back to the owner's persisted
                    // restaurant profile — the local store can be empty after a reset
                    // or on a new device, which previously sent "your team" as the name.
                    const storeName = restaurantProfile?.name?.trim();
                    const slug = storeName ? undefined : await loadMyJoinSlug();
                    const restaurantName =
                      storeName || slug?.restaurantName?.trim() || "";
                    let emailOk = false;
                    let emailErr: string | undefined;
                    try {
                      const res = await sendStaffInvite({ data: {
                        inviteUrl: invite.inviteUrl,
                        firstName: form.firstName.trim(),
                        restaurantName,
                        email: form.email.trim(),
                        phoneDigits: form.phone.replace(/\D/g, ""),
                        senderName: restaurantName,
                      }});
                      emailOk = res.email.ok;
                      emailErr = res.email.error;
                    } catch (e) {
                      console.error("[sendStaffInvite]", e);
                    }
                    const summary = emailOk
                      ? `Invite emailed to ${form.firstName.trim()}`
                      : `Invite created for ${form.firstName.trim()}`;
                    const problems = !emailOk && form.email.trim()
                      ? `email failed${emailErr ? `: ${emailErr}` : ""}`
                      : "";
                    toast.success(summary, {
                      description: `${problems ? problems + " — " : ""}Copy backup link: ${invite.inviteUrl}`,
                      duration: 10000,
                    });
                    copyLinkWithToast(invite.inviteUrl, "Invite link copied");
                    setOpen(false);
                    setForm({ firstName: "", lastName: "", email: "", phone: "", role: "Server" });
                  } finally {
                    setSending(false);
                  }
                }}
              >{sending ? "Sending…" : "Send invite"}</Button>
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
                    {isPendingRoleAssignment(e) ? (
                      <Badge variant="secondary" className="bg-muted text-foreground">Pending role</Badge>
                    ) : isScheduleEligible(e) ? (
                      <Badge className="bg-success text-success-foreground hover:bg-success">Schedule eligible</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Weekly availability</p>
                    {hasAnyAvailability(e.weeklyAvailability) ? (
                      <div className="mt-2">
                        <AvailabilitySummary value={e.weeklyAvailability} />
                      </div>
                    ) : (
                      <p className="mt-2 text-sm italic text-muted-foreground">Not set</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Emergency contact</p>
                    {e.emergencyContact ? (
                      <div className="mt-1 text-sm">
                        <p className="font-medium">{`${e.emergencyContact.firstName ?? ""} ${e.emergencyContact.lastName ?? ""}`.trim() || "—"} <span className="text-xs text-muted-foreground">· {e.emergencyContact.relationship}</span></p>
                        <a href={`tel:${e.emergencyContact.phone}`} className="text-xs text-primary underline">{e.emergencyContact.phone}</a>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Not on file</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(e)}>Edit profile</Button>
                  {!showArchived ? (
                    <Button size="sm" variant="outline" onClick={() => setConfirmArchive(e)}>Archive</Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={async () => {
                        const displayName = e.firstName ?? e.name;
                        await reactivateEmployee(e.id);
                        let emailOk = false;
                        let emailErr: string | undefined;
                        try {
                          const res = await sendReactivationEmail({ data: {
                            email: e.email,
                            firstName: e.firstName ?? e.name,
                            restaurantName: restaurantProfile?.name ?? "",
                            signInUrl: `${window.location.origin}/login`,
                            senderName: restaurantProfile?.name ?? "86Paper",
                          }});
                          emailOk = res.email.ok;
                          emailErr = res.email.error;
                        } catch (err) {
                          console.error("[sendReactivationEmail]", err);
                          emailErr = err instanceof Error ? err.message : String(err);
                        }
                        if (emailOk) {
                          toast.success(`${displayName} reactivated — welcome-back email sent`, { duration: 10000 });
                        } else {
                          toast.warning(`${displayName} reactivated`, {
                            description: `welcome-back email failed${emailErr ? `: ${emailErr}` : ""}`,
                            duration: 10000,
                          });
                        }
                      }}
                    >
                      Reactivate
                    </Button>
                  )}
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
      <Dialog open={!!confirmArchive} onOpenChange={(o) => { if (!o) setConfirmArchive(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Archive employee?</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2 text-sm text-muted-foreground">
            <p>
              Archive <span className="font-semibold text-foreground">{confirmArchive ? (confirmArchive.firstName && confirmArchive.lastName ? `${confirmArchive.firstName} ${confirmArchive.lastName}` : confirmArchive.name) : ""}</span>? They'll drop off the schedule until you reactivate them. Nothing about their record is deleted.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmArchive(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!confirmArchive) return;
                const displayName = confirmArchive.firstName && confirmArchive.lastName ? `${confirmArchive.firstName} ${confirmArchive.lastName}` : confirmArchive.name;
                archiveEmployee(confirmArchive.id);
                setConfirmArchive(null);
                toast.success(`${displayName} archived`);
              }}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmployeeProfileDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { updateEmployee, deleteEmployeeRecord, activeRoles, customRoles, mealPeriods } = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const displayName = employee.firstName && employee.lastName ? `${employee.firstName} ${employee.lastName}` : employee.name;
  const fohActive = fohRolesWithCustom(customRoles).filter((r) => activeRoles.includes(r) || employee.approvedRoles.includes(r));
  const bohActive = bohRolesWithCustom(customRoles).filter((r) => activeRoles.includes(r) || employee.approvedRoles.includes(r));
  const [firstName, setFirstName] = useState(employee.firstName ?? employee.name.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(employee.lastName ?? employee.name.split(" ").slice(1).join(" ") ?? "");
  const [email, setEmail] = useState(employee.email);
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [approvedRoles, setApprovedRoles] = useState<Role[]>(employee.approvedRoles);
  const [autoApprove, setAutoApprove] = useState<Role[]>(employee.autoApproveRoles);
  const [weekly, setWeekly] = useState(employee.weeklyAvailability);
  const [ec, setEc] = useState<{ firstName: string; lastName: string; phone: string; relationship: Relationship }>({
    firstName: employee.emergencyContact?.firstName ?? "",
    lastName: employee.emergencyContact?.lastName ?? "",
    phone: employee.emergencyContact?.phone ?? "",
    relationship: employee.emergencyContact?.relationship ?? "Other",
  });

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
      emergencyContact: (ec.firstName || ec.lastName || ec.phone) ? { firstName: ec.firstName.trim(), lastName: ec.lastName.trim(), phone: ec.phone.trim(), relationship: ec.relationship } : undefined,
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
            <div className="grid gap-1.5"><Label>Phone</Label><PhoneInput value={phone} onChange={setPhone} /></div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Approved roles</Label>
            <div className="mt-2 space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Front of House</p>
                <div className="flex flex-wrap gap-2">
                  {fohActive.map((r) => {
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
                  {bohActive.map((r) => {
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
              <div className="grid gap-1.5"><Label>First name</Label><Input value={ec.firstName} onChange={(e) => setEc({ ...ec, firstName: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Last name</Label><Input value={ec.lastName} onChange={(e) => setEc({ ...ec, lastName: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Phone</Label><PhoneInput value={ec.phone} onChange={(v) => setEc({ ...ec, phone: v })} /></div>
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

          <div className="border-t border-border pt-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              Delete employee
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Delete {displayName} permanently?</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2 text-sm text-muted-foreground">
            <p>
              Their shift, trade, and time-off history will stay on record but will no longer show their name — this doesn't delete that history, it just orphans it. This can't be undone.
            </p>
            <p>
              If you want them off the schedule but might bring them back, use Archive instead from the Team list — Cancel this and close the dialog to do that.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await deleteEmployeeRecord(employee.id);
                  setConfirmDelete(false);
                  onClose();
                  toast.success(`${displayName} deleted`);
                } catch (err) {
                  console.error("[deleteEmployeeRecord]", err);
                  toast.error(`Couldn't delete ${displayName}`, {
                    description: err instanceof Error ? err.message : String(err),
                  });
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            {shift?.role} · {shift?.date} · {formatTime12h(shift?.start)} – {formatTime12h(shift?.end)}
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
  // Simplest available refresh channel: both cards are siblings here, so a
  // counter bumped by the pipeline makes the slots card re-read.
  const [slotRefresh, setSlotRefresh] = useState(0);
  const [pipelineRefresh, setPipelineRefresh] = useState(0);
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
    activeRoles,
    customRoles,
  } = useStore();
  const fohActive = fohRolesWithCustom(customRoles).filter((r) => activeRoles.includes(r));
  const bohActive = bohRolesWithCustom(customRoles).filter((r) => activeRoles.includes(r));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", role: "Server" as Role, type: "Full-time" as "Full-time" | "Part-time", payRange: "", description: "" });
  const [hireFor, setHireFor] = useState<string | null>(null);
  const [pickTypeFor, setPickTypeFor] = useState<string | null>(null);
  const [approveFor, setApproveFor] = useState<{ id: string; type: InterviewType } | null>(null);
  const [callFor, setCallFor] = useState<string | null>(null);
  const [shadowFor, setShadowFor] = useState<string | null>(null);
  const [declineConfirmFor, setDeclineConfirmFor] = useState<{ id: string; postInterview?: boolean } | null>(null);

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

  const copyApplicationLink = (jobId: string) => {
    copyLinkWithToast(`${window.location.origin}/careers?job=${jobId}`, "Application link copied");
  };

  // Sends the applicant-facing link via email (Resend). Surfaces a copy-link
  // fallback in the toast so the manager can share it manually if email fails.
  const notifyApplicant = async (args: {
    kind: "interview_offer" | "shadow_invite" | "hire_signup";
    app: JobApplication;
    link: string;
    successVerb: string; // e.g. "Interview invite"
    extra?: { slotCount?: number; shadowDate?: string; shadowTime?: string };
  }) => {
    const name = args.app.firstName ?? args.app.name ?? "applicant";
    let emailOk = false;
    let emailErr: string | undefined;
    let emailAttempted = false;
    try {
      const res = await sendApplicantNotification({ data: {
        kind: args.kind,
        link: args.link,
        firstName: args.app.firstName ?? args.app.name ?? "",
        restaurantName,
        email: args.app.email ?? "",
        phoneDigits: (args.app.phone ?? "").replace(/\D/g, ""),
        slotCount: args.extra?.slotCount,
        shadowDate: args.extra?.shadowDate,
        shadowTime: args.extra?.shadowTime,
      }});
      emailOk = res.email.ok;
      emailErr = res.email.error;
      emailAttempted = res.email.attempted;
    } catch (e) {
      console.error("[notifyApplicant]", e);
    }
    const problems: string[] = [];
    if (emailAttempted && !emailOk) problems.push(`email failed${emailErr ? `: ${emailErr}` : ""}`);
    if (!emailAttempted) problems.push("no email on file");
    const isFailure = !emailOk;
    const title = emailOk
      ? `${args.successVerb} emailed to ${name}`
      : `${args.successVerb} ready for ${name} — send link manually`;
    const notify = isFailure ? toast.warning : toast.success;
    notify(title, {
      description: `${problems.length ? problems.join(" · ") + " — " : ""}Backup link: ${args.link}`,
      duration: 12000,
      action: {
        label: "Copy link",
        onClick: () => copyLinkWithToast(args.link, "Link copied"),
      },
    });
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
                          {fohActive.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectGroup>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Back of House</SelectLabel>
                          {bohActive.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
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
                    <Button size="sm" variant="outline" onClick={() => toggleJobOpen(j.id)}>{j.open ? "Close" : "Reopen"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { removeJob(j.id); toast.message("Job removed"); }}>Delete</Button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Share this link on Indeed, Instagram, or anywhere you recruit.</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <InterviewSlotsCard refreshKey={slotRefresh} onInterviewChange={() => setPipelineRefresh((n) => n + 1)} />

      <ApplicantPipeline refreshKey={pipelineRefresh} onInterviewChange={() => setSlotRefresh((n) => n + 1)} />
    </div>
  );
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
          <p className="text-xs text-muted-foreground">{t.startDate} → {t.endDate}</p>
        </div>
        {t.status === "pending" ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              resolveTimeOff(t.id, false);
              toast.message("Denied");
              const dateLabel = t.startDate === t.endDate ? t.startDate : `${t.startDate} → ${t.endDate}`;
              if (/^[0-9a-f-]{36}$/i.test(t.employeeId)) {
                notifyTimeOffResolved({ data: { employeeId: t.employeeId, approved: false, dateLabel } })
                  .catch((err: unknown) => console.error("[notifyTimeOffResolved]", err));
              }
            }}>Deny</Button>
            <Button size="sm" onClick={() => {
              resolveTimeOff(t.id, true);
              toast.success("Approved");
              const dateLabel = t.startDate === t.endDate ? t.startDate : `${t.startDate} → ${t.endDate}`;
              if (/^[0-9a-f-]{36}$/i.test(t.employeeId)) {
                notifyTimeOffResolved({ data: { employeeId: t.employeeId, approved: true, dateLabel } })
                  .catch((err: unknown) => console.error("[notifyTimeOffResolved]", err));
              }
            }}>Approve</Button>
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


/**
 * Roles editor. Storage stays INVERTED: we persist the exceptions
 * (disabledRoles), never a snapshot of the built-in list. Turning a role off
 * NUDGES when people are assigned to it — it never blocks, and never strips
 * anyone's existing role.
 */
function RolesCard() {
  const { disabledRoles, customRoles, employees, setDisabledRoles, addCustomRole, removeCustomRole } = useStore();
  const [draft, setDraft] = useState("");
  const [section, setSection] = useState<"FOH" | "BOH">("FOH");

  const off = useMemo(
    () => new Set(disabledRoles.map((r) => r.trim().toLowerCase())),
    [disabledRoles],
  );
  const isOn = (role: string) => !off.has(role.trim().toLowerCase());

  const assignedCount = (role: string) => {
    const key = role.trim().toLowerCase();
    return employees.filter(
      (e) =>
        e.primaryRole?.trim().toLowerCase() === key ||
        (e.approvedRoles ?? []).some((r) => r.trim().toLowerCase() === key),
    ).length;
  };

  const toggle = (role: string, on: boolean) => {
    if (!on) {
      const n = assignedCount(role);
      if (n > 0) {
        toast.warning(`${n} ${n === 1 ? "person is" : "people are"} assigned to ${role}`, {
          description: "They keep the position — it just won't be offered for new assignments.",
        });
      }
    }
    const next = on
      ? disabledRoles.filter((r) => r.trim().toLowerCase() !== role.trim().toLowerCase())
      : [...disabledRoles, role];
    setDisabledRoles(Array.from(new Set(next)));
  };

  const addRole = () => {
    const name = draft.trim();
    if (!name) return;
    const key = name.toLowerCase();
    const clash =
      ROLES_ORDERED.some((r) => r.toLowerCase() === key) ||
      customRoles.some((c) => c.name.trim().toLowerCase() === key);
    if (clash) {
      toast.error("That position already exists.");
      return;
    }
    addCustomRole({ name, section, color: nextCustomColor(customRoles) });
    setDraft("");
  };

  const group = (label: string, list: readonly string[]) => (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {list.map((role) => (
          <label
            key={role}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: roleStyle(role as Role).backgroundColor }} />
              {role}
            </span>
            <Switch checked={isOn(role)} onCheckedChange={(v) => toggle(role, v === true)} aria-label={role} />
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Positions</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Turn off the positions your restaurant doesn't staff, and add your own. Anyone already assigned a position keeps it.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {group("Front of house", FOH_ROLES_ORDERED)}
        {group("Back of house", BOH_ROLES_ORDERED)}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your own positions</p>
          {customRoles.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {customRoles.map((c) => (
                <div key={c.name} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                    <span className="text-xs text-muted-foreground">{c.section}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => removeCustomRole(c.name)}>Remove</Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRole(); } }}
              placeholder="Add your own position"
              className="min-w-[12rem] flex-1"
            />
            <Select value={section} onValueChange={(v) => setSection(v as "FOH" | "BOH")}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FOH">FOH</SelectItem>
                <SelectItem value="BOH">BOH</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addRole} disabled={!draft.trim()}>Add</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsTab({ onOpenSetup }: { onOpenSetup: () => void }) {
  const { setupCompleted, restaurantProfile, resetSetup, restaurantHours, updateRestaurantDay, mealPeriods, updateMealPeriod, businessInfo, setBusinessInfo } = useStore();
  const configured = hoursConfigured(restaurantHours, mealPeriods);


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
              <p className="text-sm text-muted-foreground">Your restaurant profile is incomplete. Finish setup to get your restaurant running.</p>
              <Button onClick={onOpenSetup}>Complete your setup</Button>
            </>
          )}
        </CardContent>
      </Card>
      {!configured && (
        <div role="status" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          <p className="font-semibold">Finish setting your operating hours</p>
          <p className="mt-1 text-xs">Turn on the meal periods you actually serve (Breakfast / Lunch / Dinner) and confirm your daily open hours. Scheduling and employee availability rely on these to match staff to real service windows.</p>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meal periods</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Turn on the services you offer and set their real start/end times. Employees' partial-availability (e.g. "Lunch only") is matched against these windows — not fixed clock cutoffs.</p>
        </CardHeader>
        <CardContent>
          <MealPeriodsEditor
            value={mealPeriods}
            onChange={updateMealPeriod}
            restaurantHours={restaurantHours}
            onHoursAutofill={(day, patch) => updateRestaurantDay(day, patch)}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily hours</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Toggling a meal period proposes hours covering all enabled periods — these are suggestions you can freely edit, and your own edits are never overwritten. Mark a day closed if you don't operate that day.</p>
        </CardHeader>
        <CardContent>
          <RestaurantHoursEditor value={restaurantHours} onChange={updateRestaurantDay} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Restaurant info</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Business address, phone, website, and social handles. Shown on public-facing surfaces (careers page, hire invites) so applicants and new hires know how to reach you.</p>
        </CardHeader>
        <CardContent>
          <BusinessInfoEditor value={businessInfo} onChange={setBusinessInfo} />
        </CardContent>
      </Card>
      <InterviewLengthCard />
      <ShadowPacketCard />
      <RolesCard />
      {setupCompleted && <StaffOnboardingCard />}
    </div>
  );
}

function InterviewLengthCard() {
  const { effectiveOwner } = useAuth();
  const ownerId = effectiveOwner?.ownerId ?? null;
  const [minutes, setMinutes] = useState<InterviewInterval>(DEFAULT_INTERVIEW_INTERVAL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    fetchInterviewInterval(ownerId)
      .then((v) => { if (!cancelled) setMinutes(v); })
      .catch((e) => console.error("[interview length] load failed", e));
    return () => { cancelled = true; };
  }, [ownerId]);

  const pick = async (v: InterviewInterval) => {
    if (!ownerId) return;
    const prev = minutes;
    setMinutes(v);
    setSaving(true);
    try {
      await saveInterviewInterval(ownerId, v);
      toast.success(`Interviews are ${v} minutes`);
    } catch (e) {
      console.error("[interview length] save failed", e);
      setMinutes(prev);
      toast.error("Couldn't save that");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Interviews</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">How long one interview takes. This only decides how a block of open time is split into slots — it doesn't block anything.</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {INTERVIEW_INTERVALS.map((v) => (
            <Button
              key={v}
              size="sm"
              variant={minutes === v ? "default" : "outline"}
              disabled={saving}
              onClick={() => void pick(v)}
            >
              {v} min
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ShadowPacketCard() {
  const { effectiveOwner } = useAuth();
  const ownerId = effectiveOwner?.ownerId ?? null;
  const [packet, setPacket] = useState<ShadowPacket>(emptyShadowPacket);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    fetchShadowPacket(ownerId)
      .then((p) => { if (!cancelled) { setPacket(p); setLoaded(true); } })
      .catch((e) => { console.error("[shadow packet] load failed", e); if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [ownerId]);

  const { activeRoles, customRoles } = useStore();
  const roleChoices = allRolesWithCustom(customRoles).filter((r) => activeRoles.includes(r));

  const set = (patch: Partial<ShadowPacket>) => setPacket((p) => ({ ...p, ...patch }));
  const setDress = (section: "foh" | "host" | "boh", field: "wear" | "provided", value: string) =>
    setPacket((p) => ({ ...p, dress: { ...p.dress, [section]: { ...p.dress[section], [field]: value } } }));
  const setBring = (section: "foh" | "boh", value: string) =>
    setPacket((p) => ({ ...p, bring: { ...p.bring, [section]: value } }));
  const setDoing = (role: string, value: string) =>
    setPacket((p) => ({ ...p, doing: { ...p.doing, [role]: value } }));
  // Only explicit overrides are stored: choosing the derived default removes the key.
  const setDressGroup = (role: string, value: "foh" | "host" | "boh", derived: string) =>
    setPacket((p) => {
      const next = { ...p.dressGroup };
      if (value === derived) delete next[role];
      else next[role] = value;
      return { ...p, dressGroup: next };
    });


  const save = async () => {
    if (!ownerId) return;
    setSaving(true);
    try {
      await saveShadowPacket(ownerId, packet);
      toast.success("Shadow shift packet saved");
    } catch (e) {
      console.error("[shadow packet] save failed", e);
      toast.error("Couldn't save the shadow shift packet");
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: { placeholder?: string; hint?: string },
  ) => (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {opts?.hint && <p className="text-xs text-muted-foreground">{opts.hint}</p>}
      <Textarea
        rows={3}
        value={value}
        placeholder={opts?.placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={!loaded}
      />
    </div>
  );

  const blankDress =
    !packet.dress.foh.wear.trim() && !packet.dress.foh.provided.trim()
      ? "front of house"
      : !packet.dress.boh.wear.trim() && !packet.dress.boh.provided.trim()
        ? "back of house"
        : null;
  const nudges: string[] = [];
  if (loaded && !packet.entrance.trim()) nudges.push("Trainees won't be told where to come in.");
  if (loaded && blankDress) nudges.push(`Trainees in ${blankDress} roles won't be told what to wear.`);
  if (loaded && !packet.askFor.trim()) nudges.push("Trainees won't be told who to ask for.");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Shadow shift packet</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Arrival and dress info written once here and sent to anyone coming in for a shadow shift.
          Fill in only what applies — anything left blank is simply left out.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {nudges.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
            {nudges.map((n) => (
              <p key={n} className="text-xs text-muted-foreground">{n}</p>
            ))}
            <p className="mt-1 text-xs text-muted-foreground">You can still save — this is just a heads up.</p>
          </div>
        )}
        <div className="space-y-3">
          <p className="text-sm font-medium">Arrival</p>
          {field("Where to enter", packet.entrance, (v) => set({ entrance: v }), {
            placeholder: "e.g. the side door by the patio, marked Staff",
          })}
          {field(
            "Back of house entrance (optional override)",
            packet.entranceBoh,
            (v) => set({ entranceBoh: v }),
            {
              hint: "Leave blank if everyone uses the main entrance above.",
              placeholder: "e.g. the kitchen door off the back alley",
            },
          )}
          {field("Where to park", packet.parking, (v) => set({ parking: v }), {
            placeholder: "e.g. the lot across the street, not the front spaces",
          })}
          {field("Who to ask for when you arrive", packet.askFor, (v) => set({ askFor: v }), {
            placeholder: "e.g. ask the host for the manager on duty",
          })}
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Front of house dress</p>
          {field("What to wear", packet.dress.foh.wear, (v) => setDress("foh", "wear", v), {
            placeholder: "e.g. black non-slip shoes, black pants, white button-down",
          })}
          {field("What we provide", packet.dress.foh.provided, (v) => setDress("foh", "provided", v), {
            placeholder: "e.g. we provide the apron and name tag",
          })}
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Host dress</p>
          <p className="text-xs text-muted-foreground">Leave blank if hosts follow the front of house dress.</p>
          {field("What to wear", packet.dress.host.wear, (v) => setDress("host", "wear", v), {
            placeholder: "e.g. black non-slip shoes, black pants, white button-down",
          })}
          {field("What we provide", packet.dress.host.provided, (v) => setDress("host", "provided", v), {
            placeholder: "e.g. we provide the apron and name tag",
          })}
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium">Back of house dress</p>
          {field("What to wear", packet.dress.boh.wear, (v) => setDress("boh", "wear", v), {
            placeholder: "e.g. non-slip shoes, black pants, plain black t-shirt",
          })}
          {field("What we provide", packet.dress.boh.provided, (v) => setDress("boh", "provided", v), {
            placeholder: "e.g. we provide the apron and chef coat",
          })}
        </div>
        <div className="space-y-3 border-t border-border pt-5">
          <p className="text-sm font-medium">What to bring</p>
          <p className="text-xs text-muted-foreground">Blank means nothing special. Front of house wording is also used for hosts.</p>
          {field("Front of house", packet.bring.foh, (v) => setBring("foh", v), {
            placeholder: "e.g. non-slip shoes, a pen, black pants",
          })}
          {field("Back of house", packet.bring.boh, (v) => setBring("boh", v), {
            placeholder: "e.g. non-slip shoes, your knives if you have them",
          })}
        </div>
        {roleChoices.length > 0 && (
          <div className="space-y-3 border-t border-border pt-5">
            <p className="text-sm font-medium">By role</p>
            <p className="text-xs text-muted-foreground">
              Optional. The line is shown only to trainees shadowing that role. Dress decides which block of dress
              text they see.

            </p>
            {roleChoices.map((r) => {
              const derived = defaultDressGroupForRole(r, customRoles);
              const current = packet.dressGroup[r] ?? derived;
              return (
                <div key={r} className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>{r}</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Dress</span>
                      <Select
                        value={current}
                        onValueChange={(v) => setDressGroup(r, v as "foh" | "host" | "boh", derived)}
                        disabled={!loaded}
                      >
                        <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="foh">Front of house dress</SelectItem>
                          <SelectItem value="host">Host dress</SelectItem>
                          <SelectItem value="boh">Back of house dress</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Textarea
                    rows={2}
                    placeholder="What they'll be doing"
                    value={packet.doing[r] ?? ""}
                    onChange={(e) => setDoing(r, e.target.value)}
                    disabled={!loaded}
                  />
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={save} disabled={!loaded || saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </CardContent>
    </Card>
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

