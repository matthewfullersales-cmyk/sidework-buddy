import { useEffect, useState, useCallback } from "react";
import { Bell, BellRing, BellOff, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { pushIsSupported, currentPushState, enablePush, disablePush, type PushState } from "@/lib/push-client";
import { listMyNotifications, markMyNotificationsRead } from "@/lib/notifications.functions";

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  created_at: string;
  read_at: string | null;
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const s = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Persistent banner shown on the employee dashboard when push is available
 *  but not yet enabled. Non-modal — matches the InstallPrompt philosophy. */
export function EnablePushBanner() {
  const [state, setState] = useState<PushState>("unsupported");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(localStorage.getItem("sw-push-banner-dismissed") === "1");
    void currentPushState().then(setState);
  }, []);

  if (!pushIsSupported() || state === "unsupported" || state === "subscribed" || dismissed) return null;

  const isBlocked = state === "denied";

  return (
    <Card className="mb-4 border-primary/40 bg-primary/5">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {isBlocked ? <BellOff className="mt-0.5 h-5 w-5 text-muted-foreground" /> : <BellRing className="mt-0.5 h-5 w-5 text-primary" />}
          <div>
            <p className="text-sm font-medium">
              {isBlocked ? "Notifications are blocked" : "Get notified about schedule changes"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isBlocked
                ? "Enable notifications in your browser settings so we can alert you to new schedules, open shifts, and time-off decisions."
                : "New schedules, shift-trade posts, and time-off decisions — sent to this device even when the app is closed."}
            </p>
          </div>
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <Button variant="ghost" size="sm" onClick={() => {
            localStorage.setItem("sw-push-banner-dismissed", "1");
            setDismissed(true);
          }}>Not now</Button>
          {!isBlocked && (
            <Button size="sm" disabled={busy} onClick={async () => {
              setBusy(true);
              const res = await enablePush();
              setBusy(false);
              if (res.ok) {
                toast.success("Notifications enabled");
                setState("subscribed");
              } else {
                toast.error(res.reason);
                setState(await currentPushState());
              }
            }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Full push settings toggle — shown inside the Profile tab. */
export function PushSettings() {
  const [state, setState] = useState<PushState>("unsupported");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => { void currentPushState().then(setState); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const label = {
    unsupported: "Not supported in this browser",
    denied: "Blocked — change in browser settings",
    "granted-unsubscribed": "Off",
    default: "Off",
    subscribed: "On — this device",
  }[state];

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm">Push notifications</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        <div className="flex gap-2">
          {state === "subscribed" ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
              setBusy(true);
              await disablePush();
              setBusy(false);
              toast.success("Notifications turned off");
              refresh();
            }}>Turn off</Button>
          ) : (
            <Button size="sm" disabled={busy || state === "unsupported" || state === "denied"} onClick={async () => {
              setBusy(true);
              const res = await enablePush();
              setBusy(false);
              if (res.ok) { toast.success("Notifications enabled"); }
              else { toast.error(res.reason); }
              refresh();
            }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Turn on"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Persistent in-app inbox. Loads on mount and marks unread as read on open. */
export function NotificationInbox() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMyNotifications();
      setItems(res.items as Notif[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    // Mark read once the user has opened the tab.
    const t = setTimeout(() => { void markMyNotificationsRead().then(load).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [load]);

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" /> Notifications
          {unread > 0 && <Badge>{unread}</Badge>}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
      </CardHeader>
      <CardContent className="grid gap-2">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing yet. You'll see schedule updates, open shifts, and time-off decisions here.</p>
        )}
        {items.map((n) => (
          <div key={n.id} className={`rounded-md border p-3 ${n.read_at ? "" : "bg-primary/5 border-primary/30"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{n.title}</p>
              <span className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
            </div>
            {n.body && <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
