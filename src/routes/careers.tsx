import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useStore, type JobPosting, type AvailabilityHours } from "@/lib/sidework-store";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/careers")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Careers — Sidework" },
      { name: "description", content: "Open positions at our restaurant. Apply directly in seconds." },
    ],
  }),
  component: CareersPage,
});

function CareersPage() {
  const { jobs } = useStore();
  const open = jobs.filter((j) => j.open);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Link to="/"><Logo /></Link>
        <Link to="/" className="text-sm font-semibold text-muted-foreground hover:text-foreground">← Back</Link>
      </header>

      <section className="bg-gradient-hero text-primary-foreground">
        <div className="mx-auto max-w-5xl px-4 py-16 md:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <span className="h-1.5 w-1.5 rounded-full bg-white" /> Now Hiring
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-6xl">Join the team.</h1>
          <p className="mt-4 max-w-xl text-base md:text-lg text-white/80">
            Apply in under 60 seconds. Just your name, number, and availability.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 md:py-12">
        <h2 className="mb-5 text-xl md:text-2xl font-bold">Open positions <span className="text-muted-foreground">({open.length})</span></h2>
        {open.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No openings at the moment. Check back soon.</CardContent></Card>
        ) : (
          <div className="grid gap-4">
            {open.map((job) => <JobCard key={job.id} job={job} />)}
          </div>
        )}
      </section>

      <footer className="mx-auto max-w-5xl px-4 py-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Sidework
      </footer>
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS: AvailabilityHours[] = ["Mornings", "Afternoons", "Evenings", "Open availability"];

type Step = "form" | "verify" | "done";

function JobCard({ job }: { job: JobPosting }) {
  const { submitApplication } = useStore();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [hours, setHours] = useState<AvailabilityHours | "">("");
  const [note, setNote] = useState("");
  const [robot, setRobot] = useState(false);
  const [sentCode, setSentCode] = useState("");
  const [enteredCode, setEnteredCode] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const reset = () => {
    setStep("form"); setName(""); setPhone(""); setDays([]); setHours("");
    setNote(""); setRobot(false); setSentCode(""); setEnteredCode(""); setPendingId(null);
  };

  const toggleDay = (d: string) =>
    setDays((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d]);

  const handleSubmit = () => {
    if (!name.trim()) return toast.error("Please enter your full name.");
    if (!/^[0-9()+\-.\s]{7,}$/.test(phone)) return toast.error("Please enter a valid phone number.");
    if (days.length === 0) return toast.error("Pick at least one day you can work.");
    if (!hours) return toast.error("Pick your typical hours.");
    if (!robot) return toast.error("Please confirm you're not a robot.");

    const id = `pending-${Date.now()}`;
    setPendingId(id);
    const code = String(Math.floor(1000 + Math.random() * 9000));
    setSentCode(code);
    setStep("verify");
    toast.success(`Verification code sent to ${phone}`, { description: `Demo code: ${code}` });
  };

  const verify = () => {
    if (enteredCode !== sentCode) return toast.error("Code didn't match. Try again.");
    submitApplication({
      jobId: job.id,
      name: name.trim(),
      phone: phone.trim(),
      availabilityDays: days,
      availabilityHours: hours as AvailabilityHours,
      note: note.trim() || undefined,
      verified: true,
    });
    void pendingId;
    setStep("done");
  };

  return (
    <Card className="overflow-hidden border-2 transition-shadow hover:shadow-elegant">
      <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg md:text-xl font-bold">{job.title}</h3>
            <Badge variant="secondary">{job.role}</Badge>
            <Badge variant="outline">{job.type}</Badge>
          </div>
          <p className="mt-1 text-sm font-semibold text-primary">{job.payRange}</p>
          <p className="mt-3 text-sm text-muted-foreground">{job.description}</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild>
            <Button size="lg" className="w-full sm:w-auto shadow-elegant">Apply now</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[92vh] overflow-y-auto p-5 sm:p-6 sm:max-w-md">
            {step === "form" && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-lg">Apply: {job.title}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 pt-2">
                  <Field label="Full name">
                    <Input inputMode="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Field label="Phone number">
                    <Input inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </Field>
                  <Field label="Position">
                    <Input value={job.title} disabled />
                  </Field>
                  <Field label="Days you can work">
                    <div className="flex flex-wrap gap-2">
                      {DAYS.map((d) => {
                        const on = days.includes(d);
                        return (
                          <button
                            key={d} type="button" onClick={() => toggleDay(d)}
                            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input"}`}
                          >{d}</button>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label="Hours">
                    <Select value={hours} onValueChange={(v) => setHours(v as AvailabilityHours)}>
                      <SelectTrigger><SelectValue placeholder="Select hours" /></SelectTrigger>
                      <SelectContent>
                        {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Anything you want us to know? (optional)">
                    <Textarea rows={3} maxLength={150} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional — 150 characters max" />
                    <p className="mt-1 text-right text-xs text-muted-foreground">{note.length}/150</p>
                  </Field>
                  <label className="flex items-center gap-3 rounded-lg border border-input bg-background p-3">
                    <Checkbox checked={robot} onCheckedChange={(v) => setRobot(!!v)} />
                    <span className="text-sm font-medium">I'm not a robot</span>
                    <ShieldCheck className="ml-auto h-4 w-4 text-muted-foreground" />
                  </label>
                  <Button size="lg" className="w-full" onClick={handleSubmit}>Submit application</Button>
                </div>
              </>
            )}

            {step === "verify" && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-lg">Verify your phone</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    We texted a 4-digit code to <span className="font-semibold text-foreground">{phone}</span>. Enter it below to verify your application.
                  </p>
                  <Input
                    inputMode="numeric" maxLength={4} autoFocus
                    className="text-center text-2xl font-bold tracking-[0.5em] h-14"
                    value={enteredCode}
                    onChange={(e) => setEnteredCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <Button size="lg" className="w-full" onClick={verify} disabled={enteredCode.length !== 4}>Verify & submit</Button>
                  <button type="button" className="text-xs text-muted-foreground underline" onClick={() => toast.message(`Demo code: ${sentCode}`)}>
                    Didn't get a code?
                  </button>
                </div>
              </>
            )}

            {step === "done" && (
              <div className="py-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
                  <CheckCircle2 className="h-10 w-10 text-success" />
                </div>
                <h3 className="mt-5 text-2xl font-bold">Application received.</h3>
                <p className="mt-2 text-sm text-muted-foreground">We'll be in touch soon.</p>
                <Button className="mt-6 w-full" size="lg" onClick={() => { setOpen(false); reset(); }}>Done</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-sm font-semibold">{label}</Label>{children}</div>;
}
