import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, CalendarClock, Shirt, AlertCircle } from "lucide-react";
import {
  fetchPublicShadowShift,
  confirmApplicantShadowShift,
  declineApplicantShadowShift,
  type PublicShadowShiftInfo,
} from "@/lib/hiring-supabase";

export const Route = createFileRoute("/shadow/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Confirm Shadow Shift — 86Paper" }] }),
  component: ShadowConfirmPage,
});

function ShadowConfirmPage() {
  const { id } = Route.useParams();
  const [app, setApp] = useState<PublicShadowShiftInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDecline, setShowDecline] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPublicShadowShift(id)
      .then((res) => {
        if (cancelled) return;
        if (!res) setNotFound(true);
        else setApp(res);
      })
      .catch((e) => {
        console.error("[shadow page]", e);
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <Centered>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Loading your invite…</p>
      </Centered>
    );
  }

  if (notFound || !app) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">Invite not found</h1>
        <p className="mt-2 text-muted-foreground">This link may have expired.</p>
        <Button asChild className="mt-6"><Link to="/">Go home</Link></Button>
      </Centered>
    );
  }

  const firstName = app.firstName ?? app.name?.split(" ")[0] ?? "there";
  const restaurantName = app.restaurantName ?? "the team";
  const shift = app.shadowShift;

  if (!shift) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">No shadow shift scheduled</h1>
        <p className="mt-2 text-muted-foreground">
          {restaurantName} hasn't sent you the details yet. Check back soon!
        </p>
      </Centered>
    );
  }

  const confirmed = !!app.shadowConfirmedAt;
  const declined = !!app.shadowResponseNote && !confirmed;

  const doConfirm = async () => {
    setBusy("confirm"); setError(null);
    try {
      await confirmApplicantShadowShift(app.id);
      const fresh = await fetchPublicShadowShift(app.id);
      if (fresh) setApp(fresh);
      setShowDecline(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm");
    } finally {
      setBusy(null);
    }
  };

  const doDecline = async () => {
    setBusy("decline"); setError(null);
    try {
      await declineApplicantShadowShift(app.id, note.trim());
      const fresh = await fetchPublicShadowShift(app.id);
      if (fresh) setApp(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5">
        <Link to="/"><Logo /></Link>
      </header>
      <section className="bg-gradient-hero text-primary-foreground">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <CalendarClock className="h-3 w-3" /> Shadow shift invite
          </div>
          <h1 className="mt-4 text-3xl font-bold">Congratulations {firstName}! 🎉</h1>
          <p className="mt-2 text-white/90">
            {restaurantName} would like to invite you for a shadow shift
            {app.role ? <> for the <span className="font-semibold">{app.role}</span> role</> : null}.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-4 py-8 space-y-4">
        <Card className="border-2">
          <CardContent className="grid gap-3 p-5">
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">When</p>
                <p className="font-semibold">{shift.date} at {shift.time}</p>
              </div>
            </div>
            {shift.dressCode && (
              <div className="flex items-start gap-3">
                <Shirt className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Dress code</p>
                  <p className="font-medium">{shift.dressCode}</p>
                </div>
              </div>
            )}
            {shift.instructions && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Instructions</p>
                <p>{shift.instructions}</p>
              </div>
            )}
            <p className="text-sm text-muted-foreground">We look forward to meeting you!</p>
          </CardContent>
        </Card>

        {confirmed && (
          <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
            <p className="inline-flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" /> You're confirmed
            </p>
            <p className="mt-1 text-muted-foreground">
              {restaurantName} has been notified. See you {shift.date} at {shift.time}.
            </p>
          </div>
        )}

        {declined && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
            <p className="inline-flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4" /> You let them know you can't make it
            </p>
            <p className="mt-1 text-muted-foreground">
              Note sent: "{app.shadowResponseNote}". {restaurantName} will reach out to reschedule.
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={doConfirm} disabled={busy !== null}>
              Actually, I can make it
            </Button>
          </div>
        )}

        {!confirmed && !declined && (
          <Card>
            <CardContent className="grid gap-3 p-5">
              {!showDecline ? (
                <>
                  <Button size="lg" onClick={doConfirm} disabled={busy !== null}>
                    {busy === "confirm" ? "Confirming…" : "Confirm — I'll be there"}
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => setShowDecline(true)} disabled={busy !== null}>
                    Can't make it
                  </Button>
                </>
              ) : (
                <>
                  <label className="text-sm font-medium" htmlFor="reason">
                    Quick note for {restaurantName} (optional)
                  </label>
                  <Textarea
                    id="reason"
                    rows={4}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. I have a conflict that day — any chance of another time?"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={doDecline} disabled={busy !== null}>
                      {busy === "decline" ? "Sending…" : "Send"}
                    </Button>
                    <Button variant="ghost" onClick={() => setShowDecline(false)} disabled={busy !== null}>
                      Cancel
                    </Button>
                  </div>
                </>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Badge variant="secondary" className="w-fit text-[10px]">
                {restaurantName} will be notified either way.
              </Badge>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5">
        <Link to="/"><Logo /></Link>
      </header>
      <div className="mx-auto max-w-md px-4 py-16 text-center">{children}</div>
    </div>
  );
}
