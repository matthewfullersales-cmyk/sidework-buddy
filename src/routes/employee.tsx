import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/sidework/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TrainingModule } from "@/components/sidework/TrainingModule";
import { onboardingStatus, useStore, videosForRole } from "@/lib/sidework-store";
import { toast } from "sonner";

const nav = [
  { to: "/employee", label: "Home", icon: <IconHome /> },
];

export const Route = createFileRoute("/employee")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Sidework" }] }),
  component: EmployeePage,
});

function EmployeePage() {
  const { currentUser, employees, videos } = useStore();
  if (currentUser.type === "manager") return <Navigate to="/manager" />;
  const me = employees.find((e) => e.id === currentUser.id);
  if (!me) return <Navigate to="/" />;
  const status = onboardingStatus(me, videos);

  return (
    <AppShell nav={nav}>
      <PageHeader
        title={`Hi, ${me.name.split(" ")[0]}`}
        subtitle={status.fullyOnboarded ? "You're fully onboarded. Nice work." : "Finish your training to get on the schedule."}
      />
      <Tabs defaultValue={!me.personalInfoComplete ? "onboarding" : "training"}>
        <TabsList className="mb-6 grid h-auto w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="trades">Shifts</TabsTrigger>
          <TabsTrigger value="timeoff">Time Off</TabsTrigger>
        </TabsList>
        <TabsContent value="onboarding"><OnboardingTab employeeId={me.id} /></TabsContent>
        <TabsContent value="training"><TrainingTab employeeId={me.id} /></TabsContent>
        <TabsContent value="trades"><TradesTab employeeId={me.id} /></TabsContent>
        <TabsContent value="timeoff"><TimeOffTab employeeId={me.id} /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function OnboardingTab({ employeeId }: { employeeId: string }) {
  const { employees, updateEmployee, videos } = useStore();
  const me = employees.find((e) => e.id === employeeId)!;
  const [form, setForm] = useState({ name: me.name, email: me.email, availability: me.availability });
  const s = onboardingStatus(me, videos);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Onboarding checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ChecklistItem done={me.personalInfoComplete} label="Personal info & availability" />
          <ChecklistItem done={s.total > 0 && s.passed === s.total} label={`Role training (${s.passed}/${s.total} videos)`} />
          <ChecklistItem done={s.fullyOnboarded} label="Marked fully onboarded" />
          <Progress value={Math.round(((me.personalInfoComplete ? 1 : 0) + (s.total ? s.passed / s.total : 0)) / 2 * 100)} className="h-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Your details</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2"><Label>Full name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid gap-2"><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="grid gap-2"><Label>Role</Label><Input disabled value={me.primaryRole} /></div>
          <div className="grid gap-2"><Label>Availability</Label><Textarea rows={3} placeholder="e.g. Mon–Fri evenings, weekends" value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} /></div>
          <div className="flex justify-end">
            <Button onClick={() => {
              if (!form.name || !form.email || !form.availability) return toast.error("Please fill every field.");
              updateEmployee(me.id, { ...form, personalInfoComplete: true, onboardingStarted: true });
              toast.success("Saved");
            }}>Save & continue</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TrainingTab({ employeeId }: { employeeId: string }) {
  const { employees, videos, recordVideoProgress, recordQuizAttempt } = useStore();
  const me = employees.find((e) => e.id === employeeId)!;
  const assigned = videosForRole(videos, me.primaryRole);

  // sequential: previous module must be passed
  const firstUnlockedIndex = useMemo(() => {
    for (let i = 0; i < assigned.length; i++) {
      const p = me.progress.find((x) => x.videoId === assigned[i].id);
      if (!p?.passed) return i;
    }
    return assigned.length;
  }, [assigned, me.progress]);

  if (assigned.length === 0) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">No training assigned for your role yet.</CardContent></Card>;
  }

  return (
    <div className="grid gap-4">
      {assigned.map((video, i) => {
        const prog = me.progress.find((p) => p.videoId === video.id);
        const locked = i > firstUnlockedIndex;
        if (locked) {
          return (
            <Card key={video.id} className="opacity-60">
              <CardContent className="flex items-center gap-3 p-5">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lesson {i + 1} · {me.primaryRole}</p>
                  <p className="font-semibold">{video.title}</p>
                  <p className="text-xs text-muted-foreground">Finish the previous module to unlock.</p>
                </div>
              </CardContent>
            </Card>
          );
        }
        return (
          <TrainingModule
            key={video.id}
            video={video}
            progress={prog}
            onVideoComplete={() => recordVideoProgress(me.id, video.id, { watchedSec: video.durationSec })}
            onQuizSubmit={(score, passed) => {
              recordQuizAttempt(me.id, video.id, score, passed);
              if (passed) toast.success(`Passed with ${score}% — module complete!`);
              else toast.error(`Scored ${score}%. Try again.`);
            }}
          />
        );
      })}
    </div>
  );
}

function TradesTab({ employeeId }: { employeeId: string }) {
  const { shifts, employees, trades, postTrade, claimTrade } = useStore();
  const me = employees.find((e) => e.id === employeeId)!;

  const myShifts = shifts.filter((s) => s.employeeId === me.id);
  const myShiftIds = new Set(myShifts.map((s) => s.id));
  const openTrades = trades.filter((t) => t.status === "open" && !myShiftIds.has(t.shiftId));

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">My upcoming shifts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {myShifts.length === 0 && <p className="text-sm text-muted-foreground">No shifts yet.</p>}
          {myShifts.map((s) => {
            const onBoard = trades.find((t) => t.shiftId === s.id && ["open", "pending_approval"].includes(t.status));
            return (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                <div>
                  <p className="text-sm font-medium">{new Date(s.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {s.start}–{s.end}</p>
                  <p className="text-xs text-muted-foreground">{s.role}</p>
                </div>
                {onBoard ? <Badge variant="secondary">On trade board</Badge> :
                  <PostTradeButton onPost={(note) => { postTrade(s.id, note); toast.success("Posted to trade board"); }} />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Open trades you can pick up</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {openTrades.length === 0 && <p className="text-sm text-muted-foreground">Nothing available right now.</p>}
          {openTrades.map((t) => {
            const shift = shifts.find((s) => s.id === t.shiftId)!;
            const from = employees.find((e) => e.id === t.postedBy);
            const eligible = me.approvedRoles.includes(shift.role);
            const auto = me.autoApproveRoles.includes(shift.role);
            return (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                <div>
                  <p className="text-sm font-medium">{new Date(shift.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {shift.start}–{shift.end}</p>
                  <p className="text-xs text-muted-foreground">{shift.role} · from {from?.name}{t.note ? ` · "${t.note}"` : ""}</p>
                </div>
                {eligible ? (
                  <Button size="sm" onClick={() => {
                    claimTrade(t.id, me.id);
                    toast.success(auto ? "Picked up — auto-approved" : "Picked up — awaiting manager approval");
                  }}>{auto ? "Pick up" : "Request pickup"}</Button>
                ) : (
                  <Badge variant="secondary">Not approved for {shift.role}</Badge>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">My trade history</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {trades.filter((t) => t.postedBy === me.id || t.claimedBy === me.id).map((t) => {
            const shift = shifts.find((s) => s.id === t.shiftId)!;
            const other = employees.find((e) => e.id === (t.postedBy === me.id ? t.claimedBy : t.postedBy));
            return (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-background p-3 text-sm">
                <div>
                  <p className="font-medium">{shift.date} · {shift.start}–{shift.end} · {shift.role}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.postedBy === me.id ? "Gave away" : "Picked up"}{other ? ` · with ${other.name}` : ""}
                  </p>
                </div>
                <Badge variant={t.status === "approved" ? "default" : "secondary"} className={t.status === "approved" ? "bg-success text-success-foreground hover:bg-success" : ""}>{t.status}</Badge>
              </div>
            );
          })}
          {trades.filter((t) => t.postedBy === me.id || t.claimedBy === me.id).length === 0 && (
            <p className="text-sm text-muted-foreground">No trade history yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PostTradeButton({ onPost }: { onPost: (note?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Post to trade board</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Need this shift covered?</DialogTitle></DialogHeader>
        <Label className="text-sm">Optional note</Label>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. doctor's appointment" />
        <DialogFooter>
          <Button onClick={() => { onPost(note || undefined); setOpen(false); setNote(""); }}>Post</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-6 w-6 place-items-center rounded-full ${done ? "bg-success text-success-foreground" : "border border-border bg-muted text-muted-foreground"}`}>
        {done ? <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : null}
      </div>
      <span className={`text-sm ${done ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

function TimeOffTab({ employeeId }: { employeeId: string }) {
  const { timeOff, requestTimeOff } = useStore();
  const mine = timeOff.filter((t) => t.employeeId === employeeId);
  const [form, setForm] = useState({ startDate: "", endDate: "", reason: "" });

  const submit = () => {
    if (!form.startDate || !form.endDate || !form.reason) return toast.error("Please fill in all fields.");
    if (form.endDate < form.startDate) return toast.error("End date must be on or after start date.");
    requestTimeOff({ employeeId, ...form });
    toast.success("Time off request submitted");
    setForm({ startDate: "", endDate: "", reason: "" });
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Request time off</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Start date</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div className="grid gap-2"><Label>End date</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          </div>
          <div className="grid gap-2"><Label>Reason</Label><Textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Family event, medical, vacation" /></div>
          <div className="flex justify-end"><Button onClick={submit}>Submit request</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">My requests</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {mine.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
          {mine.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
              <div className="text-sm">
                <p className="font-semibold">{t.startDate} → {t.endDate}</p>
                <p className="text-xs text-muted-foreground">{t.reason}</p>
              </div>
              <Badge className={
                t.status === "approved" ? "bg-success text-success-foreground hover:bg-success" :
                t.status === "denied" ? "bg-destructive text-destructive-foreground hover:bg-destructive" :
                "bg-warning text-warning-foreground hover:bg-warning"
              }>{t.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function IconHome() { return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/></svg>; }
