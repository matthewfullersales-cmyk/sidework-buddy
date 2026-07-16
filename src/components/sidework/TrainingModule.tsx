import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { pickRandomQuestions, type TrainingVideo, type VideoProgress } from "@/lib/sidework-store";

const QUIZ_SIZE = 5;
const SECONDS_PER_Q = 30;
const PASS_PCT = 80;

export function TrainingModule({
  video,
  progress,
  onVideoComplete,
  onQuizSubmit,
}: {
  video: TrainingVideo;
  progress: VideoProgress | undefined;
  onVideoComplete: () => void;
  onQuizSubmit: (score: number, passed: boolean) => void;
}) {
  const [watched, setWatched] = useState(Math.min(progress?.watchedSec ?? 0, video.durationSec));
  const [playing, setPlaying] = useState(false);
  const tRef = useRef<number | null>(null);
  const videoComplete = watched >= video.durationSec;
  const passed = !!progress?.passed;
  const attempts = progress?.attempts ?? 0;
  const lockedOut = !passed && attempts >= MAX_ATTEMPTS;

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
              <CheckIcon className="h-3.5 w-3.5" /> Complete · {progress?.quizScore}%
            </Badge>
          ) : lockedOut ? (
            <Badge variant="secondary" className="bg-destructive/10 text-destructive">Locked out</Badge>
          ) : (
            <Badge variant="secondary">Attempts {attempts}/{MAX_ATTEMPTS}</Badge>
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
          video={video}
          unlocked={videoComplete}
          passed={passed}
          lockedOut={lockedOut}
          attempts={attempts}
          onSubmit={onQuizSubmit}
        />
      </CardContent>
    </Card>
  );
}

function QuizSection({
  video, unlocked, passed, lockedOut, attempts, onSubmit,
}: {
  video: TrainingVideo;
  unlocked: boolean;
  passed: boolean;
  lockedOut: boolean;
  attempts: number;
  onSubmit: (score: number, passed: boolean) => void;
}) {
  const [started, setStarted] = useState(false);
  const [questions, setQuestions] = useState<typeof video.quiz>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_Q);
  const [done, setDone] = useState<{ score: number; passed: boolean } | null>(null);

  // start: shuffle questions
  const beginQuiz = () => {
    const qs = pickRandomQuestions(video.quiz, Math.min(QUIZ_SIZE, video.quiz.length));
    setQuestions(qs);
    setIdx(0);
    setAnswers({});
    setTimeLeft(SECONDS_PER_Q);
    setDone(null);
    setStarted(true);
  };

  const finish = (finalAnswers: Record<number, number>) => {
    let correct = 0;
    questions.forEach((q, i) => { if (finalAnswers[i] === q.answerIndex) correct++; });
    const score = Math.round((correct / questions.length) * 100);
    const didPass = score >= PASS_PCT;
    setDone({ score, passed: didPass });
    setStarted(false);
    onSubmit(score, didPass);
  };

  // countdown timer per question
  useEffect(() => {
    if (!started || done) return;
    if (timeLeft <= 0) {
      // auto-advance, no answer = wrong
      if (idx + 1 >= questions.length) {
        finish(answers);
      } else {
        setIdx((i) => i + 1);
        setTimeLeft(SECONDS_PER_Q);
      }
      return;
    }
    const t = window.setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, timeLeft, idx, done]);

  const pickAnswer = (j: number) => {
    const next = { ...answers, [idx]: j };
    setAnswers(next);
    if (idx + 1 >= questions.length) {
      finish(next);
    } else {
      setIdx((i) => i + 1);
      setTimeLeft(SECONDS_PER_Q);
    }
  };

  // Gates
  if (!unlocked) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <LockIcon className="h-4 w-4" />
        Quiz locked. Finish the video to unlock.
      </div>
    );
  }
  if (passed) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm font-medium text-success">
        <CheckIcon className="h-4 w-4" />
        Module complete. Your manager has been notified.
      </div>
    );
  }
  if (lockedOut) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <p className="font-semibold">No attempts remaining.</p>
        <p className="mt-1 opacity-90">Your manager has been notified to reset this module.</p>
      </div>
    );
  }

  // Idle (not started yet)
  if (!started) {
    return (
      <div className="rounded-xl border border-border bg-background p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Ready for the quiz?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {QUIZ_SIZE} random questions · {SECONDS_PER_Q}s per question · pass at {PASS_PCT}%.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Attempts remaining: <span className="font-semibold text-foreground">{MAX_ATTEMPTS - attempts}/{MAX_ATTEMPTS}</span>
            </p>
            {done && !done.passed && (
              <p className="mt-2 text-xs text-destructive">Last attempt: {done.score}% — try again.</p>
            )}
          </div>
          <Button onClick={beginQuiz}>Start quiz</Button>
        </div>
      </div>
    );
  }

  // Active quiz
  const q = questions[idx];
  const timerPct = Math.round((timeLeft / SECONDS_PER_Q) * 100);
  return (
    <div className="rounded-xl border border-primary/30 bg-primary-soft p-4 sm:p-5">
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
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5 active:bg-primary-soft"
          >
            {opt}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">No going back. Don't Google — answer from memory.</p>
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
