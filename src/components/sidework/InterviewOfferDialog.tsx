// Manager-facing interview offer flow built on the unified person record.
// Two steps: pick a format (phone or in person), then pick up to 5 times.
// There is no video interview option.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { copyLinkWithToast } from "@/lib/copy-to-clipboard";
import { sendApplicantNotification } from "@/lib/applicant-notifications.functions";
import {
  createInterviewOffer,
  type Interview,
  type InterviewType,
} from "@/lib/interviews-supabase";
import type { Person } from "@/lib/people-supabase";

const TYPE_META: Record<InterviewType, { label: string; hint: string; Icon: typeof Phone }> = {
  phone: { label: "Phone call", hint: "You'll call them at the time they pick.", Icon: Phone },
  in_person: { label: "In person", hint: "They come to the restaurant.", Icon: MapPin },
};

export function InterviewOfferDialog({
  person,
  ownerId,
  restaurantName,
  onClose,
  onCreated,
}: {
  person: Person;
  ownerId: string;
  restaurantName: string;
  onClose: () => void;
  onCreated: (interview: Interview) => void;
}) {
  const [type, setType] = useState<InterviewType | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [customTime, setCustomTime] = useState<string>("");
  const [dateOpen, setDateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<Set<number>>(new Set());

  // Times already held by another confirmed interview at this restaurant.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("interviews")
        .select("selected_slot, person_id")
        .eq("owner_id", ownerId)
        .eq("status", "scheduled");
      if (cancelled || error) return;
      const taken = new Set<number>();
      for (const r of (data ?? []) as { selected_slot: string | null; person_id: string }[]) {
        if (!r.selected_slot || r.person_id === person.id) continue;
        const t = new Date(r.selected_slot).getTime();
        if (!Number.isNaN(t)) taken.add(t);
      }
      setBookedSlots(taken);
    })();
    return () => { cancelled = true; };
  }, [ownerId, person.id]);

  const suggested = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    const hours = [10, 12, 14, 16, 18];
    for (let day = 1; day <= 7 && out.length < 35; day++) {
      const d = new Date(now);
      d.setDate(d.getDate() + day);
      for (const h of hours) {
        const slot = new Date(d);
        slot.setHours(h, 0, 0, 0);
        out.push(slot.toISOString());
      }
    }
    return out;
  }, []);

  const timeOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (let h = 6; h <= 23; h++) {
      for (let m = 0; m < 60; m += 15) {
        const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        const d = new Date();
        d.setHours(h, m, 0, 0);
        out.push({ value, label: d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) });
      }
    }
    return out;
  }, []);

  const isBooked = (iso: string) => bookedSlots.has(new Date(iso).getTime());

  const toggle = (iso: string) => {
    if (isBooked(iso)) {
      toast.error("That time is already booked for another interview.");
      return;
    }
    setSelected((prev) => {
      if (prev.includes(iso)) return prev.filter((x) => x !== iso);
      if (prev.length >= 5) {
        toast.message("Max 5 times", { description: "Deselect one to add another." });
        return prev;
      }
      return [...prev, iso];
    });
  };

  const addCustom = () => {
    if (!customDate) return toast.error("Pick a date first.");
    if (!customTime) return toast.error("Pick a time first.");
    const [hh, mm] = customTime.split(":").map(Number);
    const d = new Date(customDate);
    d.setHours(hh ?? 0, mm ?? 0, 0, 0);
    if (Number.isNaN(d.getTime())) return toast.error("That doesn't look like a valid date/time.");
    if (d.getTime() < Date.now()) return toast.error("Pick a time in the future.");
    const iso = d.toISOString();
    if (isBooked(iso)) return toast.error("That time is already booked for another interview.");
    if (selected.includes(iso)) return toast.message("That time is already added.");
    if (selected.length >= 5) return toast.error("Max 5 times. Deselect one to add another.");
    setSelected((prev) => [...prev, iso]);
    setCustomDate(undefined);
    setCustomTime("");
  };

  const submit = async () => {
    if (!type) return;
    if (selected.length < 1) return void toast.error("Pick at least one time.");
    setBusy(true);
    try {
      const interview = await createInterviewOffer(person.id, type, selected);
      const link = `${window.location.origin}/interview/t/${interview.publicToken}`;
      onCreated(interview);

      let emailOk = false;
      let emailAttempted = false;
      let emailErr: string | undefined;
      try {
        const res = await sendApplicantNotification({ data: {
          kind: "interview_offer",
          link,
          firstName: person.firstName ?? "",
          restaurantName,
          email: person.email ?? "",
          slotCount: selected.length,
        }});
        emailOk = res.email.ok;
        emailAttempted = res.email.attempted;
        emailErr = res.email.error;
      } catch (e) {
        console.error("[interview offer email]", e);
      }

      if (emailOk) {
        toast.success(`Interview invite emailed to ${person.firstName}`, { description: link });
      } else {
        const why = emailAttempted ? `email failed${emailErr ? `: ${emailErr}` : ""}` : "no email on file";
        toast.warning(`Invite ready for ${person.firstName} — send the link manually (${why})`);
        copyLinkWithToast(link, "Interview link copied");
      }
      onClose();
    } catch (e) {
      console.error("[interview offer]", e);
      toast.error(e instanceof Error ? e.message : "Couldn't create that interview offer.");
    } finally {
      setBusy(false);
    }
  };

  const customSelected = selected.filter((s) => !suggested.includes(s));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        {!type ? (
          <>
            <DialogHeader>
              <DialogTitle>How do you want to interview {person.firstName}?</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2 sm:grid-cols-2">
              {(Object.keys(TYPE_META) as InterviewType[]).map((t) => {
                const { label, hint, Icon } = TYPE_META[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className="flex min-h-32 flex-col items-start gap-2 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-primary hover:bg-muted"
                  >
                    <Icon className="h-6 w-6 text-primary" aria-hidden />
                    <span className="text-base font-semibold">{label}</span>
                    <span className="text-xs text-muted-foreground">{hint}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Pick your available times</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {TYPE_META[type].label} · tap any time below or add a custom one. Up to 5 total.
                {" "}{person.firstName} picks the one that works.
              </p>
            </DialogHeader>

            <div className="grid max-h-[40vh] gap-2 overflow-y-auto py-2 sm:grid-cols-2">
              {suggested.map((s) => {
                const on = selected.includes(s);
                const booked = isBooked(s);
                const d = new Date(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggle(s)}
                    disabled={booked}
                    className={`min-h-12 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                      booked
                        ? "cursor-not-allowed border-border bg-muted/40 text-muted-foreground opacity-60"
                        : on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {d.toLocaleString([], { weekday: "long", month: "short", day: "numeric" })}
                    <span className="block text-xs opacity-80">
                      at {d.toLocaleString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                    {booked && (
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-destructive">
                        Already booked
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label className="text-sm font-semibold">Add a custom time</Label>
              <div className="flex flex-wrap gap-2">
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn("min-w-[10rem] flex-1 justify-start text-left font-normal", !customDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customDate ? format(customDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customDate}
                      onSelect={(d) => { setCustomDate(d ?? undefined); setDateOpen(false); }}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Select value={customTime} onValueChange={setCustomTime}>
                  <SelectTrigger className="w-[9rem]">
                    <SelectValue placeholder="Time" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[16rem]">
                    {timeOptions.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="secondary" onClick={addCustom}>Add</Button>
              </div>
              {customSelected.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {customSelected.map((s) => {
                    const d = new Date(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggle(s)}
                        className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                        title="Click to remove"
                      >
                        {d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        <span aria-hidden>×</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          {type && (
            <Button variant="ghost" onClick={() => setType(null)} disabled={busy}>Back</Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          {type && (
            <Button onClick={() => void submit()} disabled={busy || selected.length === 0}>
              Send {selected.length || ""} time{selected.length === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default InterviewOfferDialog;
