import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStore, type InterviewType } from "@/lib/sidework-store";
import { CheckCircle2, Video, Phone, MapPin } from "lucide-react";

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

const TYPE_COPY: Record<InterviewType, {
  emoji: string;
  Icon: typeof Video;
  badge: string;
  intro: (r: string) => string;
}> = {
  video: {
    emoji: "📹",
    Icon: Video,
    badge: "5-minute video call",
    intro: (r) => `Great news — ${r} would like to schedule a quick 5 minute video call with you. Please select a time that works for you.`,
  },
  in_person: {
    emoji: "🤝",
    Icon: MapPin,
    badge: "In-person interview",
    intro: (r) => `Great news — ${r} would like to meet you in person. Please select a time that works for your interview.`,
  },
  phone: {
    emoji: "📞",
    Icon: Phone,
    badge: "Quick phone screen",
    intro: (r) => `Great news — ${r} would like to schedule a quick phone call with you. Please select a time that works for you.`,
  },
};

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
  const type: InterviewType = app.interviewType ?? "video";
  const copy = TYPE_COPY[type];

  if (app.stage === "video_scheduled" && app.selectedSlot) {
    const confirmationLine =
      type === "video"
        ? <>Your video interview is confirmed for <span className="font-semibold text-foreground">{formatSlot(app.selectedSlot)}</span>. You'll receive a link to join 30 minutes before.</>
        : type === "in_person"
        ? <>Your interview is confirmed for <span className="font-semibold text-foreground">{formatSlot(app.selectedSlot)}</span>. Please come to {restaurantName}. Ask for the manager when you arrive.</>
        : <>Your phone interview is confirmed for <span className="font-semibold text-foreground">{formatSlot(app.selectedSlot)}</span>. We'll call you at {app.phone}. Please make sure you're available.</>;
    return (
      <Centered>
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/15">
          <CheckCircle2 className="h-12 w-12 text-success" />
        </div>
        <h1 className="mt-6 text-3xl font-bold">You're confirmed!</h1>
        <p className="mt-3 text-base text-muted-foreground">{confirmationLine}</p>
        {type === "video" && (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              When it's time, tap below to join. You'll need camera and microphone access.
            </p>
            <JoinCallButton applicationId={app.id} userName={firstName} />
          </>
        )}
        {type === "in_person" && (
          <p className="mt-4 text-sm text-muted-foreground">We'll send a reminder 24 hours and 1 hour before.</p>
        )}
        {type === "phone" && (
          <p className="mt-4 text-sm text-muted-foreground">We'll send a reminder 30 minutes before.</p>
        )}
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
            <copy.Icon className="h-3 w-3" /> {copy.badge}
          </div>
          <h1 className="mt-4 text-3xl font-bold">Hi {firstName}! 👋</h1>
          <p className="mt-2 text-white/90">{copy.intro(restaurantName)}</p>
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
                className="h-auto min-h-14 justify-start py-4 text-base"
              >
                {picking === slot ? "Confirming…" : formatSlot(slot)}
              </Button>
            ))}
            <p className="mt-2 text-xs text-muted-foreground">
              Both you and {restaurantName} will get a confirmation, plus a reminder{" "}
              {type === "in_person" ? "24 hours and 1 hour" : type === "phone" ? "30 minutes" : "30 minutes"} before.
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

function JoinCallButton({ applicationId, userName }: { applicationId: string; userName: string }) {
  const [loading, setLoading] = useState(false);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setLoading(true);
    setError(null);
    try {
      const { getOrCreateInterviewRoom } = await import("@/lib/daily.functions");
      const res = await getOrCreateInterviewRoom({ data: { applicationId } });
      setRoomUrl(res.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start video call");
    } finally {
      setLoading(false);
    }
  };

  if (roomUrl) {
    return (
      <div className="mt-6">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            title="Video interview"
            src={`${roomUrl}?userName=${encodeURIComponent(userName)}`}
            allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
            className="h-full w-full border-0"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Allow camera & microphone when prompted.</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <Button size="lg" className="w-full shadow-elegant" onClick={join} disabled={loading}>
        <Video className="mr-2 h-4 w-4" />
        {loading ? "Starting video…" : "Join video call"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
