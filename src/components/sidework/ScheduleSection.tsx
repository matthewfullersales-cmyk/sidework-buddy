import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useStore, type Role, type Shift, type Position, type Section, DAY_KEYS, isAvailableFor } from "@/lib/sidework-store";
import { toast } from "sonner";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ROLES: Role[] = ["Server", "Bartender", "Kitchen", "Host"];

// Order positions roughly by hierarchy
const POSITION_ORDER: Position[] = [
  "Manager", "Assistant Manager", "Hostess", "Bartender", "Bar Back",
  "Server", "Busser", "Porter",
  "Chef", "Sous Chef", "Line Cook", "Prep Cook", "Dishwasher",
];

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // Monday start
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fmtISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtRange(start: Date) {
  const end = addDays(start, 6);
  const sameMo = start.getMonth() === end.getMonth();
  const s = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const e = end.toLocaleDateString(undefined, { month: sameMo ? undefined : "short", day: "numeric", year: "numeric" });
  return `${s} – ${e}`;
}

function roleColor(role: Role) {
  // Use semantic-ish dark green family with role-distinguishing accents
  switch (role) {
    case "Server": return "bg-primary/15 text-primary border-primary/30";
    case "Bartender": return "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300";
    case "Kitchen": return "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300";
    case "Host": return "bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-500/30 dark:text-fuchsia-300";
  }
}

// Default shift specs by position (24h)
function defaultShift(pos: Position | undefined, isWeekend: boolean): { start: string; end: string } | null {
  switch (pos) {
    case "Hostess": return { start: "16:30", end: "22:30" };
    case "Bartender": return { start: "16:00", end: "00:00" };
    case "Bar Back": return { start: "17:00", end: "23:30" };
    case "Server": return { start: "16:30", end: "23:00" };
    case "Busser": return { start: "17:00", end: "23:00" };
    case "Porter": return { start: "10:00", end: "16:00" };
    case "Manager": return { start: "15:00", end: "23:30" };
    case "Assistant Manager": return { start: "11:00", end: "19:00" };
    case "Chef": return { start: "11:00", end: "22:00" };
    case "Sous Chef": return { start: "14:00", end: "23:00" };
    case "Line Cook": return { start: isWeekend ? "14:00" : "15:00", end: "23:00" };
    case "Prep Cook": return { start: "08:00", end: "16:00" };
    case "Dishwasher": return { start: "17:00", end: "23:30" };
    default: return null;
  }
}

// Required staffing per day
function staffingFor(dayIdx: number): Partial<Record<Position, number>> {
  // dayIdx: 0=Mon..4=Fri, 5=Sat, 6=Sun
  const weekendNight = dayIdx === 4 || dayIdx === 5; // Fri/Sat
  return weekendNight
    ? { Hostess: 3, Bartender: 2, Server: 9, Busser: 2, "Bar Back": 1, "Line Cook": 4, Dishwasher: 2 }
    : { Hostess: 2, Bartender: 1, Server: 6, Busser: 1, "Bar Back": 1, "Line Cook": 3, Dishwasher: 1 };
}

export function ScheduleSection() {
  const { shifts, employees, timeOff, upsertShift, deleteShift } = useStore();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [editing, setEditing] = useState<{ employeeId: string; date: string; existing?: Shift } | null>(null);
  const [generating, setGenerating] = useState(false);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const dayISOs = days.map(fmtISO);

  const shiftFor = (empId: string, date: string) =>
    shifts.find((s) => s.employeeId === empId && s.date === date);

  const timeOffStatusFor = (empId: string, date: string): "approved" | "pending" | null => {
    const reqs = timeOff.filter((t) => t.employeeId === empId);
    for (const r of reqs) {
      if (date >= r.startDate && date <= r.endDate && (r.status === "approved" || r.status === "pending")) {
        return r.status;
      }
    }
    return null;
  };

  const grouped = useMemo(() => {
    const foh = employees.filter((e) => (e.section ?? "FOH") === "FOH");
    const boh = employees.filter((e) => e.section === "BOH");
    const sortFn = (a: typeof employees[number], b: typeof employees[number]) => {
      const ai = POSITION_ORDER.indexOf(a.position ?? "Server");
      const bi = POSITION_ORDER.indexOf(b.position ?? "Server");
      if (ai !== bi) return ai - bi;
      return (b.seniority ?? 0) - (a.seniority ?? 0);
    };
    return { FOH: foh.sort(sortFn), BOH: boh.sort(sortFn) };
  }, [employees]);

  // AI auto-scheduler
  function generateAI() {
    setGenerating(true);
    setTimeout(() => {
      // Clear existing shifts for the week first
      const existingForWeek = shifts.filter((s) => dayISOs.includes(s.date));
      existingForWeek.forEach((s) => deleteShift(s.id));

      const isOff = (empId: string, date: string) => {
        const status = timeOffStatusFor(empId, date);
        return status === "approved";
      };

      // For each day, fill positions by seniority
      days.forEach((day, dayIdx) => {
        const date = fmtISO(day);
        const isWeekend = dayIdx === 4 || dayIdx === 5;
        const needs = staffingFor(dayIdx);

        // Track who is already booked that day
        const booked = new Set<string>();

        (Object.keys(needs) as Position[]).forEach((pos) => {
          const target = needs[pos] ?? 0;
          // Candidates with this position
          const candidates = employees
            .filter((e) => e.position === pos)
            .filter((e) => !isOff(e.id, date))
            .filter((e) => !booked.has(e.id))
            .sort((a, b) => {
              // On weekends, prioritize seniority strongest
              if (isWeekend) return (b.seniority ?? 0) - (a.seniority ?? 0);
              // Weekdays: rotate by spreading – sort by current week shifts asc, then seniority desc
              return (b.seniority ?? 0) - (a.seniority ?? 0);
            })
            .slice(0, target);

          candidates.forEach((emp) => {
            const def = defaultShift(emp.position, isWeekend);
            if (!def) return;
            booked.add(emp.id);
            const ds = emp.position === "Bartender" && emp.availability === "Swing 4hr"
              ? { start: "19:00", end: "23:00" } : def;
            upsertShift({
              id: `s_${emp.id}_${date}`,
              employeeId: emp.id,
              role: emp.primaryRole,
              date,
              start: ds.start,
              end: ds.end,
              position: emp.position,
            });
          });
        });

        // Always schedule managers and chefs every day
        ["Manager", "Assistant Manager", "Chef", "Sous Chef"].forEach((p) => {
          const pos = p as Position;
          employees
            .filter((e) => e.position === pos && !isOff(e.id, date))
            .forEach((emp) => {
              if (booked.has(emp.id)) return;
              const def = defaultShift(emp.position, isWeekend);
              if (!def) return;
              booked.add(emp.id);
              upsertShift({
                id: `s_${emp.id}_${date}`,
                employeeId: emp.id,
                role: emp.primaryRole,
                date,
                start: def.start,
                end: def.end,
                position: emp.position,
              });
            });
        });
      });

      setGenerating(false);
      toast.success("AI schedule generated — review below");
    }, 1400);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">←</Button>
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Week of</p>
            <p className="text-sm font-semibold">{fmtRange(weekStart)}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">→</Button>
          <Button size="sm" variant="ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>
        </div>
        <Button onClick={generateAI} disabled={generating} className="gap-2">
          {generating ? (
            <>
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              AI is building your schedule…
            </>
          ) : (
            <>✨ Generate AI Schedule</>
          )}
        </Button>
      </div>

      <Legend />

      {(["FOH", "BOH"] as Section[]).map((section) => (
        <Card key={section}>
          <CardContent className="p-0">
            <div className="border-b border-border bg-primary/5 px-4 py-2.5">
              <p className="text-sm font-semibold text-primary">
                {section === "FOH" ? "Front of House" : "Back of House"}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {grouped[section].length} staff
                </span>
              </p>
            </div>
            <div className="overflow-x-auto scroll-touch">
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="sticky left-0 z-10 bg-muted/40 border-b border-r border-border p-2 text-left text-xs font-semibold w-48">
                      Employee
                    </th>
                    {days.map((d, i) => {
                      const isWeekend = i === 4 || i === 5;
                      return (
                        <th key={i} className={`border-b border-border p-2 text-center text-xs font-semibold ${isWeekend ? "bg-primary/5" : ""}`}>
                          <div>{DAY_LABELS[i]}</div>
                          <div className="text-[10px] font-normal text-muted-foreground">
                            {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {grouped[section].map((emp) => (
                    <tr key={emp.id}>
                      <td className="sticky left-0 z-10 bg-card border-b border-r border-border p-2 w-48">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{emp.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {emp.position}
                            {emp.seniority && emp.seniority >= 4 && <span className="ml-1 text-primary">★</span>}
                          </p>
                        </div>
                      </td>
                      {dayISOs.map((date) => {
                        const s = shiftFor(emp.id, date);
                        const toStatus = timeOffStatusFor(emp.id, date);
                        return (
                          <td key={date} className="border-b border-border p-1 align-middle">
                            {toStatus === "approved" ? (
                              <div className="w-full min-h-[52px] rounded-md bg-muted text-[11px] grid place-items-center text-muted-foreground border border-border">
                                Time off
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditing({ employeeId: emp.id, date, existing: s })}
                                className={`w-full min-h-[52px] rounded-md text-[11px] px-2 py-1 transition border ${
                                  s
                                    ? roleColor(s.role) + " hover:opacity-80"
                                    : "bg-background border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                                }`}
                              >
                                {s ? (
                                  <div className="flex flex-col">
                                    <span className="font-semibold">{s.start}–{s.end}</span>
                                    {toStatus === "pending" && (
                                      <span className="mt-0.5 text-[9px] uppercase tracking-wide text-amber-600">PTO pending</span>
                                    )}
                                    {s.notes && <span className="mt-0.5 text-[9px] truncate">📝 {s.notes}</span>}
                                  </div>
                                ) : toStatus === "pending" ? (
                                  <span className="text-amber-600">PTO pending</span>
                                ) : (
                                  <span>+</span>
                                )}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {editing && (
        <ShiftDetailsDialog
          key={`${editing.employeeId}-${editing.date}`}
          employeeId={editing.employeeId}
          date={editing.date}
          existing={editing.existing}
          onClose={() => setEditing(null)}
          onSave={(shift) => { upsertShift(shift); setEditing(null); toast.success(editing.existing ? "Shift updated" : "Shift added"); }}
          onDelete={(id) => { deleteShift(id); setEditing(null); toast.success("Shift removed"); }}
        />
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="text-muted-foreground">Legend:</span>
      {ROLES.map((r) => (
        <span key={r} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${roleColor(r)}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />{r}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">Time off</span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">PTO pending</span>
    </div>
  );
}

function ShiftDetailsDialog({
  employeeId, date, existing, onClose, onSave, onDelete,
}: {
  employeeId: string; date: string; existing?: Shift;
  onClose: () => void; onSave: (s: Shift) => void; onDelete: (id: string) => void;
}) {
  const { employees } = useStore();
  const emp = employees.find((e) => e.id === employeeId);
  const [start, setStart] = useState(existing?.start ?? "17:00");
  const [end, setEnd] = useState(existing?.end ?? "23:00");
  const [role, setRole] = useState<Role>(existing?.role ?? (emp?.primaryRole ?? "Server"));
  const [notes, setNotes] = useState(existing?.notes ?? "");

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Shift details" : "Add shift"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="font-semibold">{emp?.name}</p>
            <p className="text-xs text-muted-foreground">
              {emp?.position} · {new Date(date + "T00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Role for this shift</Label>
            <Select value={role} onValueChange={(v: Role) => setRole(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. closing duties, training new hire…" />
          </div>
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          {existing ? (
            <Button variant="outline" onClick={() => onDelete(existing.id)}>Remove shift</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => onSave({
                id: existing?.id ?? `s_${employeeId}_${date}`,
                employeeId, role, date, start, end,
                notes: notes || undefined,
                position: emp?.position,
              })}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
