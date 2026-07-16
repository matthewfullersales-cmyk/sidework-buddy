import { useEffect, useState } from "react";
import { X, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const VISIT_KEY = "86p_visit_count";
const DISMISS_KEY = "86p_install_dismissed_at";
const MIN_VISITS = 2;
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;

    // Increment visit count once per page load
    try {
      const visits = Number(localStorage.getItem(VISIT_KEY) || "0") + 1;
      localStorage.setItem(VISIT_KEY, String(visits));
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || "0");
      const cooledDown = !dismissedAt || Date.now() - dismissedAt > DISMISS_COOLDOWN_MS;
      if (visits < MIN_VISITS || !cooledDown) return;

      const handler = (e: Event) => {
        e.preventDefault();
        setDeferred(e as BeforeInstallPromptEvent);
        setShow(true);
      };
      window.addEventListener("beforeinstallprompt", handler);

      // iOS fallback (no beforeinstallprompt support)
      if (isIos()) {
        setIosHint(true);
        setShow(true);
      }

      return () => window.removeEventListener("beforeinstallprompt", handler);
    } catch {
      // localStorage unavailable — skip
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setShow(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-xl border border-border bg-card p-4 shadow-bold md:bottom-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
          86
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Install 86Paper</p>
          {iosHint ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Tap <Share className="inline h-3.5 w-3.5 align-text-bottom" /> then
              <span className="mx-1 font-medium">Add to Home Screen</span>
              <Plus className="inline h-3.5 w-3.5 align-text-bottom" /> for a full-screen app experience.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Add it to your home screen for quick access and a full-screen app experience.
            </p>
          )}
          {!iosHint && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={install} className="h-9">Install</Button>
              <Button size="sm" variant="ghost" onClick={dismiss} className="h-9">Not now</Button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
