// Public, token-scoped shadow shift page. No auth, no data collection.
// The trainee sees where to go, who to ask for, what to wear, and taps one of
// two buttons. Mirrors the interview offer page (interview.t.$token.tsx).
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/sidework/Logo";
import { formatPhone } from "@/lib/format-phone";
import { formatDateLong, formatTimeRange12h } from "@/lib/utils";
import { normalizeShadowPacket } from "@/lib/employees-supabase";

import {
  getPublicShadowShift,
  confirmShadowShiftByToken,
  declineShadowShiftByToken,
  type PublicShadowShift,
} from "@/lib/shadow-shifts-supabase";

export const Route = createFileRoute("/shadow/t/$token")({
  component: PublicShadowShiftPage,
  head: () => ({
    meta: [
      { title: "Your shadow shift | 86Paper" },
      { name: "description", content: "Everything you need for your upcoming shadow shift, and one tap to confirm." },
      { property: "og:title", content: "Your shadow shift | 86Paper" },
      { property: "og:description", content: "Everything you need for your upcoming shadow shift, and one tap to confirm." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

function Field({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="whitespace-pre-line text-sm">{value}</p>
    </div>
  );
}

function PublicShadowShiftPage() {
  const { token } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [shift, setShift] = useState<PublicShadowShift | null>(null);
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const row = await getPublicShadowShift(token);
        if (!cancelled) setShift(row);
      } catch (e) {
        console.error("[public shadow shift]", e);
        if (!cancelled) setShift(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const respond = async (choice: "confirm" | "decline") => {
    setBusy(choice);
    try {
      const updated = choice === "confirm"
        ? await confirmShadowShiftByToken(token)
        : await declineShadowShiftByToken(token);
      if (updated) setShift(updated);
      toast.success(choice === "confirm" ? "You're all set." : "Thanks for letting us know.");
    } catch (e) {
      console.error("[shadow shift respond]", e);
      toast.error("Couldn't save that. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const packet = shift ? normalizeShadowPacket(shift.shadowPacket) : null;
  // No role classification happens here: the manager resolved both values at
  // scheduling time (customRoles are not visible to this unauthenticated page).
  // Older rows predating those columns fall back to front of house.
  const section = shift ? (shift.section ?? "foh") : null;
  const dressGroup = shift ? (shift.dressGroup ?? "foh") : null;
  // Host is all-or-nothing: any host text at all means use the host block as-is.
  const dress =
    packet && dressGroup
      ? dressGroup === "host" && !packet.dress.host.wear.trim() && !packet.dress.host.provided.trim()
        ? packet.dress.foh
        : packet.dress[dressGroup]
      : null;
  // Entrance: BOH override when set, otherwise the main entrance (fallback).
  const entrance = packet
    ? section === "boh" && packet.entranceBoh.trim()
      ? packet.entranceBoh
      : packet.entrance
    : "";
  // Bring: no cross-fallback — blank BOH is a complete answer.
  const bring = packet ? (section === "boh" ? packet.bring.boh : packet.bring.foh) : "";
  const doing = packet && shift ? (packet.doing[shift.role] ?? "") : "";
  const closed = shift ? shift.status === "cancelled" || shift.status === "completed" : false;
  // Date-only comparison, deliberately. The shift stores a local date + time
  // with no timezone and the restaurant's timezone isn't stored anywhere, so a
  // time-of-day check would run against the trainee's device clock. Dates can't
  // drift. The buttons stay live all day, including for a confirmed trainee: a
  // late decline beats a no-show.
  const todayLocal = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const datePassed = shift ? shift.shiftDate.slice(0, 10) < todayLocal : false;



  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 py-8">
      <Logo className="h-8 w-auto self-start" />

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && !shift && (
        <div className="rounded-xl border border-border p-6">
          <h1 className="text-lg font-semibold">This link isn't active</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have expired or been replaced. Reach out to the restaurant for a new one.
          </p>
        </div>
      )}

      {!loading && shift && (
        <>
          <header className="space-y-1">
            <h1 className="text-2xl font-bold">
              Your shadow shift at {shift.restaurantName ?? "the restaurant"}
            </h1>
            {shift.firstName && (
              <p className="text-sm text-muted-foreground">Hi {shift.firstName} —</p>
            )}
          </header>

          <section className="space-y-1 rounded-xl border border-border p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{shift.role}</p>
            <p className="text-lg font-semibold">{formatDateLong(shift.shiftDate)}</p>
            <p className="text-sm">Arrive at {formatTimeRange12h(shift.arrivalTime.slice(0, 5), shift.endTime ? shift.endTime.slice(0, 5) : null)}</p>
            {shift.trainerFirstName && (
              <p className="pt-1 text-sm">Ask for <span className="font-medium">{shift.trainerFirstName}</span></p>
            )}
            {shift.address && <p className="pt-1 text-sm font-medium">{shift.address}</p>}
            {shift.restaurantPhone && (
              <p className="text-sm text-muted-foreground">{formatPhone(shift.restaurantPhone)}</p>
            )}
          </section>

          {packet && (entrance.trim() || packet.parking.trim() || (dress && (dress.wear.trim() || dress.provided.trim()))) && (
            <section className="space-y-4 rounded-xl border border-border p-5">
              <Field label="Where to come in" value={entrance} />
              <Field label="Parking" value={packet.parking} />
              {dress && <Field label="What to wear" value={dress.wear} />}
              {dress && <Field label="What we provide" value={dress.provided} />}
            </section>
          )}

          {(bring.trim() || doing.trim()) && (
            <section className="space-y-4 rounded-xl border border-border p-5">
              <Field label="What to bring" value={bring} />
              <Field label="What you'll be doing" value={doing} />
            </section>
          )}


          {shift.note && (
            <section className="rounded-xl border border-border p-5">
              <Field label="From the manager" value={shift.note} />
            </section>
          )}

          {closed ? (
            // Both RPCs guard on status = 'scheduled', so the response buttons
            // are hidden here rather than left as a silent no-op.
            <section className="rounded-xl border border-border p-5">
              <p className="text-sm font-semibold">
                {shift.status === "completed"
                  ? "This shadow shift is complete."
                  : "This shadow shift has been cancelled."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {shift.status === "completed"
                  ? "Nothing more to do here."
                  : "Nothing else about your application has changed."}
              </p>
            </section>
          ) : datePassed ? (
            // The date is behind us: keep every detail on the page, swap only
            // the buttons for a plain statement of what happened.
            <section className="rounded-xl border border-border p-5">
              <p className="text-sm font-semibold">
                {shift.confirmedAt
                  ? "This date has passed. You confirmed this shadow shift."
                  : shift.declinedAt
                    ? "This date has passed. You said you couldn't make it."
                    : "This date has passed. You didn't respond to this shadow shift."}
              </p>
            </section>
          ) : (
            <section className="space-y-3">
              {shift.confirmedAt && (
                <div className="rounded-xl border border-primary bg-primary/5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Confirmed</p>
                  <p className="mt-1 text-sm">We'll see you then.</p>
                </div>
              )}
              {shift.declinedAt && (
                <div className="rounded-xl border border-border bg-muted/40 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide">You said you can't make it</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your response has been recorded.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {!shift.confirmedAt && (
                  <Button
                    className="h-auto min-h-14 w-full text-base"
                    disabled={!!busy}
                    onClick={() => void respond("confirm")}
                  >
                    {busy === "confirm" ? "Saving…" : "Confirm — I'll be there"}
                  </Button>
                )}
                {!shift.declinedAt && (
                  <Button
                    className="h-auto min-h-14 w-full text-base"
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => void respond("decline")}
                  >
                    {busy === "decline" ? "Saving…" : "Can't make it"}
                  </Button>
                )}
              </div>
            </section>
          )}

        </>
      )}
    </main>
  );
}
