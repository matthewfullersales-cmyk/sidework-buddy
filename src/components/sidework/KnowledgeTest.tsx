// Direct knowledge test. No video, no watching prerequisite — the employee
// starts the test straight away. Questions are served ONE AT A TIME by the
// server, which also measures how long each answer took (see
// src/lib/quiz.functions.ts). The client never holds the full question set.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { VideoProgress } from "@/lib/sidework-store";
import {
  startQuizAttempt,
  answerQuizQuestion,
  submitQuizAttempt,
  type PublicQuestion,
} from "@/lib/quiz.functions";

const DEFAULT_PASS_PCT = 80;

export type QuizAttemptOutcome = {
  score: number;
  passed: boolean;
  attempts: number;
  distractionFlagged: boolean;
  /**
   * Menu bank version this attempt was graded against (menu test only).
   * Must be carried into the store so a fresh pass immediately clears the
   * "retake required" state without a page reload.
   */
  bankVersion?: number;
};

export function KnowledgeTest({
  testId,
  title,
  description,
  employeeId,
  progress,
  retakeRequired = false,
  onQuizSubmit,
}: {
  /** Stable test id — persisted as `video_id` on training_progress rows. */
  testId: string;
  title: string;
  description?: string;
  employeeId: string;
  progress: VideoProgress | undefined;
  /** Prior pass is stale (e.g. menu republished) — force a retake affordance. */
  retakeRequired?: boolean;
  onQuizSubmit: (result: QuizAttemptOutcome) => void;
}) {
  const passed = !!progress?.passed && !retakeRequired;
  const attempts = progress?.attempts ?? 0;

  return (
    <Card className="overflow-hidden border-border">
      <CardContent className="space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Knowledge test</p>
            <h3 className="mt-0.5 text-base font-semibold sm:text-lg">{title}</h3>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {passed ? (
            <Badge className="bg-success text-success-foreground hover:bg-success gap-1.5">
              <CheckIcon className="h-3.5 w-3.5" /> Passed · {progress?.quizScore}% · attempt {attempts}
            </Badge>
          ) : retakeRequired ? (
            <Badge variant="destructive">Retake required</Badge>
          ) : attempts > 0 ? (
            <Badge variant="secondary">Attempt {attempts}</Badge>
          ) : (
            <Badge variant="secondary">Not started</Badge>
          )}
        </div>

        <QuizSection
          videoId={testId}
          employeeId={employeeId}
          passed={passed}
          attempts={attempts}
          onSubmit={onQuizSubmit}
        />
      </CardContent>
    </Card>
  );
}

type Outcome = QuizAttemptOutcome & { isPreview: boolean };

function QuizSection({
  videoId, employeeId, passed, attempts, onSubmit,
}: {
  videoId: string;
  employeeId: string;
  passed: boolean;
  attempts: number;
  onSubmit: (result: QuizAttemptOutcome) => void;
}) {
  const start = useServerFn(startQuizAttempt);
  const answer = useServerFn(answerQuizQuestion);
  const submit = useServerFn(submitQuizAttempt);

  const [starting, setStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the failure is recoverable — offers resume instead of restart. */
  const [canResume, setCanResume] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [idx, setIdx] = useState(0);
  const [total, setTotal] = useState(0);
  const [seconds, setSeconds] = useState(20);
  const [passPct, setPassPct] = useState(DEFAULT_PASS_PCT);
  const [isPreview, setIsPreview] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  const [done, setDone] = useState<Outcome | null>(null);
  // Anti-cheat: flip true if user backgrounds tab or window blurs during
  // an active attempt. We don't fail them — just surface it to the manager.
  const [distractionFlagged, setDistractionFlagged] = useState(false);
  const distractionRef = useRef(false);
  const busyRef = useRef(false);
  const active = attemptId !== null && question !== null && !done;

  // Watch for tab/app switches while the test is active.
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

  const finalize = async (id: string) => {
    const res = await submit({
      data: { attemptId: id, distractionFlagged: distractionRef.current },
    });
    if (!res.ok) {
      setError(res.error);
      setCanResume(false);
      return;
    }
    const outcome: Outcome = {
      score: res.score,
      passed: res.passed,
      attempts: res.attempts,
      distractionFlagged: res.distractionFlagged,
      bankVersion: res.bankVersion,
      isPreview: res.isPreview,
    };
    setDone(outcome);
    setAttemptId(null);
    setQuestion(null);
    // An owner preview is never recorded — don't push it into the store.
    if (!res.isPreview) onSubmit(outcome);
  };

  const sendAnswer = async (answerIndex: number) => {
    if (!attemptId || busyRef.current) return;
    busyRef.current = true;
    setChecking(true);
    setError(null);
    try {
      const res = await answer({ data: { attemptId, answerIndex } });
      if (!res.ok) {
        setError(res.error);
        setCanResume(false);
        return;
      }
      if (res.done) {
        await finalize(attemptId);
        return;
      }
      setQuestion(res.question);
      setIdx(res.index);
      setTotal(res.total);
      setSeconds(res.secondsForQuestion);
      setTimeLeft(res.secondsForQuestion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection lost.");
      setCanResume(true);
    } finally {
      busyRef.current = false;
      setChecking(false);
    }
  };

  const beginQuiz = async (resume = false) => {
    setError(null);
    setCanResume(false);
    if (!resume) {
      setDone(null);
      setDistractionFlagged(false);
      distractionRef.current = false;
    }
    setStarting(true);
    try {
      const res = await start({ data: { employeeId, videoId } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAttemptId(res.attemptId);
      setQuestion(res.question);
      setIdx(res.index);
      setTotal(res.total);
      setSeconds(res.secondsForQuestion);
      setTimeLeft(res.secondsForQuestion);
      setPassPct(res.passingScore);
      setIsPreview(res.isPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the test.");
      setCanResume(true);
    } finally {
      setStarting(false);
    }
  };

  // Countdown for the current question. The server is the authority on
  // timing — this just mirrors the window it granted.
  useEffect(() => {
    if (!active || checking) return;
    if (timeLeft <= 0) {
      // -1 = unanswered. The server decides whether it counts as timed out.
      void sendAnswer(-1);
      return;
    }
    const t = window.setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, checking, timeLeft, idx]);

  // --- Gates ---
  // A pass that just happened in this session wins over the parent's
  // (not-yet-updated) props, so the employee never sees "retake" after passing.
  if (done?.isPreview && !active) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <p className="font-semibold">Preview result: {done.score}% · {done.passed ? "would pass" : "would not pass"}</p>
          <p className="mt-1 text-muted-foreground">
            This was a manager preview — nothing was recorded for this employee.
          </p>
        </div>
        <Button variant="outline" onClick={() => beginQuiz()} disabled={starting}>
          {starting ? "Starting…" : "Preview again"}
        </Button>
      </div>
    );
  }
  if ((done?.passed || passed) && !active) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm font-medium text-success">
        <CheckIcon className="h-4 w-4" />
        Test passed{done?.passed ? ` with ${done.score}%` : ""}. Your manager has been notified.
      </div>
    );
  }
  if (!active) {
    return (
      <div className="rounded-xl border border-border bg-background p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Ready for the test?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Each question is timed and shown one at a time. You can't go back or
              change an answer once it's submitted. Pass at {passPct}%.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Your score and how quickly you answered each question are recorded and
              visible to management.
              {attempts > 0 && <> Attempts so far: <span className="font-semibold text-foreground">{attempts}</span></>}
            </p>
            {done && !done.passed && (
              <p className="mt-2 text-xs text-destructive">Last attempt: {done.score}% — try again.</p>
            )}
            {error && (
              <p className="mt-2 text-xs text-destructive">{error}</p>
            )}
          </div>
          <Button onClick={() => beginQuiz(canResume)} disabled={starting}>
            {starting ? (canResume ? "Resuming…" : "Starting…") : canResume ? "Resume test" : "Start test"}
          </Button>
        </div>
      </div>
    );
  }

  // Active test
  const q = question!;
  const timerPct = Math.round((timeLeft / Math.max(1, seconds)) * 100);
  return (
    <div
      className="rounded-xl border border-primary/30 bg-primary-soft p-4 sm:p-5 select-none"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-primary">
        <span>Question {idx + 1} of {total}{isPreview ? " · preview" : ""}</span>
        <span className={timeLeft <= 5 ? "text-destructive" : ""}>⏱ {timeLeft}s</span>
      </div>
      <Progress value={timerPct} className="h-1.5" />
      <p className="mt-4 text-sm font-medium sm:text-base">{q.question}</p>
      <div className="mt-3 grid gap-2">
        {q.options.map((opt, j) => (
          <Button
            key={j}
            type="button"
            variant="outline"
            onClick={() => void sendAnswer(j)}
            disabled={checking}
            className="h-auto min-h-10 justify-start whitespace-normal px-3 py-2.5 text-left text-sm hover:border-primary hover:bg-primary/5 active:bg-primary-soft"
          >
            {opt}
          </Button>
        ))}
      </div>
      {checking && (
        <p className="mt-3 text-xs font-medium text-primary">Checking…</p>
      )}
      {error && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-xs text-destructive">{error}</p>
          {canResume && (
            <Button size="sm" variant="outline" onClick={() => beginQuiz(true)} disabled={starting}>
              {starting ? "Resuming…" : "Retry"}
            </Button>
          )}
        </div>
      )}
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
