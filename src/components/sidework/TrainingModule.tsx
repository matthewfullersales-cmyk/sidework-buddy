import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { TrainingVideo, VideoProgress } from "@/lib/sidework-store";
import {
  startQuizAttempt,
  submitQuizAttempt,
  type PublicQuestion,
} from "@/lib/quiz.functions";

const DEFAULT_SECONDS_PER_Q = 30;
const DEFAULT_PASS_PCT = 80;

export type QuizAttemptOutcome = {
  score: number;
  passed: boolean;
  attempts: number;
  distractionFlagged: boolean;
};

export function TrainingModule({
  video,
  employeeId,
  progress,
  onVideoComplete,
  onQuizSubmit,
}: {
  video: TrainingVideo;
  employeeId: string;
  progress: VideoProgress | undefined;
  onVideoComplete: () => void;
  onQuizSubmit: (result: QuizAttemptOutcome) => void;
}) {
  const [watched, setWatched] = useState(Math.min(progress?.watchedSec ?? 0, video.durationSec));
  const [playing, setPlaying] = useState(false);
  const tRef = useRef<number | null>(null);
  const videoComplete = watched >= video.durationSec;
  const passed = !!progress?.passed;
  const attempts = progress?.attempts ?? 0;

  useEffect(() => {
    if (!playing) return;
    tRef.current = window.setInterval(() => {
      setWatched((w) => {
        if (w + 1 >= video.durationSec) {
          setPlaying(false);
          onVideoComplete();
          return video.durationSec;
        }
        return w + 1;
      });
    }, 1000);
    return () => { if (tRef.current) window.clearInterval(tRef.current); };
  }, [playing, video.durationSec, onVideoComplete]);

  const pct = Math.round((watched / video.durationSec) * 100);

  return (
    <Card className="overflow-hidden border-border">
      <CardContent className="space-y-5 p-4 sm:p-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{video.role} module</p>
            <h3 className="mt-0.5 text-base font-semibold sm:text-lg">{video.title}</h3>
          </div>
          {passed ? (
            <Badge className="bg-success text-success-foreground hover:bg-success gap-1.5">
              <CheckIcon className="h-3.5 w-3.5" /> Complete · {progress?.quizScore}% · attempt {attempts}
            </Badge>
          ) : attempts > 0 ? (
            <Badge variant="secondary">Attempt {attempts} · unlimited retakes</Badge>
          ) : (
            <Badge variant="secondary">Not started</Badge>
          )}
        </div>

        {/* Video */}
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="relative grid aspect-video place-items-center bg-gradient-to-br from-primary to-[oklch(0.18_0.05_155)] text-primary-foreground">
            <div className="text-center">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-white/15 backdrop-blur">
                {videoComplete ? <CheckIcon className="h-6 w-6" />
                  : playing ? <PauseIcon className="h-6 w-6" />
                  : <PlayIcon className="h-6 w-6" />}
              </div>
              <p className="px-6 text-sm font-medium opacity-90">{video.title}</p>
              <p className="mt-1 text-xs opacity-70">{watched}s / {video.durationSec}s</p>
            </div>
          </div>
          <div className="space-y-3 bg-card p-3 sm:p-4">
            <Progress value={pct} className="h-2" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {videoComplete ? "Video complete — quiz unlocked." : "Watch the full video to unlock the quiz."}
              </p>
              {!videoComplete && (
                <Button size="sm" onClick={() => setPlaying((p) => !p)}>
                  {playing ? "Pause" : watched > 0 ? "Resume" : "Play"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Quiz */}
        <QuizSection
          videoId={video.id}
          employeeId={employeeId}
          unlocked={videoComplete}
          passed={passed}
          attempts={attempts}
          onSubmit={onQuizSubmit}
        />
      </CardContent>
    </Card>
  );
}

function QuizSection({
  videoId, employeeId, unlocked, passed, attempts, onSubmit,
}: {
  videoId: string;
  employeeId: string;
  unlocked: boolean;
  passed: boolean;
  attempts: number;
  onSubmit: (result: QuizAttemptOutcome) => void;
}) {
  const start = useServerFn(startQuizAttempt);
  const submit = useServerFn(submitQuizAttempt);

  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [secondsPerQ, setSecondsPerQ] = useState(DEFAULT_SECONDS_PER_Q);
  const [passPct, setPassPct] = useState(DEFAULT_PASS_PCT);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_SECONDS_PER_Q);
  const [done, setDone] = useState<QuizAttemptOutcome | null>(null);
  // Anti-cheat: flip true if user backgrounds tab or window blurs during
  // an active attempt. We don't fail them — just surface it to the manager.
  const [distractionFlagged, setDistractionFlagged] = useState(false);
  const distractionRef = useRef(false);
  const active = attemptId !== null && !done;

  // Watch for tab/app switches while the quiz is active.
  useEffect(() => {
    if (!active) return;
    const flag = () => {
      if (!distractionRef.current) {
        distractionRef.current = true;
        setDistractionFlagged(true);
      }
    };
    const onVis = () => { if (document.visibilityState === "hidden") flag(); };
    window.addEventListener("blur", flag);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", flag);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active]);

  const finishAttempt = async (finalAnswers: number[]) => {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    try {
      const res = await submit({
        data: {
          attemptId,
          answers: finalAnswers,
          distractionFlagged: distractionRef.current,
        },
      });
      if (!res.ok) {
        setError(res.error);
        setSubmitting(false);
        return;
      }
      const outcome: QuizAttemptOutcome = {
        score: res.score,
        passed: res.passed,
        attempts: res.attempts,
        distractionFlagged: res.distractionFlagged,
      };
      setDone(outcome);
      setAttemptId(null);
      onSubmit(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit quiz.");
    } finally {
      setSubmitting(false);
    }
  };

  const beginQuiz = async () => {
    setError(null);
    setDone(null);
    setStarting(true);
    setDistractionFlagged(false);
    distractionRef.current = false;
    try {
      const res = await start({ data: { employeeId, videoId } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAttemptId(res.attemptId);
      setQuestions(res.questions);
      setSecondsPerQ(res.secondsPerQuestion);
      setPassPct(res.passingScore);
      setIdx(0);
      setAnswers(new Array(res.questions.length).fill(-1));
      setTimeLeft(res.secondsPerQuestion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start quiz.");
    } finally {
      setStarting(false);
    }
  };

  // Countdown timer per question (no going back).
  useEffect(() => {
    if (!active) return;
    if (timeLeft <= 0) {
      if (idx + 1 >= questions.length) {
        finishAttempt(answers);
      } else {
        setIdx((i) => i + 1);
        setTimeLeft(secondsPerQ);
      }
      return;
    }
    const t = window.setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, timeLeft, idx]);

  const pickAnswer = (j: number) => {
    if (!active) return;
    const next = [...answers];
    next[idx] = j;
    setAnswers(next);
    if (idx + 1 >= questions.length) {
      finishAttempt(next);
    } else {
      setIdx((i) => i + 1);
      setTimeLeft(secondsPerQ);
    }
  };

  // --- Gates ---
  if (!unlocked) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <LockIcon className="h-4 w-4" />
        Quiz locked. Finish the video to unlock.
      </div>
    );
  }
  if (passed && !active && !done) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm font-medium text-success">
        <CheckIcon className="h-4 w-4" />
        Module complete. Your manager has been notified.
      </div>
    );
  }
  if (!active) {
    return (
      <div className="rounded-xl border border-border bg-background p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Ready for the quiz?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              5 random questions · 30s per question · pass at {passPct}%.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Unlimited retakes — retry immediately if you don't pass. {attempts > 0 && <>Attempts so far: <span className="font-semibold text-foreground">{attempts}</span></>}
            </p>
            {done && !done.passed && (
              <p className="mt-2 text-xs text-destructive">Last attempt: {done.score}% — try again.</p>
            )}
            {error && (
              <p className="mt-2 text-xs text-destructive">{error}</p>
            )}
          </div>
          <Button onClick={beginQuiz} disabled={starting}>
            {starting ? "Starting…" : "Start quiz"}
          </Button>
        </div>
      </div>
    );
  }

  // Active quiz
  const q = questions[idx];
  const timerPct = Math.round((timeLeft / secondsPerQ) * 100);
  return (
    <div
      className="rounded-xl border border-primary/30 bg-primary-soft p-4 sm:p-5 select-none"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitUserSelect: "none", userSelect: "none" }}
    >
      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-primary">
        <span>Question {idx + 1} of {questions.length}</span>
        <span className={timeLeft <= 5 ? "text-destructive" : ""}>⏱ {timeLeft}s</span>
      </div>
      <Progress value={timerPct} className="h-1.5" />
      <p className="mt-4 text-sm font-medium sm:text-base">{q.question}</p>
      <div className="mt-3 grid gap-2">
        {q.options.map((opt, j) => (
          <button
            key={j}
            onClick={() => pickAnswer(j)}
            disabled={submitting}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5 active:bg-primary-soft"
          >
            {opt}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        No going back. Don't Google — answer from memory.
        {distractionFlagged && (
          <span className="ml-2 font-semibold text-amber-600 dark:text-amber-400">
            ⚠ Tab switch detected — this attempt will be flagged.
          </span>
        )}
      </p>
    </div>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function PlayIcon({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor"><polygon points="7 5 19 12 7 19 7 5" /></svg>;
}
function PauseIcon({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>;
}
function LockIcon({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
}
