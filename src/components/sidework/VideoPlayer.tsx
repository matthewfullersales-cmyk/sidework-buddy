import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/** Simulated video player — counts up to duration. Prevents skipping. */
export function VideoPlayer({
  title,
  durationSec,
  initialWatched,
  onComplete,
}: {
  title: string;
  durationSec: number;
  initialWatched: number;
  onComplete: () => void;
}) {
  const [watched, setWatched] = useState(Math.min(initialWatched, durationSec));
  const [playing, setPlaying] = useState(false);
  const ref = useRef<number | null>(null);
  const completed = watched >= durationSec;

  useEffect(() => {
    if (!playing) return;
    ref.current = window.setInterval(() => {
      setWatched((w) => {
        if (w + 1 >= durationSec) {
          setPlaying(false);
          onComplete();
          return durationSec;
        }
        return w + 1;
      });
    }, 1000);
    return () => { if (ref.current) window.clearInterval(ref.current); };
  }, [playing, durationSec, onComplete]);

  const pct = Math.round((watched / durationSec) * 100);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative grid aspect-video place-items-center bg-gradient-to-br from-primary to-[oklch(0.22_0.05_155)] text-primary-foreground">
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-white/15 backdrop-blur">
            {completed ? (
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            ) : playing ? (
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><polygon points="7 5 19 12 7 19 7 5" /></svg>
            )}
          </div>
          <p className="px-6 text-sm font-medium opacity-90">{title}</p>
          <p className="mt-1 text-xs opacity-70">{Math.floor(watched)}s / {durationSec}s</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <Progress value={pct} className="h-2" />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {completed ? "Video complete — quiz unlocked." : "Watch the full video to unlock the quiz. No skipping."}
          </p>
          {!completed && (
            <Button size="sm" onClick={() => setPlaying((p) => !p)}>
              {playing ? "Pause" : watched > 0 ? "Resume" : "Play"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
