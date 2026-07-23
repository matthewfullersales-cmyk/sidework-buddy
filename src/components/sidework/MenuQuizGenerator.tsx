import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateMenuQuiz, type MenuQuizPreviewQuestion } from "@/lib/menu-quiz.functions";
import { useStore } from "@/lib/sidework-store";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
const MAX_PDF_MB = 20;
const MAX_IMAGE_INPUT_MB = 40; // pre-compression; we shrink client-side
const COMPRESS_MAX_EDGE = 2000;
const COMPRESS_QUALITY = 0.8;

function readFileAsBase64(file: Blob): Promise<string> {
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

async function compressImage(file: File): Promise<{ blob: Blob; mimeType: string; name: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that image."));
      el.src = url;
    });
    const longest = Math.max(img.width, img.height);
    const scale = longest > COMPRESS_MAX_EDGE ? COMPRESS_MAX_EDGE / longest : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported in this browser.");
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", COMPRESS_QUALITY),
    );
    if (!blob) throw new Error("Couldn't compress that image.");
    return { blob, mimeType: "image/jpeg", name: file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function MenuQuizGenerator({ menuName }: { menuName?: string }) {
  const { restaurantProfile } = useStore();
  const generate = useServerFn(generateMenuQuiz);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<MenuQuizPreviewQuestion[]>([]);

  const pickFile = () => inputRef.current?.click();

  const onFile = async (f: File | null) => {
    setError(null);
    setQuestions([]);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (!f) {
      setFile(null);
      return;
    }
    const isPdf = f.type === "application/pdf";
    if (isPdf && f.size > MAX_PDF_MB * 1024 * 1024) {
      setError(
        `This PDF is ${(f.size / 1024 / 1024).toFixed(1)} MB — over the ${MAX_PDF_MB} MB limit. Try re-exporting at "smallest file size", or snap a phone photo of the menu instead (photos are auto-compressed).`,
      );
      setFile(null);
      return;
    }
    if (!isPdf && f.size > MAX_IMAGE_INPUT_MB * 1024 * 1024) {
      setError(`Image is too large (over ${MAX_IMAGE_INPUT_MB} MB). Try a smaller photo.`);
      setFile(null);
      return;
    }
    if (isPdf) {
      setFile(f);
      return;
    }
    // Auto-compress images so a full-res phone photo becomes a small payload.
    try {
      const { blob, mimeType, name } = await compressImage(f);
      const compressed = new File([blob], name, { type: mimeType });
      setFile(compressed);
      setPreviewUrl(URL.createObjectURL(compressed));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't process that image.";
      setError(msg);
      setFile(null);
    }
  };

  const runGenerate = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setQuestions([]);
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
      toast.success(`Generated and saved ${result.questions.length} questions from your menu.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
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
                  PDF up to {MAX_PDF_MB} MB, or a phone photo (auto-compressed) · drag &amp; drop or click
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
                    return (
                      <div
                        key={j}
                        className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
                      >
                        <span className="mr-2 font-mono text-xs text-muted-foreground">
                          {String.fromCharCode(65 + j)}.
                        </span>
                        {opt}
                      </div>
                    );
                  })}
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
