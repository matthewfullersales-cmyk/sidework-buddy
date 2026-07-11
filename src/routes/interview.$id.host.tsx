import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Video, Loader2, CheckCircle2 } from "lucide-react";
import { fetchPublicInterview, hostCompleteInterview, type PublicInterviewInfo } from "@/lib/hiring-supabase";

export const Route = createFileRoute("/interview/$id/host")({
  ssr: false,
  head: () => ({ meta: [{ title: "Host Interview — 86Paper" }] }),
  component: HostInterviewPage,
});

function formatSlot(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function HostInterviewPage() {
  const { id } = Route.useParams();
  const [app, setApp] = useState<PublicInterviewInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicInterview(id)
      .then((res) => {
        if (cancelled) return;
        if (!res) { setNotFound(true); return; }
        setApp(res);
        setNotes(res.interviewNotes ?? "");
      })
      .catch((e) => { console.error(e); if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <Shell>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
      </Shell>
    );
  }

  if (notFound || !app) {
    return (
      <Shell>
        <div className="text-center">
          <h1 className="text-2xl font-bold">Interview not found</h1>
          <p className="mt-2 text-muted-foreground">This link may have expired.</p>
        </div>
      </Shell>
    );
  }

  const applicantName = app.firstName ?? app.name;
  const type = app.interviewType ?? "video";
  const restaurantName = app.restaurantName ?? "your restaurant";
  const hostLabel = restaurantName;

  const join = async () => {
    setJoining(true); setJoinError(null);
    try {
      const { getOrCreateInterviewRoom } = await import("@/lib/daily.functions");
      const res = await getOrCreateInterviewRoom({ data: { applicationId: app.id } });
      setRoomUrl(res.url);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "Could not start video call");
    } finally {
      setJoining(false);
    }
  };

  const save = async (markComplete: boolean) => {
    setSaving(true); setSaveError(null); setSaved(false);
    try {
      await hostCompleteInterview(app.id, notes);
      const fresh = await fetchPublicInterview(app.id);
      if (fresh) setApp(fresh);
      setSaved(true);
      if (markComplete) {
        // no-op; host_complete_interview already transitions to interviewed
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save notes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Host interview · {restaurantName}</p>
        <h1 className="mt-1 text-2xl font-bold">Interview with {applicantName}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {app.role && <Badge variant="secondary">{app.role}</Badge>}
          {app.jobTitle && <span>· {app.jobTitle}</span>}
          <span>· Assigned to <span className="font-medium text-foreground">{assignee}</span></span>
        </div>
        {app.selectedSlot && (
          <p className="mt-2 text-sm">
            <span className="font-semibold">{formatSlot(app.selectedSlot)}</span>
            {" — "}applicant phone: <span className="font-medium">{app.phone}</span>
          </p>
        )}
        {app.stage === "interviewed" && (
          <Badge className="mt-2 bg-success text-success-foreground">Marked complete</Badge>
        )}
      </div>

      {type === "video" && (
        <Card className="mb-6">
          <CardContent className="p-4">
            {roomUrl ? (
              <>
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
                  <iframe
                    title="Video interview"
                    src={`${roomUrl}?userName=${encodeURIComponent(assignee)}`}
                    allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
                    className="h-full w-full border-0"
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Allow camera & microphone when prompted.</p>
              </>
            ) : (
              <>
                <Button onClick={join} disabled={joining} className="w-full sm:w-auto">
                  <Video className="mr-2 h-4 w-4" />
                  {joining ? "Starting video…" : "Join video call"}
                </Button>
                {joinError && <p className="mt-2 text-sm text-destructive">{joinError}</p>}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-3 p-4">
          <Label htmlFor="notes">Interview notes</Label>
          <Textarea
            id="notes"
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it go? Strengths, concerns, follow-ups…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => save(true)} disabled={saving}>
              {saving ? "Saving…" : "Save & mark complete"}
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
            {saveError && <span className="text-sm text-destructive">{saveError}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            Notes are visible to {restaurantName}'s hiring team.
          </p>
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5">
        <Link to="/"><Logo /></Link>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-6">{children}</div>
    </div>
  );
}
