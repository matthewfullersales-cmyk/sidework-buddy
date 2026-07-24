import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  generateMenuQuiz,
  publishMenuQuiz,
  type MenuQuizDraftQuestion,
} from "@/lib/menu-quiz.functions";
import { useStore } from "@/lib/sidework-store";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
const MAX_PDF_MB = 20;
const MAX_IMAGE_INPUT_MB = 40;
const COMPRESS_MAX_EDGE = 2000;
const COMPRESS_QUALITY = 0.8;

type MenuKind = "food" | "drink";

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

export function MenuQuizGenerator({ menuName: _menuName }: { menuName?: string }) {
  const { restaurantProfile, setMenu, setDrinkMenu, refreshMenuBankMeta, menuBankMeta } = useStore();
  const generate = useServerFn(generateMenuQuiz);
  const publish = useServerFn(publishMenuQuiz);

  const [food, setFood] = useState<File | null>(null);
  const [drink, setDrink] = useState<File | null>(null);
  const [foodPreview, setFoodPreview] = useState<string | null>(null);
  const [drinkPreview, setDrinkPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Draft questions live only in memory until the owner explicitly publishes.
  const [draft, setDraft] = useState<MenuQuizDraftQuestion[]>([]);

  const onFile = async (kind: MenuKind, f: File | null) => {
    setError(null);
    setDraft([]);
    const prevUrl = kind === "food" ? foodPreview : drinkPreview;
    if (prevUrl) URL.revokeObjectURL(prevUrl);
    if (kind === "food") { setFood(null); setFoodPreview(null); }
    else { setDrink(null); setDrinkPreview(null); }
    if (!f) return;
    const isPdf = f.type === "application/pdf";
    if (isPdf && f.size > MAX_PDF_MB * 1024 * 1024) {
      setError(`This PDF is ${(f.size / 1024 / 1024).toFixed(1)} MB — over the ${MAX_PDF_MB} MB limit.`);
      return;
    }
    if (!isPdf && f.size > MAX_IMAGE_INPUT_MB * 1024 * 1024) {
      setError(`Image is too large (over ${MAX_IMAGE_INPUT_MB} MB). Try a smaller photo.`);
      return;
    }
    let finalFile = f;
    let preview: string | null = null;
    if (!isPdf) {
      try {
        const { blob, mimeType, name } = await compressImage(f);
        finalFile = new File([blob], name, { type: mimeType });
        preview = URL.createObjectURL(finalFile);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't process that image.");
        return;
      }
    }
    if (kind === "food") { setFood(finalFile); setFoodPreview(preview); }
    else { setDrink(finalFile); setDrinkPreview(preview); }
  };

  const runGenerate = async () => {
    if (!food && !drink) {
      toast.error("Upload at least one menu (food or drink) first.");
      return;
    }
    setLoading(true);
    setError(null);
    setDraft([]);
    try {
      const foodPayload = food ? { fileBase64: await readFileAsBase64(food), mimeType: food.type } : undefined;
      const drinkPayload = drink ? { fileBase64: await readFileAsBase64(drink), mimeType: drink.type } : undefined;
      const result = await generate({
        data: {
          food: foodPayload,
          drink: drinkPayload,
          restaurantName: restaurantProfile?.name ?? "",
        },
      });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setDraft(result.questions);
      toast.success(`Draft ready — review ${result.questions.length} questions and publish when you're happy.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const updateQuestion = (idx: number, patch: Partial<MenuQuizDraftQuestion>) => {
    setDraft((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };
  const updateOption = (idx: number, optIdx: number, value: string) => {
    setDraft((prev) =>
      prev.map((q, i) =>
        i === idx ? { ...q, options: q.options.map((o, j) => (j === optIdx ? value : o)) } : q,
      ),
    );
  };
  const removeQuestion = (idx: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const runPublish = async () => {
    if (draft.length === 0) return;
    // Validate: every question needs 4 non-empty options.
    const bad = draft.findIndex(
      (q) => !q.question.trim() || q.options.length !== 4 || q.options.some((o) => !o.trim()),
    );
    if (bad !== -1) {
      toast.error(`Question ${bad + 1} is missing text or an option — fill it in or delete it.`);
      return;
    }
    setPublishing(true);
    try {
      const result = await publish({ data: { questions: draft } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const now = new Date().toISOString();
      if (food) {
        setMenu({
          name: food.name,
          type: food.type,
          sizeKB: Math.max(1, Math.round(food.size / 1024)),
          uploadedAt: now,
          generatedAt: now,
          preview: foodPreview ?? undefined,
        });
      }
      if (drink) {
        setDrinkMenu({
          name: drink.name,
          type: drink.type,
          sizeKB: Math.max(1, Math.round(drink.size / 1024)),
          uploadedAt: now,
          generatedAt: now,
          preview: drinkPreview ?? undefined,
        });
      }
      await refreshMenuBankMeta();
      const isRegen = (menuBankMeta?.version ?? 0) > 0;
      setDraft([]);
      toast.success(
        isRegen
          ? `Menu Knowledge Test published (v${result.bankVersion}). All staff will need to retake it before their next shift.`
          : `Published ${draft.length} menu questions. Staff must pass the Menu Knowledge Test before being scheduled.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't publish. Try again.");
    } finally {
      setPublishing(false);
    }
  };

  const discardDraft = () => {
    setDraft([]);
    setError(null);
  };

  const canGenerate = !!(food || drink) && !loading && !publishing;
  const hasDraft = draft.length > 0;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base sm:text-lg">Menu Knowledge Test</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload your food menu, drink menu, or both. AI reads them and drafts a real 15-question test. You review, edit, and publish — nothing goes live to staff until you approve it.
            </p>
            {menuBankMeta && (
              <p className="mt-1 text-[11px] font-medium text-primary">
                Current live test: v{menuBankMeta.version} · updated {new Date(menuBankMeta.updatedAt).toLocaleDateString()}
              </p>
            )}
          </div>
          {hasDraft && (
            <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
              Draft · not yet live
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <MenuSlot
            label="Food menu"
            accept={ACCEPT}
            file={food}
            previewUrl={foodPreview}
            onPick={(f) => onFile("food", f)}
          />
          <MenuSlot
            label="Drink menu"
            accept={ACCEPT}
            file={drink}
            previewUrl={drinkPreview}
            onPick={(f) => onFile("drink", f)}
          />
        </div>

        {menuBankMeta && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
            ⚠ Publishing a new test replaces the current live one. Every employee's previous pass becomes stale and they'll need to retake before their next shift.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={runGenerate} disabled={!canGenerate} className="flex-1 sm:flex-none">
            {loading ? (
              <>
                <Spinner className="mr-2 h-4 w-4 animate-spin" />
                Reading menu &amp; drafting…
              </>
            ) : hasDraft ? (
              "Regenerate draft"
            ) : menuBankMeta ? (
              "Draft new Menu Knowledge Test"
            ) : (
              "Draft Menu Knowledge Test"
            )}
          </Button>
        </div>

        {loading && (
          <div className="rounded-xl border border-primary/30 bg-primary-soft p-4 text-sm text-primary">
            The AI is reading your menu(s) and writing questions. This usually takes 5–20 seconds…
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <div className="flex-1 text-destructive">{error}</div>
            <Button size="sm" variant="outline" onClick={runGenerate} disabled={!canGenerate}>
              Retry
            </Button>
          </div>
        )}

        {hasDraft && !loading && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              <div>
                <strong>Owner review.</strong> Fix any garbled text, remove weak questions, then publish. Staff never see the correct answers — only you do here.
                <div className="mt-1 text-xs opacity-80">
                  {draft.filter((q) => q.source === "food").length} food · {draft.filter((q) => q.source === "drink").length} drink · {draft.length} total
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={discardDraft} disabled={publishing}>
                  Discard
                </Button>
                <Button size="sm" onClick={runPublish} disabled={publishing || draft.length === 0}>
                  {publishing ? "Publishing…" : `Publish (${draft.length})`}
                </Button>
              </div>
            </div>

            {draft.map((q, i) => (
              <div key={i} className="rounded-xl border border-border bg-background p-3 sm:p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">Q{i + 1}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {q.source}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeQuestion(i)}
                    disabled={publishing}
                  >
                    Remove
                  </Button>
                </div>
                <Input
                  value={q.question}
                  onChange={(e) => updateQuestion(i, { question: e.target.value })}
                  className="text-sm font-medium"
                  disabled={publishing}
                />
                <div className="mt-2 grid gap-1.5">
                  {q.options.map((opt, j) => {
                    const isAnswer = q.answerIndex === j;
                    return (
                      <label
                        key={j}
                        className={
                          "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition-colors " +
                          (isAnswer
                            ? "border-emerald-500/60 bg-emerald-500/10"
                            : "border-border bg-card")
                        }
                      >
                        <input
                          type="radio"
                          name={`answer-${i}`}
                          checked={isAnswer}
                          onChange={() => updateQuestion(i, { answerIndex: j })}
                          disabled={publishing}
                          className="h-4 w-4 accent-emerald-600"
                        />
                        <span className="w-5 font-mono text-xs text-muted-foreground">
                          {String.fromCharCode(65 + j)}.
                        </span>
                        <Input
                          value={opt}
                          onChange={(e) => updateOption(i, j, e.target.value)}
                          disabled={publishing}
                          className="h-8 flex-1 text-sm"
                        />
                        {isAnswer && (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                            Correct
                          </Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={discardDraft} disabled={publishing}>
                Discard draft
              </Button>
              <Button onClick={runPublish} disabled={publishing || draft.length === 0}>
                {publishing ? "Publishing…" : `Publish Menu Knowledge Test (${draft.length})`}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MenuSlot({
  label, accept, file, previewUrl, onPick,
}: {
  label: string; accept: string; file: File | null; previewUrl: string | null; onPick: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
        onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files?.[0] ?? null); }}
        className="cursor-pointer rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
      >
        {file ? (
          <div className="space-y-2">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="mx-auto max-h-32 rounded-lg border border-border object-contain" />
            ) : (
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-primary-soft text-primary">
                <PdfIcon className="h-6 w-6" />
              </div>
            )}
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-[11px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB — tap to replace</p>
          </div>
        ) : (
          <div className="space-y-1 py-2">
            <p className="text-sm font-medium">Upload {label.toLowerCase()}</p>
            <p className="text-[11px] text-muted-foreground">PDF or photo · drag &amp; drop or click</p>
          </div>
        )}
      </div>
    </div>
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
