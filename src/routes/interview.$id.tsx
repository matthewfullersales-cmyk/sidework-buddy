import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/sidework-store";
import { CheckCircle2, Video } from "lucide-react";

export const Route = createFileRoute("/interview/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Confirm Interview — Sidework" }] }),
  component: InterviewConfirmPage,
});

function formatSlot(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function InterviewConfirmPage() {
  const { id } = Route.useParams();
  const { applications, applicantSelectSlot, restaurantProfile } = useStore();
  const app = useMemo(() => applications.find((a) => a.id === id), [applications, id]);
  const restaurantName = restaurantProfile?.name ?? "the team";
  const [picking, setPicking] = useState<string | null>(null);

  if (!app) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">Interview link not found</h1>
        <p className="mt-2 text-muted-foreground">This link may have expired.</p>
        <Button asChild className="mt-6"><Link to="/">Go home</Link></Button>
      </Centered>
    );
  }

  const firstName = app.firstName ?? app.name.split(" ")[0];

  if (app.stage === "video_scheduled" && app.selectedSlot) {
    return (
      <Centered>
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/15">
          <CheckCircle2 className="h-12 w-12 text-success" />
        </div>
        <h1 className="mt-6 text-3xl font-bold">You're confirmed!</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Your video interview is confirmed for <span className="font-semibold text-foreground">{formatSlot(app.selectedSlot)}</span>.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          You'll receive a link to join 30 minutes before.
        </p>
      </Centered>
    );
  }

  if (!app.offeredSlots || app.offeredSlots.length === 0) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">No times offered yet</h1>
        <p className="mt-2 text-muted-foreground">
          {restaurantName} hasn't sent you interview times yet. Check back soon!
        </p>
      </Centered>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5">
        <Link to="/"><Logo /></Link>
      </header>
      <section className="bg-gradient-hero text-primary-foreground">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <Video className="h-3 w-3" /> 5-minute video call
          </div>
          <h1 className="mt-4 text-3xl font-bold">Hi {firstName}! 👋</h1>
          <p className="mt-2 text-white/90">
            Great news — {restaurantName} would like to schedule a quick 5 minute video call with you. Please select a time that works for you.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-2xl px-4 py-8">
        <Card className="border-2">
          <CardContent className="grid gap-3 p-5">
            {app.offeredSlots.map((slot) => (
              <Button
                key={slot}
                size="lg"
                variant="outline"
                disabled={picking !== null}
                onClick={async () => {
                  setPicking(slot);
                  await new Promise((r) => setTimeout(r, 600));
                  applicantSelectSlot(app.id, slot);
                }}
                className="h-auto justify-start py-4 text-base"
              >
                {picking === slot ? "Confirming…" : formatSlot(slot)}
              </Button>
            ))}
            <p className="mt-2 text-xs text-muted-foreground">
              Both you and {restaurantName} will get a confirmation, plus a reminder 30 minutes before with the join link.
            </p>
          </CardContent>
        </Card>
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
