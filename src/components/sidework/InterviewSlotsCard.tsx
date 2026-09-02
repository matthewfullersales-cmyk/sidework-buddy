// Manager surface for the restaurant-owned interview slot pool.
// Additive only: nothing here changes how offers are made or confirmed today.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { sendApplicantNotification } from "@/lib/applicant-notifications.functions";
import { closeInterviewDay } from "@/lib/interviews-supabase";
import { useAuth } from "@/lib/auth-context";
import { formatDateLong, formatTime12h } from "@/lib/utils";
import {
  countOpenSlotsFromToday,
  createSlots,
  deleteOpenSlot,
  fetchInterviewInterval,
  fetchSlotsForDate,
  generateTimes,
  todayLocalISO,
  type InterviewInterval,
  type InterviewSlot,
} from "@/lib/interview-slots-supabase";

export function InterviewSlotsCard() {
  const { effectiveOwner } = useAuth();
  const ownerId = effectiveOwner?.ownerId ?? null;

  const [date, setDate] = useState(todayLocalISO());
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [interval, setIntervalMinutes] = useState<InterviewInterval>(30);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [slots, setSlots] = useState<InterviewSlot[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  // interview id -> public token, so a cancellation email can link them back.
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    fetchInterviewInterval(ownerId)
      .then((v) => { if (!cancelled) setIntervalMinutes(v); })
      .catch((e) => console.error("[interview slots] interval load failed", e));
    return () => { cancelled = true; };
  }, [ownerId]);

  const load = useCallback(async () => {
    if (!ownerId) return;
    try {
      const rows = await fetchSlotsForDate(ownerId, date);
      setSlots(rows);

      // Booked slots show who holds them; resolved separately so a name lookup
      // failure never hides the schedule itself.
      const interviewIds = rows.map((s) => s.interviewId).filter((x): x is string => !!x);
      if (interviewIds.length === 0) { setNames({}); setTokens({}); return; }
      const { data: ivs } = await supabase
        .from("interviews")
        .select("id, person_id, public_token")
        .in("id", interviewIds);
      const ivRows = (ivs ?? []) as { id: string; person_id: string; public_token: string }[];
      setTokens(Object.fromEntries(ivRows.map((r) => [r.id, r.public_token])));
      const personByInterview = new Map(ivRows.map((r) => [r.id, r.person_id]));
      const personIds = Array.from(new Set(personByInterview.values()));
      const { data: people } = await supabase
        .from("people")
        .select("id, first_name, last_name")
        .in("id", personIds);
      const byPerson = new Map(
        ((people ?? []) as { id: string; first_name: string; last_name: string }[]).map((p) => [
          p.id,
          `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
        ]),
      );
      const out: Record<string, string> = {};
      for (const [ivId, pid] of personByInterview) {
        const n = byPerson.get(pid);
        if (n) out[ivId] = n;
      }
      setNames(out);
    } catch (e) {
      console.error("[interview slots] load failed", e);
      toast.error("Couldn't load interview times");
    }
  }, [ownerId, date]);

  useEffect(() => { void load(); }, [load]);

  const bookedCount = useMemo(() => slots.filter((s) => s.status === "booked").length, [slots]);
  const openCount = useMemo(() => slots.filter((s) => s.status === "open").length, [slots]);

  const buildPreview = () => {
    if (date < todayLocalISO()) return void toast.error("That date is in the past.");
    if (!start || !end) return void toast.error("Pick a start and an end time.");
    if (start >= end) return void toast.error("The start time has to be before the end time.");
    const times = generateTimes(start, end, interval);
    if (times.length === 0) {
      return void toast.error(`That window is shorter than one ${interval}-minute interview.`);
    }
    setPreview(times);
  };

  const saveBlock = async () => {
    if (!ownerId || !preview) return;
    setBusy(true);
    try {
      const created = await createSlots(ownerId, date, preview);
      const skipped = preview.length - created;
      toast.success(
        `${created} time${created === 1 ? "" : "s"} opened` +
          (skipped > 0 ? ` · ${skipped} already existed` : ""),
      );
      setPreview(null);
      setStart("");
      setEnd("");
      await load();
    } catch (e) {
      console.error("[interview slots] create failed", e);
      toast.error("Couldn't open those times");
    } finally {
      setBusy(false);
    }
  };

  const removeSlot = async (slot: InterviewSlot) => {
    if (slot.status === "booked") {
      toast.error("Someone confirmed this time", {
        description: "Removing it means cancelling on them. That flow isn't built yet.",
      });
      return;
    }
    try {
      await deleteOpenSlot(slot.id);
      await load();
    } catch (e) {
      console.error("[interview slots] delete failed", e);
      toast.error("Couldn't remove that time");
    }
  };

  /**
   * Closes the whole day server-side in one call: open times close, anyone
   * booked has their interview cancelled and their slot closed too. Emails
   * follow; a failed email never undoes the cancellation.
   */
  const closeDay = async () => {
    if (!ownerId) return;
    if (openCount === 0 && bookedCount === 0) return void toast.message("Nothing to close on this day.");
    setBusy(true);
    let affected: Awaited<ReturnType<typeof closeInterviewDay>> = [];
    try {
      affected = await closeInterviewDay(date);
      toast.success(
        `Closed ${openCount} open time${openCount === 1 ? "" : "s"}` +
          (affected.length > 0
            ? ` · ${affected.length} interview${affected.length === 1 ? "" : "s"} cancelled`
            : ""),
      );
      await load();
    } catch (e) {
      console.error("[interview slots] close day failed", e);
      toast.error("Couldn't close that day");
      setBusy(false);
      return;
    }
    setBusy(false);
    if (affected.length === 0) return;

    let openLeft = 0;
    try {
      openLeft = await countOpenSlotsFromToday(ownerId);
    } catch (e) {
      console.error("[interview slots] open slot count failed", e);
    }
    const hasOpenSlots = openLeft > 0;

    for (const c of affected) {
      const who = c.firstName || "That candidate";
      try {
        const res = await sendApplicantNotification({ data: {
          kind: "interview_cancelled",
          ...(hasOpenSlots && tokens[c.interviewId]
            ? { link: `${window.location.origin}/interview/t/${tokens[c.interviewId]}` }
            : {}),
          hasOpenSlots: hasOpenSlots && !!tokens[c.interviewId],
          firstName: c.firstName ?? "",
          restaurantName: c.restaurantName ?? "",
          email: c.email ?? "",
          ...(c.bookedDate ? { interviewDate: formatDateLong(c.bookedDate) } : {}),
          ...(c.bookedTime ? { interviewTime: formatTime12h(c.bookedTime) } : {}),
        }});
        if (!res.email.ok) {
          toast.warning(
            `${who} was NOT emailed (${res.email.attempted ? `email failed${res.email.error ? `: ${res.email.error}` : ""}` : "no email on file"})`,
          );
        }
      } catch (e) {
        console.error("[interview slots] cancellation email failed", e);
        toast.warning(`${who} was NOT emailed about the cancellation.`);
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Interview times</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Times belong to the restaurant, not to one candidate. Open a block, and each slot can be
          claimed once. Blocks split by your interview length ({interval} min), set in Settings.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="slot-date">Date</Label>
            <Input id="slot-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setPreview(null); }} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slot-start">From</Label>
            <Input id="slot-start" type="time" value={start} onChange={(e) => { setStart(e.target.value); setPreview(null); }} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slot-end">To</Label>
            <Input id="slot-end" type="time" value={end} onChange={(e) => { setEnd(e.target.value); setPreview(null); }} />
          </div>
          <div className="flex items-end">
            <Button className="w-full" variant="outline" onClick={buildPreview} disabled={busy}>
              Preview times
            </Button>
          </div>
        </div>

        {preview && (
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-semibold">
              {preview.length} time{preview.length === 1 ? "" : "s"} on {formatDateLong(date)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {preview.map((t) => (
                <span key={t} className="rounded-md border border-border px-2 py-1 text-xs">
                  {formatTime12h(t)}
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void saveBlock()} disabled={busy}>Open these times</Button>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)} disabled={busy}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold">{formatDateLong(date)}</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={busy || (openCount === 0 && bookedCount === 0)}>
                  Close this day
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close {formatDateLong(date)}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {openCount} open time{openCount === 1 ? "" : "s"} will close.{" "}
                    {bookedCount > 0
                      ? `${bookedCount} confirmed interview${bookedCount === 1 ? "" : "s"} will be cancelled and ${bookedCount === 1 ? "that person" : "those people"} will be emailed. That email can't be unsent.`
                      : "Nobody has confirmed a time on this day, so no one will be emailed."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep the day</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void closeDay()}>Close the day</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No interview times on this day yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {slots.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm font-medium">{formatTime12h(s.time)}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {s.status === "booked"
                        ? `Booked${s.interviewId && names[s.interviewId] ? ` · ${names[s.interviewId]}` : ""}`
                        : s.status === "closed"
                        ? "Closed"
                        : "Open"}
                    </span>
                    {s.status !== "booked" && (
                      <Button size="sm" variant="ghost" onClick={() => void removeSlot(s)}>Remove</Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {bookedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {bookedCount} booked time{bookedCount === 1 ? "" : "s"} on this day can't be removed one by one — someone
              confirmed them. Closing the whole day cancels them and emails those candidates.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default InterviewSlotsCard;
