import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useStore,
  type Role,
  type WeeklyAvailability,
  DAY_KEYS,
  defaultWeeklyAvailability,
} from "@/lib/sidework-store";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

type CareersSearch = { job?: string };

export const Route = createFileRoute("/careers")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): CareersSearch => ({
    job: typeof search.job === "string" ? search.job : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Careers — Sidework" },
      { name: "description", content: "Apply to join our restaurant team." },
    ],
  }),
  component: CareersPage,
});

const FOH_ROLES: Role[] = ["Host", "Busser", "Bar Back", "Bartender", "Server", "Server Assistant", "Manager", "Assistant Manager", "Porter"];
const BOH_ROLES: Role[] = ["Chef", "Sous Chef", "Line Cook", "Fry Cook", "Saute", "Grill", "Pizza", "Dishwasher", "Prep"];

function CareersPage() {
  const { jobs, submitApplication, restaurantProfile } = useStore();
  const { job: jobIdParam } = Route.useSearch();
  const targetJob = jobIdParam ? jobs.find((j) => j.id === jobIdParam) : null;
  const open = jobs.filter((j) => j.open);
  const restaurantName = restaurantProfile?.name ?? "Our restaurant";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role | "">(targetJob?.role ?? "");
  const [weekly, setWeekly] = useState<WeeklyAvailability>(() => {
    const empty = defaultWeeklyAvailability();
    DAY_KEYS.forEach((d) => (empty[d] = { kind: "none" }));
    return empty;
  });
  const [pitch, setPitch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (targetJob) setRole(targetJob.role);
  }, [targetJob?.id]);

  const pitchWords = useMemo(
    () => (pitch.trim() ? pitch.trim().split(/\s+/).length : 0),
    [pitch],
  );

  const toggleDay = (d: typeof DAY_KEYS[number]) =>
    setWeekly((prev) => ({
      ...prev,
      [d]: prev[d]?.kind === "none" ? { kind: "full" } : { kind: "none" },
    }));

  const selectedDays = DAY_KEYS.filter((d) => weekly[d]?.kind !== "none");

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim()) return toast.error("Please enter your first and last name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("Please enter a valid email address.");
    if (!/^[0-9()+\-.\s]{7,}$/.test(phone)) return toast.error("Please enter a valid phone number.");
    if (!role) return toast.error("Please pick a position.");
    if (selectedDays.length === 0) return toast.error("Pick at least one day you can work.");
    if (pitchWords < 10) return toast.error("Tell us a bit about yourself (at least 10 words).");
    if (pitchWords > 200) return toast.error("Please keep your pitch under 200 words.");

    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 700));

    submitApplication({
      jobId: targetJob?.id,
      name: `${firstName.trim()} ${lastName.trim()}`,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      role: role as Role,
      pitch: pitch.trim(),
      weeklyAvailability: weekly,
      availabilityDays: selectedDays as string[],
      availabilityHours: "Open availability",
      verified: false,
    });

    setSubmitting(false);
    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background">
        <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
          <Link to="/"><Logo /></Link>
        </header>
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/15">
            <CheckCircle2 className="h-12 w-12 text-success" />
          </div>
          <h1 className="mt-6 text-3xl font-bold">Thanks {firstName.trim() || "for applying"}!</h1>
          <p className="mt-3 text-base text-muted-foreground">
            We'll review your application and be in touch within 48 hours.
          </p>
          <Button asChild size="lg" className="mt-8 w-full"><Link to="/">Back to home</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <Link to="/"><Logo /></Link>
        <Link to="/" className="text-sm font-semibold text-muted-foreground hover:text-foreground">← Back</Link>
      </header>

      <section className="bg-gradient-hero text-primary-foreground">
        <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <span className="h-1.5 w-1.5 rounded-full bg-white" /> Now Hiring
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">
            {targetJob ? `Apply: ${targetJob.title}` : `Join the team at ${restaurantName}.`}
          </h1>
          <p className="mt-3 max-w-xl text-base text-white/85">
            {targetJob
              ? `${targetJob.type} · ${targetJob.payRange}. Takes about 2 minutes.`
              : "Fill out the form below — takes about 2 minutes. We review every application."}
          </p>
        </div>
      </section>

      {!targetJob && open.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 pt-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open positions</p>
          <div className="flex flex-wrap gap-2">
            {open.map((j) => (
              <Badge
                key={j.id}
                variant={role === j.role ? "default" : "secondary"}
                className="cursor-pointer px-3 py-1.5 text-sm"
                onClick={() => setRole(j.role)}
              >
                {j.title} · {j.payRange}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-3xl px-4 py-8 md:py-10">
        <Card className="border-2">
          <CardContent className="p-5 sm:p-7">
            <div className="grid gap-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name">
                  <Input autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </Field>
                <Field label="Last name">
                  <Input autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </Field>
                <Field label="Email">
                  <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Phone">
                  <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
              </div>

              <Field label="Position applying for">
                <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={!!targetJob}>
                  <SelectTrigger><SelectValue placeholder="Select a position" /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Front of House</SelectLabel>
                      {FOH_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Back of House</SelectLabel>
                      {BOH_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {targetJob && (
                  <p className="text-xs text-muted-foreground">Pre-filled from job posting.</p>
                )}
              </Field>

              <Field label="Days you can work">
                <div className="flex flex-wrap gap-2">
                  {DAY_KEYS.map((d) => {
                    const on = weekly[d]?.kind !== "none";
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label={`Tell us why you'd be great here (${pitchWords}/150 words)`}>
                <Textarea
                  rows={5}
                  value={pitch}
                  onChange={(e) => setPitch(e.target.value)}
                  placeholder="Share your experience, why you want to work here, and what makes you a great fit."
                />
              </Field>

              <Button size="lg" className="w-full shadow-elegant" onClick={submit} disabled={submitting}>
                {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>) : "Submit application"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <footer className="mx-auto max-w-3xl px-4 py-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Sidework
      </footer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm font-semibold">{label}</Label>
      {children}
    </div>
  );
}
