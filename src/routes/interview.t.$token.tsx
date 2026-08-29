// Public, token-scoped interview scheduling page. No auth, no data collection.
// The applicant taps one of the offered times and that's it.
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/sidework/Logo";
import { formatPhone } from "@/lib/format-phone";
import {
  getPublicInterview,
  confirmInterviewSlot,
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

function formatSlot(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PublicInterviewPage() {
  const { token } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [interview, setInterview] = useState<PublicInterview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const row = await getPublicInterview(token);
        if (!cancelled) setInterview(row);
      } catch (e) {
        console.error("[public interview]", e);
        if (!cancelled) setInterview(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const confirm = async (slot: string) => {
    setBusy(slot);
    try {
      const updated = await confirmInterviewSlot(token, slot);
      if (updated) setInterview(updated);
      toast.success("You're all set.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        msg.includes("SLOT_TAKEN")
          ? "That time was just taken. Please pick another."
          : "Couldn't confirm that time. Please try again.",
      );
      try {
        const fresh = await getPublicInterview(token);
        setInterview(fresh);
      } catch { /* keep current view */ }
    } finally {
      setBusy(null);
    }
  };

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

          {interview.status === "scheduled" && interview.selectedSlot ? (
            <section className="rounded-xl border border-primary bg-primary/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Confirmed</p>
              <p className="mt-1 text-lg font-semibold">{formatSlot(interview.selectedSlot)}</p>
              <p className="mt-2 text-sm text-muted-foreground">We'll see you then.</p>
            </section>
          ) : interview.status === "completed" ? (
            <section className="rounded-xl border border-border p-5">
              <p className="text-sm text-muted-foreground">This interview is already complete.</p>
            </section>
          ) : (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Pick a time that works for you</h2>
              <ul className="space-y-2">
                {interview.offeredSlots.map((slot) => (
                  <li key={slot}>
                    <Button
                      className="h-auto min-h-16 w-full justify-start whitespace-normal py-3 text-left text-base"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => void confirm(slot)}
                    >
                      {busy === slot ? "Confirming…" : formatSlot(slot)}
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Times are shown in your local time zone. One tap confirms.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
