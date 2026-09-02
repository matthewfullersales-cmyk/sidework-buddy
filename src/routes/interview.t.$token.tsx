// Public, token-scoped interview scheduling page. No auth, no data collection.
// The candidate taps one of the restaurant's live OPEN times and that's it.
// Times are wall-clock (the restaurant's own clock) — never timezone-converted.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/sidework/Logo";
import { formatPhone } from "@/lib/format-phone";
import { formatDateLong, formatTime12h } from "@/lib/utils";
import {
  getPublicInterview,
  claimInterviewSlot,
  type OpenSlot,
  type PublicInterview,
} from "@/lib/interviews-supabase";

export const Route = createFileRoute("/interview/t/$token")({
  component: PublicInterviewPage,
  head: () => ({
    meta: [
      { title: "Pick your interview time | 86Paper" },
      { name: "description", content: "Choose a time for your upcoming restaurant interview. One tap confirms it." },
      { property: "og:title", content: "Pick your interview time | 86Paper" },
      { property: "og:description", content: "Choose a time for your upcoming restaurant interview. One tap confirms it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

function PublicInterviewPage() {
  const { token } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [interview, setInterview] = useState<PublicInterview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const row = await getPublicInterview(token);
      setInterview(row);
    } catch (e) {
      console.error("[public interview]", e);
      setInterview(null);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [load]);

  // Group open slots by day, preserving the server's date/time ordering.
  const byDay = useMemo(() => {
    const groups: { date: string; slots: OpenSlot[] }[] = [];
    for (const s of interview?.openSlots ?? []) {
      const last = groups[groups.length - 1];
      if (last && last.date === s.date) last.slots.push(s);
      else groups.push({ date: s.date, slots: [s] });
    }
    return groups;
  }, [interview]);

  const claim = async (slot: OpenSlot) => {
    setBusy(slot.id);
    try {
      const updated = await claimInterviewSlot(token, slot.id);
      if (updated) setInterview(updated);
      toast.success("You're all set.");
    } catch (e) {
      console.error("[claim interview slot]", e);
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        msg.includes("SLOT_TAKEN")
          ? "That time was just taken. Please pick another."
          : "Couldn't confirm that time. Please try again.",
      );
      await load();
    } finally {
      setBusy(null);
    }
  };

  const isBooked = !!(interview && interview.bookedDate && interview.bookedTime);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 py-8">
      <Logo className="h-8 w-auto self-start" />

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && !interview && (
        <div className="rounded-xl border border-border p-6">
          <h1 className="text-lg font-semibold">This link isn't active</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have expired or been replaced. Reach out to the restaurant for a new one.
          </p>
        </div>
      )}

      {!loading && interview && (
        <>
          <header className="space-y-1">
            <h1 className="text-2xl font-bold">
              {interview.restaurantName ?? "The restaurant"} would like to interview you
            </h1>
            {interview.firstName && (
              <p className="text-sm text-muted-foreground">Hi {interview.firstName} —</p>
            )}
            <p className="text-sm text-muted-foreground">
              {interview.interviewType === "phone"
                ? "This is a phone interview. They'll call you at the time you pick."
                : "This is an in-person interview at the restaurant."}
            </p>
            {interview.interviewType === "in_person" && interview.address && (
              <p className="pt-1 text-sm font-medium">{interview.address}</p>
            )}
            {interview.interviewType === "in_person" && interview.restaurantPhone && (
              <p className="text-sm text-muted-foreground">{formatPhone(interview.restaurantPhone)}</p>
            )}
          </header>

          {interview.status === "cancelled" && (
            <section className="rounded-xl border border-border p-5">
              <h2 className="text-sm font-semibold">This interview has been cancelled</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing else about your application has changed.
                {byDay.length > 0
                  ? " You can pick a new time below."
                  : " When new times open up, you'll get another email."}
              </p>
            </section>
          )}

          {interview.status === "cancelled" ? (
            byDay.length > 0 ? (
              <SlotPicker byDay={byDay} busy={busy} onPick={(s) => void claim(s)} />
            ) : null
          ) : isBooked ? (
            <section className="rounded-xl border border-primary bg-primary/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Confirmed</p>
              <p className="mt-1 text-lg font-semibold">
                {formatDateLong(interview.bookedDate!)} at {formatTime12h(interview.bookedTime!)}
              </p>
            </section>
          ) : interview.status === "completed" ? (
            <section className="rounded-xl border border-border p-5">
              <p className="text-sm text-muted-foreground">This interview is already complete.</p>
            </section>
          ) : byDay.length === 0 ? (
            <section className="rounded-xl border border-border p-5">
              <h2 className="text-sm font-semibold">No times are open right now</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                You'll get an email when new times are opened. This link stays good — check back then.
              </p>
            </section>
          ) : (
            <SlotPicker byDay={byDay} busy={busy} onPick={(s) => void claim(s)} />
          )}
        </>
      )}
    </main>
  );
}

function SlotPicker({
  byDay,
  busy,
  onPick,
}: {
  byDay: { date: string; slots: OpenSlot[] }[];
  busy: string | null;
  onPick: (slot: OpenSlot) => void;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">Pick a time that works for you</h2>
      {byDay.map((g) => (
        <div key={g.date} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {formatDateLong(g.date)}
          </p>
          <ul className="space-y-2">
            {g.slots.map((slot) => (
              <li key={slot.id}>
                <Button
                  className="h-auto min-h-14 w-full justify-start whitespace-normal py-3 text-left text-base"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => onPick(slot)}
                >
                  {busy === slot.id ? "Confirming\u2026" : formatTime12h(slot.time)}
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">One tap confirms.</p>
        </div>
      ))}
    </section>
  );
}
