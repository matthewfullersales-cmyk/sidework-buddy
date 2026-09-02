// Manager-facing interview offer flow built on the unified person record.
// One step: pick a format (phone or in person), then send. Times are NOT picked
// here — the candidate claims one from the restaurant's shared slot pool.
// There is no video interview option.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { copyLinkWithToast } from "@/lib/copy-to-clipboard";
import { sendApplicantNotification } from "@/lib/applicant-notifications.functions";
import { todayLocalISO } from "@/lib/interview-slots-supabase";
import { formatDateLong, formatTime12h } from "@/lib/utils";
import {
  cancelInterview,
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
  existing = null,
  existingBooked = null,
  onClose,
  onCreated,
}: {
  person: Person;
  ownerId: string;
  restaurantName: string;
  /** A live interview this person already has, if any. Warns, never blocks. */
  existing?: Interview | null;
  existingBooked?: { date: string; time: string } | null;
  onClose: () => void;
  onCreated: (interview: Interview) => void;
}) {
  const [type, setType] = useState<InterviewType | null>(null);
  const [busy, setBusy] = useState(false);
  const [openCount, setOpenCount] = useState<number | null>(null);

  // Informational only: an empty pool warns, it never blocks sending.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { count, error } = await supabase
        .from("interview_slots")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .eq("status", "open")
        .gte("slot_date", todayLocalISO());
      if (cancelled || error) return;
      setOpenCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [ownerId]);

  const liveExisting =
    existing && (existing.status === "offered" || existing.status === "scheduled") ? existing : null;

  /** Tells the candidate their old interview is off, before the new invite lands. */
  const emailOldCancelled = async (
    oldIv: Interview,
    booked: { date: string; time: string } | null,
    openSlots: number,
  ) => {
    const hasOpenSlots = openSlots > 0;
    try {
      const res = await sendApplicantNotification({ data: {
        kind: "interview_cancelled",
        ...(hasOpenSlots
          ? { link: `${window.location.origin}/interview/t/${oldIv.publicToken}` }
          : {}),
        hasOpenSlots,
        firstName: person.firstName ?? "",
        restaurantName,
        email: person.email ?? "",
        ...(booked ? { interviewDate: formatDateLong(booked.date), interviewTime: formatTime12h(booked.time) } : {}),
      }});
      if (!res.email.ok) {
        toast.warning(
          `${person.firstName} was NOT emailed about the cancelled interview (${
            res.email.attempted ? `email failed${res.email.error ? `: ${res.email.error}` : ""}` : "no email on file"
          })`,
        );
      }
    } catch (e) {
      console.error("[interview offer] cancellation email failed", e);
      toast.warning(`${person.firstName} was NOT emailed about the cancelled interview.`);
    }
  };

  const submit = async () => {
    if (!type) return;
    setBusy(true);
    try {
      // Creating a new offer cancels the old one and frees its slot, so the
      // candidate must be told before the replacement invite goes out.
      if (liveExisting) {
        await cancelInterview(liveExisting.id);
        await emailOldCancelled(liveExisting, existingBooked, openCount ?? 0);
      }
      const interview = await createInterviewOffer(person.id, type);
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
          interviewType: type,
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
              <DialogTitle>Send the interview invite</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {TYPE_META[type].label} · {person.firstName} picks any time you have open. Open and
                close times under Interview times.
              </p>
            </DialogHeader>

            {liveExisting && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                {person.firstName} already has an interview.{" "}
                {existingBooked
                  ? `Their confirmed time — ${formatDateLong(existingBooked.date)} at ${formatTime12h(existingBooked.time)} — will be cancelled and put back on your open list.`
                  : "Their current invite will be cancelled."}{" "}
                They&apos;ll be emailed about the cancellation, then emailed this new invite.
              </div>
            )}
            {openCount === 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                No interview times are open yet. You can still send this — {person.firstName} will
                see an empty page until you open some.
              </div>
            )}
            {openCount !== null && openCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {openCount} time{openCount === 1 ? "" : "s"} currently open.
              </p>
            )}
          </>
        )}

        <DialogFooter>
          {type && (
            <Button variant="ghost" onClick={() => setType(null)} disabled={busy}>Back</Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          {type && (
            <Button onClick={() => void submit()} disabled={busy}>Send invite</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default InterviewOfferDialog;
