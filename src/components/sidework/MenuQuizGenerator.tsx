import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateMenuQuiz, type MenuQuizQuestion } from "@/lib/menu-quiz.functions";
import { useStore } from "@/lib/sidework-store";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
const MAX_MB = 8;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function MenuQuizGenerator({ menuName }: { menuName?: string }) {
  const { setMenuQuiz, restaurantProfile } = useStore();
  const generate = useServerFn(generateMenuQuiz);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<MenuQuizQuestion[]>([]);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState(false);

  const pickFile = () => inputRef.current?.click();

  const onFile = (f: File | null) => {
    setError(null);
    setQuestions([]);
    setSaved(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large. Please upload under ${MAX_MB} MB.`);
      setFile(null);
      return;
    }
    setFile(f);
    if (f.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(f));
    }
  };

  const runGenerate = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    setQuestions([]);
    setRevealed({});
    try {
      const fileBase64 = await readFileAsBase64(file);
      const result = await generate({
        data: {
          fileBase64,
          mimeType: file.type,
          restaurantName: restaurantProfile?.name ?? "",
        },
      });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setQuestions(result.questions);
      toast.success(`Generated ${result.questions.length} questions from your menu.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const saveAsTraining = () => {
    if (questions.length === 0) return;
    setMenuQuiz(questions);
    setSaved(true);
    toast.success("Saved as this restaurant's menu quiz. Staff will see it in training.");
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base sm:text-lg">Menu Quiz Generator</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload {menuName ? menuName : "your menu"} (PDF or photo) — AI reads it and builds a real quiz for your staff.
            </p>
          </div>
          {questions.length > 0 && (
            <Badge variant="secondary" className="bg-primary-soft text-primary">
              {questions.length} question{questions.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload area */}
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <div
            onClick={pickFile}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className="cursor-pointer rounded-xl border-2 border-dashed border-border bg-muted/30 p-5 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            {file ? (
              <div className="space-y-2">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Menu preview"
                    className="mx-auto max-h-40 rounded-lg border border-border object-contain"
                  />
                ) : (
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-primary-soft text-primary">
                    <PdfIcon className="h-8 w-8" />
                  </div>
                )}
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || "unknown"}
                </p>
                <p className="text-xs text-muted-foreground">Tap to replace</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium">Upload your menu</p>
                <p className="text-xs text-muted-foreground">
                  PDF, PNG, JPG or WEBP · up to {MAX_MB} MB · drag &amp; drop or click
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={runGenerate} disabled={!file || loading} className="flex-1 sm:flex-none">
            {loading ? (
              <>
                <Spinner className="mr-2 h-4 w-4 animate-spin" />
                Reading menu &amp; generating…
              </>
            ) : questions.length > 0 ? (
              "Regenerate"
            ) : (
              "Generate quiz with AI"
            )}
          </Button>
          {questions.length > 0 && (
            <Button
              variant={saved ? "outline" : "default"}
              onClick={saveAsTraining}
              disabled={loading}
            >
              {saved ? "Saved ✓" : "Save as menu training"}
            </Button>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="rounded-xl border border-primary/30 bg-primary-soft p-4 text-sm text-primary">
            The AI is reading your menu and writing questions. This usually takes 5–15 seconds…
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <div className="flex-1 text-destructive">{error}</div>
            <Button size="sm" variant="outline" onClick={runGenerate} disabled={!file}>
              Retry
            </Button>
          </div>
        )}

        {/* Questions preview */}
        {questions.length > 0 && !loading && (
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={i} className="rounded-xl border border-border bg-background p-3 sm:p-4">
                <p className="text-sm font-medium sm:text-base">
                  <span className="mr-1 text-primary">{i + 1}.</span> {q.question}
                </p>
                <div className="mt-2 grid gap-1.5">
                  {q.options.map((opt, j) => {
                    const show = revealed[i];
                    const correct = j === q.answerIndex;
                    return (
                      <div
                        key={j}
                        className={[
                          "rounded-lg border px-3 py-2 text-sm transition-colors",
                          show && correct
                            ? "border-primary/40 bg-primary-soft text-primary"
                            : "border-border bg-card",
                        ].join(" ")}
                      >
                        <span className="mr-2 font-mono text-xs text-muted-foreground">
                          {String.fromCharCode(65 + j)}.
                        </span>
                        {opt}
                        {show && correct && <span className="ml-2 text-xs font-semibold">✓ answer</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRevealed((r) => ({ ...r, [i]: !r[i] }))}
                  >
                    {revealed[i] ? "Hide answer" : "Reveal answer"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  );
}
function PdfIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
