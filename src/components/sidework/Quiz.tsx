import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TrainingVideo } from "@/lib/sidework-store";

export function Quiz({
  video,
  locked,
  onResult,
}: {
  video: TrainingVideo;
  locked: boolean;
  onResult: (score: number, passed: boolean) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState<{ score: number; passed: boolean } | null>(null);

  if (locked) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Quiz locked. Finish the video to unlock.
        </CardContent>
      </Card>
    );
  }

  const submit = () => {
    let correct = 0;
    video.quiz.forEach((q, i) => { if (answers[i] === q.answerIndex) correct++; });
    const score = Math.round((correct / video.quiz.length) * 100);
    const passed = score >= video.passingScore;
    setSubmitted({ score, passed });
    onResult(score, passed);
  };

  const retake = () => { setAnswers({}); setSubmitted(null); };

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Quiz</h3>
          <span className="text-xs text-muted-foreground">Pass: {video.passingScore}%</span>
        </div>
        {video.quiz.map((q, i) => (
          <div key={i} className="space-y-2">
            <p className="text-sm font-medium">{i + 1}. {q.question}</p>
            <div className="grid gap-2">
              {q.options.map((opt, j) => {
                const selected = answers[i] === j;
                const showCorrect = submitted && q.answerIndex === j;
                const showWrong = submitted && selected && q.answerIndex !== j;
                return (
                  <button
                    key={j}
                    disabled={!!submitted}
                    onClick={() => setAnswers((a) => ({ ...a, [i]: j }))}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      showCorrect ? "border-success bg-success/10 text-foreground" :
                      showWrong ? "border-destructive bg-destructive/10" :
                      selected ? "border-primary bg-primary-soft" : "border-border hover:bg-muted"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!submitted ? (
          <Button onClick={submit} disabled={Object.keys(answers).length !== video.quiz.length} className="w-full">
            Submit quiz
          </Button>
        ) : (
          <div className={`rounded-lg p-4 ${submitted.passed ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
            <p className="font-semibold">{submitted.passed ? "Passed!" : "Not quite"} — {submitted.score}%</p>
            <p className="mt-1 text-sm opacity-90">
              {submitted.passed ? "Next video unlocked." : `You need ${video.passingScore}% to advance.`}
            </p>
            {!submitted.passed && (
              <Button variant="outline" size="sm" onClick={retake} className="mt-3">Retake quiz</Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
