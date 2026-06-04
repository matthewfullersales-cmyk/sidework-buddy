import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/sidework/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { onboardingStatus, useStore, type Role } from "@/lib/sidework-store";
import { toast } from "sonner";

const ROLES: Role[] = ["Server", "Bartender", "Kitchen", "Host"];

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

function ManagerPage() {
  const [tab, setTab] = useState("dashboard");
  return (
    <AppShell nav={nav.map(n => ({ ...n, to: "/manager" }))}>
      <PageHeader title="Manager Dashboard" subtitle="Onboarding, schedule, and trades at a glance." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">Overview</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><OverviewTab /></TabsContent>
        <TabsContent value="team"><TeamTab /></TabsContent>
        <TabsContent value="schedule"><ScheduleTab /></TabsContent>
        <TabsContent value="trades"><TradesTab /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function OverviewTab() {
  const { employees, videos, trades, shifts } = useStore();
  const stats = useMemo(() => {
    const onboarded = employees.filter((e) => onboardingStatus(e, videos).fullyOnboarded).length;
    const pending = trades.filter((t) => t.status === "pending_approval").length;
    const open = trades.filter((t) => t.status === "open").length;
    return { onboarded, total: employees.length, pending, open, shifts: shifts.length };
  }, [employees, videos, trades, shifts]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Team" value={`${stats.onboarded}/${stats.total}`} hint="Fully onboarded" />
        <Stat label="Pending trades" value={stats.pending} hint="Need your approval" tone={stats.pending > 0 ? "warn" : undefined} />
        <Stat label="Open trades" value={stats.open} hint="On the board" />
        <Stat label="Shifts this week" value={stats.shifts} hint="Scheduled" />
      </div>
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
                    <Badge variant="secondary">{e.primaryRole}</Badge>
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

function TeamTab() {
  const { employees, videos, inviteEmployee, updateEmployee } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "Server" as Role });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>+ Invite employee</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite a new employee</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2"><Label>Full name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="grid gap-2">
                <Label>Primary role</Label>
                <Select value={form.role} onValueChange={(v: Role) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
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
      <div className="grid gap-4">
        {employees.map((e) => {
          const s = onboardingStatus(e, videos);
          return (
            <Card key={e.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={e.name} large />
                    <div>
                      <p className="font-semibold">{e.name}</p>
                      <p className="text-sm text-muted-foreground">{e.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Primary: {e.primaryRole} · Availability: {e.availability || "—"}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {s.fullyOnboarded
                      ? <Badge className="bg-success text-success-foreground hover:bg-success">Fully onboarded</Badge>
                      : <Badge variant="secondary">In progress · {s.pct}%</Badge>}
                    <p className="mt-1 text-xs text-muted-foreground">{s.passed}/{s.total} videos passed</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approved for roles</p>
                    <div className="flex flex-wrap gap-2">
                      {ROLES.map((r) => {
                        const checked = e.approvedRoles.includes(r);
                        return (
                          <label key={r} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1 text-sm ${checked ? "border-primary bg-primary-soft" : "border-border"}`}>
                            <Checkbox checked={checked} onCheckedChange={(v) => {
                              const next = v ? [...new Set([...e.approvedRoles, r])] : e.approvedRoles.filter((x) => x !== r);
                              updateEmployee(e.id, { approvedRoles: next, autoApproveRoles: e.autoApproveRoles.filter((x) => next.includes(x)) });
                            }} />
                            {r}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Auto-approve trades for</p>
                    <div className="flex flex-wrap gap-2">
                      {e.approvedRoles.length === 0 && <p className="text-sm text-muted-foreground">Approve a role first.</p>}
                      {e.approvedRoles.map((r) => {
                        const on = e.autoApproveRoles.includes(r);
                        return (
                          <div key={r} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-sm">
                            <span>{r}</span>
                            <Switch checked={on} onCheckedChange={(v) => {
                              const next = v ? [...new Set([...e.autoApproveRoles, r])] : e.autoApproveRoles.filter((x) => x !== r);
                              updateEmployee(e.id, { autoApproveRoles: next });
                            }} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleTab() {
  const { shifts, employees } = useStore();
  const byDate = useMemo(() => {
    const map = new Map<string, typeof shifts>();
    [...shifts].sort((a, b) => a.date.localeCompare(b.date)).forEach((s) => {
      map.set(s.date, [...(map.get(s.date) ?? []), s]);
    });
    return Array.from(map.entries());
  }, [shifts]);
  return (
    <div className="grid gap-4">
      {byDate.map(([date, list]) => (
        <Card key={date}>
          <CardHeader><CardTitle className="text-base">{new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {list.map((s) => {
              const emp = employees.find((e) => e.id === s.employeeId);
              return (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={emp?.name ?? "?"} />
                    <div>
                      <p className="text-sm font-medium">{emp?.name}</p>
                      <p className="text-xs text-muted-foreground">{s.role}</p>
                    </div>
                  </div>
                  <p className="text-sm font-medium">{s.start} – {s.end}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
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
