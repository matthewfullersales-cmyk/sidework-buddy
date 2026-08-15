import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  extractMenuItems,
  generateMenuQuiz,
  publishMenuQuiz,
  regenerateMenuQuestion,
  type ExtractedItem,
  type MenuCoverage,
  type MenuQuizDraftQuestion,
} from "@/lib/menu-quiz.functions";
import { useStore } from "@/lib/sidework-store";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
const MAX_PDF_MB = 20;
const MAX_IMAGE_INPUT_MB = 40;
const MAX_FILES = 6;
const COMPRESS_MAX_EDGE = 2000;
const COMPRESS_QUALITY = 0.8;

type PickedFile = { file: File; previewUrl: string | null };

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
  const { restaurantProfile, setMenu, setDrinkMenu, setDessertMenu, refreshMenuBankMeta, menuBankMeta } = useStore();
  const extract = useServerFn(extractMenuItems);
  const generate = useServerFn(generateMenuQuiz);
  const publish = useServerFn(publishMenuQuiz);
  const regenerateOne = useServerFn(regenerateMenuQuestion);

  const [files, setFiles] = useState<PickedFile[]>([]);
  const [stage, setStage] = useState<"idle" | "extracting" | "generating" | null>("idle");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [coverage, setCoverage] = useState<MenuCoverage | null>(null);
  // Draft questions live only in memory until the owner explicitly publishes.
  const [draft, setDraft] = useState<MenuQuizDraftQuestion[]>([]);
  const [regenIdx, setRegenIdx] = useState<number | null>(null);

  const busy = stage === "extracting" || stage === "generating";

  const resetDownstream = () => {
    setDraft([]);
    setItems([]);
    setCoverage(null);
    setError(null);
  };

  const addFiles = async (picked: FileList | File[] | null) => {
    if (!picked) return;
    resetDownstream();
    const incoming = Array.from(picked);
    const next: PickedFile[] = [];
    for (const f of incoming) {
      const isPdf = f.type === "application/pdf";
      if (isPdf && f.size > MAX_PDF_MB * 1024 * 1024) {
        setError(`"${f.name}" is ${(f.size / 1024 / 1024).toFixed(1)} MB — over the ${MAX_PDF_MB} MB limit.`);
        continue;
      }
      if (!isPdf && f.size > MAX_IMAGE_INPUT_MB * 1024 * 1024) {
        setError(`"${f.name}" is too large (over ${MAX_IMAGE_INPUT_MB} MB). Try a smaller photo.`);
        continue;
      }
      if (isPdf) {
        next.push({ file: f, previewUrl: null });
      } else {
        try {
          const { blob, mimeType, name } = await compressImage(f);
          const finalFile = new File([blob], name, { type: mimeType });
          next.push({ file: finalFile, previewUrl: URL.createObjectURL(finalFile) });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't process that image.");
        }
      }
    }
    setFiles((prev) => [...prev, ...next].slice(0, MAX_FILES));
  };

  const removeFile = (idx: number) => {
    resetDownstream();
    setFiles((prev) => {
      const target = prev[idx];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const payloads = async () =>
    Promise.all(
      files.map(async ({ file }) => ({
        fileBase64: await readFileAsBase64(file),
        mimeType: file.type,
        filename: file.name.slice(0, 200),
      })),
    );

  const runExtract = async (): Promise<ExtractedItem[] | null> => {
    setStage("extracting");
    setError(null);
    setDraft([]);
    try {
      const result = await extract({
        data: { files: await payloads(), restaurantName: restaurantProfile?.name ?? "" },
      });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return null;
      }
      setItems(result.items);
      setCoverage(result.coverage);
      return result.items;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong reading the menu.";
      setError(msg);
      toast.error(msg);
      return null;
    } finally {
      setStage("idle");
    }
  };

  const runGenerate = async (extracted?: ExtractedItem[]) => {
    const source = extracted ?? items;
    if (source.length === 0) return;
    setStage("generating");
    setError(null);
    try {
      const result = await generate({
        data: { items: source, restaurantName: restaurantProfile?.name ?? "" },
      });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setDraft(result.questions);
      toast.success(
        result.rejectedCount > 0
          ? `Draft ready — ${result.questions.length} questions (${result.rejectedCount} rejected by quality checks).`
          : `Draft ready — review ${result.questions.length} questions and publish when you're happy.`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      toast.error(msg);
    } finally {
      setStage("idle");
    }
  };

  const runFullPipeline = async () => {
    if (files.length === 0) {
      toast.error("Upload at least one menu file first.");
      return;
    }
    const extracted = await runExtract();
    if (extracted) await runGenerate(extracted);
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

  const runRegenerateOne = async (idx: number) => {
    const q = draft[idx];
    if (!q) return;
    const record = items.find((i) => i.name.toLowerCase() === (q.sourceItem ?? "").toLowerCase());
    if (!record) {
      toast.error("This question isn't linked to an extracted item — remove it instead.");
      return;
    }
    setRegenIdx(idx);
    try {
      const result = await regenerateOne({
        data: {
          item: record,
          avoid: draft.map((d) => d.question),
          restaurantName: restaurantProfile?.name ?? "",
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDraft((prev) => prev.map((item, i) => (i === idx ? result.question : item)));
      toast.success("Replacement question ready.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't regenerate that question.");
    } finally {
      setRegenIdx(null);
    }
  };

  const runPublish = async () => {
    if (draft.length === 0) return;
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
      // Record which menu kinds this upload actually covers, so the schedule
      // gate knows what staff can be tested on. Derived from extraction, not
      // from upload slots.
      const now = new Date().toISOString();
      const primary = files[0];
      const uploadMeta = primary
        ? {
            name: files.map((f) => f.file.name).join(", ").slice(0, 160),
            type: primary.file.type,
            sizeKB: Math.max(1, Math.round(files.reduce((s, f) => s + f.file.size, 0) / 1024)),
            uploadedAt: now,
            generatedAt: now,
            preview: primary.previewUrl ?? undefined,
          }
        : null;
      if (uploadMeta) {
        if (result.foodCount > 0) setMenu(uploadMeta);
        if (result.drinkCount > 0) setDrinkMenu(uploadMeta);
        if (result.dessertCount > 0) setDessertMenu(uploadMeta);
      }
      await refreshMenuBankMeta();
      const isRegen = (menuBankMeta?.version ?? 0) > 0;
      const count = draft.length;
      setDraft([]);
      toast.success(
        isRegen
          ? `Menu Knowledge Test published (v${result.bankVersion}). All staff will need to retake it before their next shift.`
          : `Published ${count} menu questions. Staff must pass the Menu Knowledge Test before being scheduled.`,
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

  const hasDraft = draft.length > 0;
  const canRun = files.length > 0 && !busy && !publishing;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base sm:text-lg">Menu Knowledge Test</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload your menu — one combined file or several. AI reads it, tells you what it found, then drafts the test. You review, edit, and publish; nothing goes live to staff until you approve it.
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
        <MenuDropzone accept={ACCEPT} files={files} onAdd={addFiles} onRemove={removeFile} disabled={busy || publishing} />

        {menuBankMeta && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
            ⚠ Publishing a new test replaces the current live one. Every employee's previous pass becomes stale and they'll need to retake before their next shift.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={runFullPipeline} disabled={!canRun} className="flex-1 sm:flex-none">
            {busy ? (
              <>
                <Spinner className="mr-2 h-4 w-4 animate-spin" />
                {stage === "extracting" ? "Reading menu…" : "Writing questions…"}
              </>
            ) : hasDraft ? (
              "Regenerate draft"
            ) : menuBankMeta ? (
              "Draft new Menu Knowledge Test"
            ) : (
              "Draft Menu Knowledge Test"
            )}
          </Button>
          {coverage && !busy && !hasDraft && items.length > 0 && (
            <Button variant="outline" onClick={() => runGenerate()} disabled={publishing}>
              Write questions from these items
            </Button>
          )}
        </div>

        {coverage && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium">
              Found {coverage.foodItems} food {coverage.foodItems === 1 ? "item" : "items"}, {coverage.drinkItems} drink{" "}
              {coverage.drinkItems === 1 ? "item" : "items"}, {coverage.dessertItems} dessert{" "}
              {coverage.dessertItems === 1 ? "item" : "items"} across {coverage.sections.length}{" "}
              {coverage.sections.length === 1 ? "section" : "sections"}.
            </p>
            {coverage.sections.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {coverage.sections.map((s) => (
                  <Badge key={s} variant="outline" className="text-[10px] uppercase">
                    {s}
                  </Badge>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              If a section is missing, re-upload a clearer scan before publishing.
            </p>
          </div>
        )}

        {busy && (
          <div className="rounded-xl border border-primary/30 bg-primary-soft p-4 text-sm text-primary">
            {stage === "extracting"
              ? "Reading your menu and pulling out every item, section, and ingredient…"
              : "Writing questions from the extracted items, one item at a time…"}
          </div>
        )}
        {error && !busy && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <div className="flex-1 text-destructive">{error}</div>
            <Button size="sm" variant="outline" onClick={runFullPipeline} disabled={!canRun}>
              Retry
            </Button>
          </div>
        )}

        {hasDraft && !busy && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              <div>
                <strong>Owner review.</strong> Fix any garbled text, remove weak questions, then publish. Staff never see the correct answers — only you do here.
                <div className="mt-1 text-xs opacity-80">
                  {draft.filter((q) => q.source === "food").length} food · {draft.filter((q) => q.source === "drink").length} drink · {draft.filter((q) => q.source === "dessert").length} dessert · {draft.length} total
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

            <p className="text-xs text-muted-foreground">
              86Paper does not test allergen or dietary-safety knowledge. Allergen training and guest dietary guidance remain the responsibility of restaurant management.
            </p>

            {draft.map((q, i) => (
              <div key={i} className="rounded-xl border border-border bg-background p-3 sm:p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">Q{i + 1}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {q.source}
                    </Badge>
                    {q.sourceItem && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {q.sourceItem}
                        {q.sourceCategory ? ` · ${q.sourceCategory}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => runRegenerateOne(i)}
                      disabled={publishing || regenIdx !== null}
                    >
                      {regenIdx === i ? "Regenerating…" : "Regenerate this one"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeQuestion(i)}
                      disabled={publishing || regenIdx !== null}
                    >
                      Remove
                    </Button>
                  </div>
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

function MenuDropzone({
  accept, files, onAdd, onRemove, disabled,
}: {
  accept: string;
  files: PickedFile[];
  onAdd: (f: FileList | File[] | null) => void;
  onRemove: (idx: number) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Menu files</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        onChange={(e) => {
          onAdd(e.target.files);
          e.target.value = "";
        }}
      />
      <div
        onClick={() => { if (!disabled) inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
        onDrop={(e) => { e.preventDefault(); if (!disabled) onAdd(e.dataTransfer.files); }}
        className="cursor-pointer rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
      >
        <p className="text-sm font-medium">
          {files.length > 0 ? "Add another file or tap to replace" : "Upload your menu"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          PDF or photo · drag &amp; drop or click · one combined menu is fine (food, drinks and desserts are detected automatically)
        </p>
      </div>

      {files.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {files.map((f, i) => (
            <div key={`${f.file.name}-${i}`} className="rounded-xl border border-border bg-card p-3 text-center">
              {f.previewUrl ? (
                <img src={f.previewUrl} alt="" className="mx-auto max-h-28 rounded-lg border border-border object-contain" />
              ) : (
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-primary-soft text-primary">
                  <PdfIcon className="h-6 w-6" />
                </div>
              )}
              <p className="mt-2 truncate text-sm font-medium">{f.file.name}</p>
              <p className="text-[11px] text-muted-foreground">{(f.file.size / 1024 / 1024).toFixed(2)} MB</p>
              <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs text-destructive hover:text-destructive" onClick={() => onRemove(i)} disabled={disabled}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
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
