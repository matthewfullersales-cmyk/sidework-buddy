import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Logo } from "@/components/sidework/Logo";
import { useStore, type MenuUpload, type Priority, type ServiceStyle } from "@/lib/sidework-store";
import { toast } from "sonner";

const SERVICE_STYLES: ServiceStyle[] = ["Casual Dining", "Upscale Casual", "Fine Dining", "Bar and Nightlife", "Fast Casual"];
const PRIORITIES: Priority[] = ["Speed of service", "Warm hospitality", "Product knowledge", "Upselling", "All equally important"];

type Form = {
  name: string;
  concept: string;
  serviceStyle: ServiceStyle | "";
  priority: Priority | "";
  guestExperience: string;
  nonNegotiables: string;
  pastProblems: string;
};

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const { completeSetup } = useStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>({
    name: "", concept: "", serviceStyle: "", priority: "",
    guestExperience: "", nonNegotiables: "", pastProblems: "",
  });
  const [foodMenu, setFoodMenu] = useState<MenuUpload | null>(null);
  const [drinkMenu, setDrinkMenu] = useState<MenuUpload | null>(null);
  const [generating, setGenerating] = useState(false);

  const TOTAL_STEPS = 7;
  const progress = Math.round(((step + 1) / TOTAL_STEPS) * 100);

  const canNext = (): boolean => {
    switch (step) {
      case 0: return form.name.trim().length > 0 && form.concept.trim().length > 0;
      case 1: return form.serviceStyle !== "";
      case 2: return form.priority !== "";
      case 3: return form.guestExperience.trim().length >= 10;
      case 4: return form.nonNegotiables.trim().length >= 5;
      case 5: return form.pastProblems.trim().length >= 5;
      case 6: return !!foodMenu && !!drinkMenu;
      default: return false;
    }
  };

  const next = () => {
    if (!canNext()) return toast.error("Please complete this step before continuing.");
    if (step === TOTAL_STEPS - 1) {
      setGenerating(true);
      window.setTimeout(() => {
        completeSetup({
          name: form.name.trim(),
          concept: form.concept.trim(),
          serviceStyle: form.serviceStyle as ServiceStyle,
          priority: form.priority as Priority,
          guestExperience: form.guestExperience.trim(),
          nonNegotiables: form.nonNegotiables.trim(),
          pastProblems: form.pastProblems.trim(),
        }, foodMenu, drinkMenu);
        onComplete();
      }, 3500);
      return;
    }
    setStep((s) => s + 1);
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  if (generating) return <GeneratingScreen restaurantName={form.name} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary-soft px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Step {step + 1} / {TOTAL_STEPS}
          </span>
        </div>
        <Progress value={progress} className="mb-8 h-1.5" />

        <Card className="border-border shadow-elegant">
          <CardContent className="p-5 sm:p-8">
            {step === 0 && (
              <StepShell title="Tell us about your restaurant" subtitle="Just the basics to get started.">
                <div className="grid gap-2">
                  <Label>Restaurant name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Casa Luna" />
                </div>
                <div className="grid gap-2">
                  <Label>What's your concept?</Label>
                  <Textarea rows={3} value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} placeholder="e.g. Modern Mediterranean small plates with a wood-fired focus" />
                </div>
              </StepShell>
            )}

            {step === 1 && (
              <StepShell title="What's your style of service?" subtitle="Pick the one that fits best.">
                <OptionGrid options={SERVICE_STYLES} value={form.serviceStyle} onChange={(v) => setForm({ ...form, serviceStyle: v as ServiceStyle })} />
              </StepShell>
            )}

            {step === 2 && (
              <StepShell title="What matters most to you?" subtitle="We'll weight training accordingly.">
                <OptionGrid options={PRIORITIES} value={form.priority} onChange={(v) => setForm({ ...form, priority: v as Priority })} />
              </StepShell>
            )}

            {step === 3 && (
              <StepShell title="Describe your perfect guest experience" subtitle="A few sentences — paint the picture.">
                <Textarea rows={5} value={form.guestExperience} onChange={(e) => setForm({ ...form, guestExperience: e.target.value })} placeholder="e.g. From the moment they walk in, guests feel taken care of without feeling watched. Service is warm but precise. They leave wanting to come back." />
              </StepShell>
            )}

            {step === 4 && (
              <StepShell title="Non-negotiables for staff behavior" subtitle="The lines that can never be crossed.">
                <Textarea rows={5} value={form.nonNegotiables} onChange={(e) => setForm({ ...form, nonNegotiables: e.target.value })} placeholder="e.g. No phones on the floor. Greet every guest within 30 seconds. No arguing with guests in public." />
              </StepShell>
            )}

            {step === 5 && (
              <StepShell title="Past training problems" subtitle="What hasn't worked before? We'll fix it.">
                <Textarea rows={5} value={form.pastProblems} onChange={(e) => setForm({ ...form, pastProblems: e.target.value })} placeholder="e.g. Servers can't describe the menu confidently. Bartenders make drinks inconsistently. Onboarding takes 3+ weeks." />
              </StepShell>
            )}

            {step === 6 && (
              <StepShell title="Upload your menus" subtitle="PDF or photo — both required.">
                <MenuField label="Food menu" value={foodMenu} onChange={setFoodMenu} />
                <MenuField label="Drink menu" value={drinkMenu} onChange={setDrinkMenu} />
              </StepShell>
            )}

            <div className="mt-8 flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={back} disabled={step === 0}>← Back</Button>
              <Button onClick={next} size="lg" className="min-w-[140px]">
                {step === TOTAL_STEPS - 1 ? "Generate program" : "Continue →"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StepShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function OptionGrid({ options, value, onChange }: { options: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2.5">
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`flex items-center justify-between rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium transition-all ${
              selected
                ? "border-primary bg-primary text-primary-foreground shadow-elegant"
                : "border-border bg-card hover:border-primary/50 hover:bg-primary-soft"
            }`}
          >
            <span>{opt}</span>
            {selected && <CheckIcon className="h-4 w-4" />}
          </button>
        );
      })}
    </div>
  );
}

function MenuField({ label, value, onChange }: { label: string; value: MenuUpload | null; onChange: (m: MenuUpload | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const handleFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isPdf = file.type === "application/pdf" || ext === "pdf";
    const isImage = file.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext);
    if (!isPdf && !isImage) return toast.error("Upload a PDF or photo.");
    if (file.size > 25 * 1024 * 1024) return toast.error("File must be under 25MB.");
    const save = (preview?: string) => onChange({
      name: file.name,
      type: file.type || (isPdf ? "application/pdf" : "image/*"),
      sizeKB: Math.max(1, Math.round(file.size / 1024)),
      uploadedAt: new Date().toISOString(),
      preview,
    });
    if (isImage && file.size <= 750 * 1024 && !["heic", "heif"].includes(ext)) {
      const r = new FileReader();
      r.onload = () => save(r.result as string);
      r.onerror = () => save();
      r.readAsDataURL(file);
    } else save();
  };

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {!value ? (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex items-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 text-left transition-colors hover:border-primary hover:bg-primary-soft"
        >
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <div>
            <p className="text-sm font-semibold">Upload {label.toLowerCase()}</p>
            <p className="text-xs text-muted-foreground">PDF or photo · up to 25MB</p>
          </div>
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
          <div className="flex min-w-0 items-center gap-3">
            {value.preview ? (
              <img src={value.preview} alt="" className="h-12 w-12 rounded-md border border-border object-cover" />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-md bg-primary-soft text-primary">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{value.name}</p>
              <p className="text-xs text-muted-foreground">{value.sizeKB} KB</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Remove</Button>
        </div>
      )}
      <input ref={ref} type="file" accept="application/pdf,image/*,.heic,.heif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }} />
    </div>
  );
}

function GeneratingScreen({ restaurantName }: { restaurantName: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-hero px-4 text-primary-foreground">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-white/10 backdrop-blur">
          <svg viewBox="0 0 24 24" className="h-10 w-10 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Your custom training program is being created
        </h1>
        <p className="mt-3 text-white/80">
          We're tailoring role-specific modules for {restaurantName || "your restaurant"} based on your vision and menus.
        </p>
        <div className="mt-8 grid gap-2 text-left text-sm text-white/70">
          {[
            "Analyzing service style and priorities",
            "Parsing food menu items",
            "Parsing drink menu items",
            "Building Server, Bartender & Kitchen modules",
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[10px] font-bold">{i + 1}</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
