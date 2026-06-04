import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/sidework/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { onboardingStatus, useStore, type Role, type JobPosting, type ApplicationStatus } from "@/lib/sidework-store";
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
    <AppShell nav={[{ to: "/manager", label: "Dashboard", icon: <IconHome /> }]}>
      <PageHeader title="Manager Dashboard" subtitle="Onboarding, schedule, and trades at a glance." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 grid h-auto w-full grid-cols-3 md:grid-cols-7">
          <TabsTrigger value="dashboard">Overview</TabsTrigger>
          <TabsTrigger value="menu">Menu</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="timeoff">Time Off</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><OverviewTab /></TabsContent>
        <TabsContent value="menu"><MenuTab /></TabsContent>
        <TabsContent value="team"><TeamTab /></TabsContent>
        <TabsContent value="schedule"><ScheduleTab /></TabsContent>
        <TabsContent value="trades"><TradesTab /></TabsContent>
        <TabsContent value="jobs"><JobsTab /></TabsContent>
        <TabsContent value="timeoff"><TimeOffTab /></TabsContent>
      </Tabs>
    </AppShell>
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

function JobsTab() {
  const { jobs, applications, postJob, toggleJobOpen, removeJob, setApplicationStatus } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", role: "Server" as Role, type: "Full-time" as "Full-time" | "Part-time", payRange: "", description: "" });

  const submit = () => {
    if (!form.title || !form.payRange || !form.description) return toast.error("Fill in title, pay range, and description.");
    postJob(form);
    toast.success("Job posted");
    setOpen(false);
    setForm({ title: "", role: "Server", type: "Full-time", payRange: "", description: "" });
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Job postings</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Share your public careers page: <code className="rounded bg-muted px-1.5 py-0.5">/careers</code></p>
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
                      <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
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
              <div key={j.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{j.title}</p>
                    <Badge variant="secondary">{j.role}</Badge>
                    <Badge variant="outline">{j.type}</Badge>
                    {j.open
                      ? <Badge className="bg-success text-success-foreground hover:bg-success">Open</Badge>
                      : <Badge variant="secondary">Closed</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-primary font-semibold">{j.payRange}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{count} application{count === 1 ? "" : "s"}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggleJobOpen(j.id)}>{j.open ? "Close" : "Reopen"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => { removeJob(j.id); toast.message("Job removed"); }}>Delete</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Applications ({applications.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {applications.length === 0 && <p className="text-sm text-muted-foreground">No applications yet.</p>}
          {applications.map((a) => {
            const job = jobs.find((j) => j.id === a.jobId);
            return (
              <div key={a.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{a.name}</p>
                      <Badge variant="secondary">{job?.title ?? "—"}</Badge>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{a.email} · {a.phone} · applied {new Date(a.appliedAt).toLocaleDateString()}</p>
                  </div>
                  <Select value={a.status} onValueChange={(v: ApplicationStatus) => setApplicationStatus(a.id, v)}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["new", "reviewing", "interview", "hired", "rejected"] as ApplicationStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-3 grid gap-2 text-sm">
                  <p><span className="font-semibold">Experience: </span>{a.experience}</p>
                  <p><span className="font-semibold">Availability: </span>{a.availability}</p>
                  {a.coverNote && <p className="text-muted-foreground italic">"{a.coverNote}"</p>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
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

function MenuTab() {
  const { menu, setMenu, markMenuGenerated } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (menu && !menu.generatedAt && !generating) {
      setGenerating(true);
      const t = setTimeout(() => { markMenuGenerated(); setGenerating(false); }, 2500);
      return () => clearTimeout(t);
    }
  }, [menu, generating, markMenuGenerated]);

  const handleFile = (file: File) => {
    const okTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!okTypes.includes(file.type)) return toast.error("Upload a PDF or image (PNG/JPG).");
    if (file.size > 10 * 1024 * 1024) return toast.error("File must be under 10MB.");
    const reader = new FileReader();
    reader.onload = () => {
      setMenu({
        name: file.name,
        type: file.type,
        sizeKB: Math.round(file.size / 1024),
        uploadedAt: new Date().toISOString(),
        preview: file.type.startsWith("image/") ? (reader.result as string) : undefined,
      });
      toast.success("Menu uploaded");
    };
    reader.readAsDataURL(file);
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
                <p className="text-xs text-muted-foreground">PDF, PNG, or JPG · up to 10MB</p>
              </div>
              <input ref={inputRef} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
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
                <input ref={inputRef} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
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
