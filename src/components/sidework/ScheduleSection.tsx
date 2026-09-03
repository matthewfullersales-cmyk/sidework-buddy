import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Copy, Eraser, Settings2, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useStore, isPendingJoin, type Role, type Shift, type Position, type Section, type WeeklyAvailability, type MealPeriods, type Meal, DAY_KEYS, isAvailableFor, halfForShiftStart, halfForAvailability, mealForShiftStart, suggestedShiftTimes, hoursConfigured, isPendingRoleAssignment } from "@/lib/sidework-store";
import { toast } from "sonner";
import { notifyScheduleChanged } from "@/lib/notifications.functions";
import { formatTime12h } from "@/lib/utils";

import { ROLE_COLORS, roleStyle, STATUS_COLORS, contrastText, fohRolesWithCustom, bohRolesWithCustom, allRolesWithCustom, nextCustomColor } from "@/lib/role-colors";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Order positions roughly by hierarchy
const POSITION_ORDER: Position[] = [
  "Manager", "Assistant Manager", "Hostess", "Bartender", "Bar Back",
  "Server", "Server Assistant", "Busser",
  "Chef", "Sous Chef", "Line Cook", "Garde Manger", "Prep Cook", "Dishwasher",
];

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // Monday start
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
// Local-date YYYY-MM-DD. Never use toISOString() here — that shifts to UTC
// and, in any timezone west of UTC, returns the previous day. That mismatch
// silently breaks the time-off block against dates entered via <input type="date">
// (which stores the local-picked date verbatim).
function fmtISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtRange(start: Date) {
  const end = addDays(start, 6);
  const sameMo = start.getMonth() === end.getMonth();
  const s = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const e = end.toLocaleDateString(undefined, { month: sameMo ? undefined : "short", day: "numeric", year: "numeric" });
  return `${s} – ${e}`;
}

function summarizeAvailability(weekly?: WeeklyAvailability): string {
  if (!weekly) return "";
  if (DAY_KEYS.every((d) => weekly[d]?.kind === "full")) return "Available all week";

  const groups: { label: string; startIdx: number; endIdx: number }[] = [];
  for (let i = 0; i < DAY_KEYS.length; i++) {
    const d = DAY_KEYS[i];
    const av = weekly[d];
    if (!av || av.kind === "full") continue;
    const half = halfForAvailability(av);
    const label = av.kind === "none"
      ? "Off"
      : half === "day" ? "Days only"
      : half === "night" ? "Nights only"
      : "Partial";
    const last = groups[groups.length - 1];
    if (last && last.label === label && last.endIdx === i - 1) {
      last.endIdx = i;
    } else {
      groups.push({ label, startIdx: i, endIdx: i });
    }
  }

  return groups.map((g) => {
    const start = DAY_LABELS[g.startIdx];
    const end = DAY_LABELS[g.endIdx];
    const days = start === end ? start : `${start}–${end}`;
    return `${g.label} ${days}`;
  }).join(", ");
}




export function ScheduleSection() {
  const { shifts, employees: allEmployees, timeOff, restaurantHours, mealPeriods, upsertShift, deleteShift, applyRemoteShiftUpsert, applyRemoteShiftDelete } = useStore();
  // Pending self-joins are not staff yet — never schedulable.
  const employees = useMemo(() => allEmployees.filter((e) => !isPendingJoin(e)), [allEmployees]);

  const { effectiveOwner } = useAuth();
  const ownerId = effectiveOwner?.ownerId ?? null;
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));

  // Realtime: mirror INSERT/UPDATE/DELETE on shifts for this owner into the
  // local store so a second manager's edits show up within a couple seconds
  // without a manual refresh. Echoes of our own writes are deduped by
  // updated_at inside the store.
  useEffect(() => {
    if (!ownerId) return;
    const channel = supabase
      .channel(`shifts:${ownerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shifts", filter: `owner_id=eq.${ownerId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { id?: string } | null;
            if (oldRow?.id) applyRemoteShiftDelete(oldRow.id);
            return;
          }
          const r = payload.new as {
            id: string; employee_id: string | null; role: string;
            date: string; start_time: string; end_time: string;
            notes: string | null; position: string | null; updated_at: string | null;
          } | null;
          if (!r?.id) return;
          applyRemoteShiftUpsert({
            id: r.id,
            employeeId: r.employee_id ?? "",
            role: r.role as Role,
            date: r.date,
            start: r.start_time,
            end: r.end_time,
            notes: r.notes ?? undefined,
            position: (r.position as Position | null) ?? undefined,
            updatedAt: r.updated_at ?? undefined,
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ownerId, applyRemoteShiftUpsert, applyRemoteShiftDelete]);

  const [editing, setEditing] = useState<{ employeeId: string; date: string; existing?: Shift } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState<{ count: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState<{ count: number } | null>(null);

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




  function performCopyToNextWeek() {
    const nextDayISOs = days.map((d) => fmtISO(addDays(d, 7)));
    // delete existing in destination
    shifts.filter((s) => nextDayISOs.includes(s.date)).forEach((s) => deleteShift(s.id));

    let copied = 0;
    let skipped = 0;
    let skippedAvail = 0;
    let pendingTO = 0;
    const sourceShifts = shifts.filter((s) => dayISOs.includes(s.date));
    sourceShifts.forEach((s) => {
      const srcIdx = dayISOs.indexOf(s.date);
      const newDate = nextDayISOs[srcIdx];
      const toStatus = timeOffStatusFor(s.employeeId, newDate);
      if (toStatus === "approved") {
        skipped += 1;
        return;
      }
      // Recurring weekly availability. Parse newDate locally (never UTC).
      const [ny, nm, nd] = newDate.split("-").map(Number);
      const local = new Date(ny, (nm ?? 1) - 1, nd ?? 1);
      const dayKey = DAY_KEYS[(local.getDay() + 6) % 7];
      const emp = employees.find((e) => e.id === s.employeeId);
      const av = emp?.weeklyAvailability?.[dayKey];
      if (av && !isAvailableFor(av, s.start)) {
        skippedAvail += 1;
        return;
      }
      if (toStatus === "pending") pendingTO += 1;
      upsertShift({
        id: `s_${s.employeeId}_${newDate}_${Math.random().toString(36).slice(2, 8)}`,
        employeeId: s.employeeId,
        role: s.role,
        date: newDate,
        start: s.start,
        end: s.end,
        notes: s.notes,
        position: s.position,
      });
      copied += 1;
    });

    const skipParts: string[] = [];
    if (skipped > 0) skipParts.push(`${skipped} skipped — approved time off`);
    if (skippedAvail > 0) skipParts.push(`${skippedAvail} skipped — recurring unavailability`);
    if (pendingTO > 0) skipParts.push(`${pendingTO} copied — has pending time-off request`);
    const skipMsg = skipParts.length ? ` (${skipParts.join("; ")})` : "";
    toast.success(`Copied ${copied} shift${copied === 1 ? "" : "s"} to next week${skipMsg}`);
  }


  function handleCopyToNextWeek() {
    const nextDayISOs = days.map((d) => fmtISO(addDays(d, 7)));
    const existingCount = shifts.filter((s) => nextDayISOs.includes(s.date)).length;
    if (existingCount > 0) {
      setConfirmCopy({ count: existingCount });
      return;
    }
    performCopyToNextWeek();
  }

  function performClearWeek() {
    const toClear = shifts.filter((s) => dayISOs.includes(s.date));
    toClear.forEach((s) => deleteShift(s.id));
    const count = toClear.length;
    toast.success(`Cleared ${count} shift${count === 1 ? "" : "s"} from this week.`);
  }

  function handleClearWeek() {
    const count = shifts.filter((s) => dayISOs.includes(s.date)).length;
    if (count === 0) {
      toast("This week is already empty");
      return;
    }
    setConfirmClear({ count });
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
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <Button
            variant="outline"
            onClick={handleClearWeek}
            className="gap-2 text-destructive hover:bg-destructive/5 hover:text-destructive hover:border-destructive/50"
          >
            <Eraser className="h-4 w-4" />
            Clear Week
          </Button>
          <Button variant="outline" onClick={handleCopyToNextWeek} className="gap-2">
            <Copy className="h-4 w-4" />
            Copy to Next Week
          </Button>
          <Button
            variant="default"
            disabled={publishing}
            onClick={() => {
              setPublishing(true);
              const empIds = Array.from(new Set(
                shifts.filter((s) => dayISOs.includes(s.date)).map((s) => s.employeeId)
              )).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
              if (empIds.length === 0) {
                setPublishing(false);
                toast("No shifts to publish this week");
                return;
              }
              const weekLabel = fmtRange(weekStart);
              notifyScheduleChanged({ data: { employeeIds: empIds, kind: "published", weekLabel } })
                .then((r) => { setPublishing(false); toast.success(`Schedule published — ${r.notifCount} staff notified`); })
                .catch((err: unknown) => {
                  setPublishing(false);
                  console.error("[publish]", err);
                  toast.error("Failed to publish");
                });
            }}
          >
            Publish week
          </Button>
        </div>

      </div>


      <Dialog open={!!confirmCopy} onOpenChange={(o) => { if (!o) setConfirmCopy(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Overwrite next week's schedule?</DialogTitle>
            <DialogDescription>
              Next week already has {confirmCopy?.count} shift{confirmCopy?.count === 1 ? "" : "s"} scheduled. Copying will delete those and replace them with a copy of this week.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmCopy(null)}>Cancel</Button>
            <Button onClick={() => { setConfirmCopy(null); performCopyToNextWeek(); }}>Overwrite &amp; copy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmClear} onOpenChange={(o) => { if (!o) setConfirmClear(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear this week's schedule?</DialogTitle>
            <DialogDescription>
              This will remove all {confirmClear?.count} shift{confirmClear?.count === 1 ? "" : "s"} from this week. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmClear(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setConfirmClear(null); performClearWeek(); }}>
              Clear shifts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <div className="overflow-auto scroll-touch max-h-[calc(100vh-9rem)]">
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="sticky left-0 top-0 z-30 bg-muted/40 border-b border-r border-border p-2 text-left text-xs font-semibold w-48">
                      Employee
                    </th>
                    {days.map((d, i) => {
                      const isWeekend = i === 4 || i === 5;
                      return (
                        <th key={i} className={`sticky top-0 z-20 border-b border-border p-2 text-center text-xs font-semibold ${isWeekend ? "bg-primary/5" : "bg-muted/40"}`}>
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
                          {(() => {
                            const summary = summarizeAvailability(emp.weeklyAvailability);
                            return summary ? (
                              <p className="text-[10px] text-muted-foreground truncate" title={summary}>
                                {summary}
                              </p>
                            ) : null;
                          })()}
                        </div>
                      </td>
                      {dayISOs.map((date, dayIdx) => {
                        const s = shiftFor(emp.id, date);
                        const toStatus = timeOffStatusFor(emp.id, date);
                        const dayKey = DAY_KEYS[dayIdx];
                        const availDay = emp.weeklyAvailability?.[dayKey];
                        // Off days stay clickable — managers must be able to
                        // record a shift picked up on a day off. The cell just
                        // reads differently at a glance.
                        const offDay = availDay?.kind === "none";
                        return (
                          <td key={date} className="border-b border-border p-1 align-middle">
                            {toStatus === "approved" ? (
                              <div
                                className="w-full min-h-[52px] rounded-md text-[11px] grid place-items-center border"
                                style={{ backgroundColor: STATUS_COLORS.timeOff, color: contrastText(STATUS_COLORS.timeOff), borderColor: STATUS_COLORS.timeOff }}
                              >
                                Time off
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditing({ employeeId: emp.id, date, existing: s })}
                                title={offDay ? `${emp.name} marked ${dayKey}s as unavailable — you can still schedule them` : undefined}
                                className={`w-full min-h-[52px] rounded-md text-[11px] px-2 py-1 transition border ${
                                  s
                                    ? "hover:opacity-80"
                                    : offDay
                                      ? "bg-muted/40 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/40 hover:text-primary"
                                      : "bg-background border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                                }`}
                                style={s ? roleStyle(s.role) : undefined}
                              >
                                {s ? (
                                  <div className="flex flex-col">
                                    <span className="font-semibold">{formatTime12h(s.start)} – {formatTime12h(s.end)}</span>
                                    {toStatus === "pending" && (
                                      <span className="mt-0.5 text-[9px] uppercase tracking-wide" style={{ color: "#8a4b00" }}>PTO pending</span>
                                    )}
                                    {s.notes && <span className="mt-0.5 text-[9px] truncate">📝 {s.notes}</span>}
                                  </div>
                                ) : toStatus === "pending" ? (
                                  <span
                                    className="inline-block w-full rounded px-1 py-0.5"
                                    style={{ backgroundColor: STATUS_COLORS.ptoPending, color: contrastText(STATUS_COLORS.ptoPending) }}
                                  >
                                    PTO pending
                                  </span>
                                ) : offDay ? (
                                  <span className="text-[10px] leading-tight">Off · +</span>
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
          onSave={(shift) => {
            upsertShift(shift);
            setEditing(null);
            toast.success(editing.existing ? "Shift updated" : "Shift added");
            // Notify affected employee of a schedule change (only if their id is a real uuid).
            if (editing.existing && /^[0-9a-f-]{36}$/i.test(shift.employeeId)) {
              const weekLabel = fmtRange(weekStart);
              notifyScheduleChanged({ data: { employeeIds: [shift.employeeId], kind: "adjusted", weekLabel } })
                .catch((err: unknown) => console.error("[notifyScheduleChanged]", err));
            }
          }}
          onDelete={(id) => { deleteShift(id); setEditing(null); toast.success("Shift removed"); }}
        />
      )}
    </div>
  );
}

function Legend() {
  const { activeRoles, setActiveRoles, customRoles, addCustomRole, removeCustomRole } = useStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Role[]>(activeRoles);
  const [newName, setNewName] = useState("");
  const [newSection, setNewSection] = useState<"FOH" | "BOH">("FOH");
  const allRoles = allRolesWithCustom(customRoles);
  const shown = allRoles.filter((r) => activeRoles.includes(r));

  function openDialog() {
    setDraft(activeRoles);
    setNewName("");
    setNewSection("FOH");
    setOpen(true);
  }
  function toggle(r: Role, on: boolean) {
    setDraft((prev) => on ? [...new Set([...prev, r])] : prev.filter((x) => x !== r));
  }
  function submitCustom() {
    const name = newName.trim();
    if (!name) return toast.error("Enter a role name");
    if (allRoles.some((r) => r.toLowerCase() === name.toLowerCase())) {
      return toast.error("That role already exists");
    }
    const color = nextCustomColor(customRoles);
    addCustomRole({ name, section: newSection, color });
    setDraft((prev) => [...new Set([...prev, name])]);
    setNewName("");
    toast.success(`Added "${name}"`);
  }
  function deleteCustom(name: string) {
    removeCustomRole(name);
    setDraft((prev) => prev.filter((r) => r !== name));
  }

  const fohList = fohRolesWithCustom(customRoles);
  const bohList = bohRolesWithCustom(customRoles);
  const isCustom = (name: string) => customRoles.some((c) => c.name === name);

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="text-muted-foreground">Legend:</span>
      {shown.map((r) => (
        <span key={r} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5" style={roleStyle(r)}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: contrastText(roleStyle(r).backgroundColor as string) }} />{r}
        </span>
      ))}
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
        style={{ backgroundColor: STATUS_COLORS.timeOff, color: contrastText(STATUS_COLORS.timeOff), borderColor: STATUS_COLORS.timeOff }}
      >
        Time off
      </span>
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
        style={{ backgroundColor: STATUS_COLORS.ptoPending, color: contrastText(STATUS_COLORS.ptoPending), borderColor: STATUS_COLORS.ptoPending }}
      >
        PTO pending
      </span>
      <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]" onClick={openDialog}>
        <Settings2 className="h-3 w-3" />
        Customize roles
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customize roles in use</DialogTitle>
            <DialogDescription>
              Turn off any roles this restaurant doesn't use, or add your own. Existing shifts already assigned to a deactivated or deleted role keep their color and data.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setDraft([...allRolesWithCustom(customRoles)])}>Select all</Button>
            <Button size="sm" variant="outline" onClick={() => setDraft([])}>Deselect all</Button>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              { title: "Front of House", roles: fohList },
              { title: "Back of House", roles: bohList },
            ].map((group) => (
              <div key={group.title}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
                <div className="space-y-1.5">
                  {group.roles.map((r) => {
                    const checked = draft.includes(r);
                    const custom = isCustom(r);
                    return (
                      <div key={r} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
                        <label className="flex flex-1 cursor-pointer items-center gap-2">
                          <Checkbox checked={checked} onCheckedChange={(v) => toggle(r, !!v)} />
                          <span className="h-3 w-3 rounded-sm border border-border" style={{ backgroundColor: ROLE_COLORS[r] ?? "#7F8C8D" }} />
                          <span>{r}</span>
                          {custom && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">custom</span>}
                        </label>
                        {custom && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteCustom(r)}
                            aria-label={`Delete ${r}`}
                          >
                            ×
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 rounded-md border border-dashed border-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add custom role</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[160px]">
                <Label className="text-xs">Role name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Sommelier"
                />
              </div>
              <div className="w-40">
                <Label className="text-xs">Department</Label>
                <Select value={newSection} onValueChange={(v) => setNewSection(v as "FOH" | "BOH")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FOH">Front of House</SelectItem>
                    <SelectItem value="BOH">Back of House</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-sm border border-border" style={{ backgroundColor: nextCustomColor(customRoles) }} title="Auto-assigned color" />
                <Button size="sm" onClick={submitCustom}>Add</Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { setActiveRoles(allRolesWithCustom(customRoles).filter((r) => draft.includes(r))); setOpen(false); toast.success("Roles updated"); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShiftDetailsDialog({
  employeeId, date, existing, onClose, onSave, onDelete,
}: {
  employeeId: string; date: string; existing?: Shift;
  onClose: () => void; onSave: (s: Shift) => void; onDelete: (id: string) => void;
}) {
  const { employees, activeRoles, customRoles, timeOff, mealPeriods, restaurantHours } = useStore();
  const emp = employees.find((e) => e.id === employeeId);
  // Compute suggestions up-front so a brand-new shift is seeded with the
  // first suggestion (Dinner arrival for the employee's section/position),
  // replacing the old hardcoded 17:00–23:00 default. Manual entry always
  // stays open — the inputs remain type="time" below.
  const [dy0, dm0, dd0] = date.split("-").map(Number);
  const localDate0 = new Date(dy0, (dm0 ?? 1) - 1, dd0 ?? 1);
  const dayKey0 = DAY_KEYS[(localDate0.getDay() + 6) % 7]!;
  const availDay0 = emp?.weeklyAvailability?.[dayKey0];
  const half0 = halfForAvailability(availDay0);
  const preferredMeals: Meal[] | undefined = useMemo(
    () => (half0 === "day" ? (["Breakfast", "Lunch"] as Meal[]) : half0 === "night" ? (["Dinner"] as Meal[]) : undefined),
    [half0],
  );
  const suggestions = useMemo(
    () => suggestedShiftTimes({
      dayKey: dayKey0,
      position: emp?.position,
      section: emp?.section,
      restaurantHours,
      mealPeriods,
      preferredMeals,
    }),
    [dayKey0, emp?.position, emp?.section, restaurantHours, mealPeriods, preferredMeals],
  );
  const seed = existing ? null : suggestions[0];
  const [start, setStart] = useState(existing?.start ?? seed?.start ?? "17:00");
  const [end, setEnd] = useState(existing?.end ?? seed?.end ?? "23:00");
  const [role, setRole] = useState<Role>(existing?.role ?? (emp?.primaryRole ?? "Server"));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [overrideAvailability, setOverrideAvailability] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const rolesForPicker = allRolesWithCustom(customRoles).filter((r) => activeRoles.includes(r) || r === role);
  const showSuggestions = hoursConfigured(restaurantHours, mealPeriods) && suggestions.length > 0;

  const timeOffConflict = (() => {
    const rows = timeOff.filter((t) =>
      t.employeeId === employeeId &&
      date >= t.startDate &&
      date <= t.endDate &&
      (t.status === "approved" || t.status === "pending")
    );
    const approved = rows.find((r) => r.status === "approved");
    if (approved) return { status: "approved" as const, row: approved };
    if (rows.length > 0) return { status: "pending" as const, row: rows[0] };
    return null;
  })();

  const blocked = timeOffConflict?.status === "approved";
  // Parse date as LOCAL midnight, not UTC. `new Date("YYYY-MM-DD")` is parsed
  // as UTC and returns the previous day's weekday west of UTC — the same
  // timezone bug class that hid the time-off check earlier.
  const [dy, dm, dd] = date.split("-").map(Number);
  const localDate = new Date(dy, (dm ?? 1) - 1, dd ?? 1);
  const dayIdx = (localDate.getDay() + 6) % 7; // Mon=0..Sun=6
  const dayKey = DAY_KEYS[dayIdx];
  const dateLabel = localDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  const availDay = emp?.weeklyAvailability?.[dayKey];
  // Day/Night is judged ONLY by the arrival time (before noon = day, noon or
  // later = night). No meal periods, no restaurant hours, no configuration.
  const shiftHalf = halfForShiftStart(start);
  const availConflict: null | { kind: "none" } | { kind: "partial"; half: "day" | "night" } = (() => {
    if (!availDay || availDay.kind === "full") return null;
    if (availDay.kind === "none") return { kind: "none" };
    const want = halfForAvailability(availDay);
    if (want && want !== shiftHalf) return { kind: "partial", half: want };
    return null;
  })();
  const needsOverride = !!availConflict && !overrideAvailability;

  // Role gate only. The menu test no longer participates in scheduling
  // eligibility — the manager owns the schedule gate.
  const pendingRole = emp ? isPendingRoleAssignment(emp) : false;
  const trainingBlockMsg = `${emp?.name ?? "This employee"} doesn't have a role assigned yet — assign one from the Team tab before scheduling.`;


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
              {emp?.position} · {dateLabel}
            </p>
          </div>
          {timeOffConflict && (
            <div
              role="alert"
              className={`rounded-lg border p-3 text-sm ${
                blocked
                  ? "border-destructive/60 bg-destructive/10 text-destructive"
                  : "border-amber-500/60 bg-amber-500/10 text-amber-900 dark:text-amber-200"
              }`}
            >
              <p className="font-semibold">
                {blocked
                  ? `⚠️ ${emp?.name ?? "This employee"} has approved time off on ${dateLabel}`
                  : `⚠️ ${emp?.name ?? "This employee"} has a pending time-off request for ${dateLabel}`}
              </p>
              <p className="mt-1 text-xs">

                {blocked
                  ? "Saving is blocked. If this shift really needs to happen, deny or cancel the time-off request first in the Time Off tab."
                  : "The request hasn't been approved yet — you can still save this shift, but consider resolving the request first."}
              </p>
            </div>
          )}
          {pendingRole && !existing && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <p className="font-semibold">⛔ No role assigned</p>
              <p className="mt-1 text-xs">{trainingBlockMsg}</p>
            </div>
          )}


          {availConflict && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
            >
              <p className="font-semibold">
                {availConflict.kind === "none"
                  ? `⚠️ ${emp?.name ?? "This employee"} marked ${dayKey}s as unavailable`
                  : `⚠️ ${emp?.name ?? "This employee"} is available ${availConflict.half === "day" ? "days" : "nights"} only on ${dayKey}s`}
              </p>
              <p className="mt-1 text-xs">
                Recurring weekly availability — not a one-off time-off request. Confirm below to schedule anyway.
              </p>
              <label className="mt-2 flex items-center gap-2 text-xs font-medium">
                <Checkbox
                  checked={overrideAvailability}
                  onCheckedChange={(v) => setOverrideAvailability(v === true)}
                  aria-label="Schedule despite unavailability"
                />
                Schedule anyway
              </label>
            </div>
          )}
          <div className="space-y-2">
            {showSuggestions ? (
              <Popover open={suggestOpen} onOpenChange={setSuggestOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    aria-label="Show shift-time suggestions from restaurant hours"
                  >
                    Suggestions <ChevronDown className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[320px] p-1">
                  <p className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Based on this restaurant's hours + {emp?.section === "BOH" ? "BOH" : "FOH"} arrival lead time
                  </p>
                  <div className="max-h-[240px] overflow-y-auto">
                    {suggestions.map((s, i) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => { setStart(s.start); setEnd(s.end); setSuggestOpen(false); }}
                        className={`block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${i === 0 ? "font-semibold" : ""}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <p className="border-t border-border px-2 py-1.5 text-[10px] text-muted-foreground">
                    Or type any custom time in the fields below.
                  </p>
                </PopoverContent>
              </Popover>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Set operating hours + meal periods in Settings to get time suggestions.
              </p>
            )}
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
          </div>
          <div>
            <Label className="text-xs">Role for this shift</Label>
            <Select value={role} onValueChange={(v: Role) => setRole(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {rolesForPicker.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
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
              disabled={blocked || needsOverride || (pendingRole && !existing)}
              onClick={() => {
                if (blocked) {
                  toast.error(`${emp?.name ?? "Employee"} has approved time off on this date`);
                  return;
                }
                if (needsOverride) {
                  toast.error(`Confirm scheduling despite ${emp?.name ?? "employee"}'s marked unavailability`);
                  return;
                }
                if (pendingRole && !existing) {
                  toast.error(trainingBlockMsg);
                  return;
                }
                onSave({
                  id: existing?.id ?? `s_${employeeId}_${date}`,
                  employeeId, role, date, start, end,
                  notes: notes || undefined,
                  position: emp?.position,
                  updatedAt: existing?.updatedAt,
                });
              }}
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

}

