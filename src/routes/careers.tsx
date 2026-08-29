import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";

import { useStore, type JobPosting } from "@/lib/sidework-store";
import { fetchPublicPosting } from "@/lib/hiring-supabase";
import { supabase } from "@/integrations/supabase/client";

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
      { title: "Careers — 86Paper" },
      { name: "description", content: "Apply to join our restaurant team." },
    ],
  }),
  component: CareersPage,
});

function CareersPage() {
  const { jobs, submitApplication, restaurantProfile } = useStore();
  const { job: jobIdParam } = Route.useSearch();
  const [targetJob, setTargetJob] = useState<JobPosting | null>(null);
  const [loadingJob, setLoadingJob] = useState(!!jobIdParam);
  const [publicName, setPublicName] = useState<string | null>(null);
  useEffect(() => {
    if (!jobIdParam) {
      setTargetJob(null);
      setLoadingJob(false);
      return;
    }
    const local = jobs.find((j) => j.id === jobIdParam) ?? null;
    if (local) setTargetJob(local);
    setLoadingJob(true);
    fetchPublicPosting(jobIdParam)
      .then((row) => setTargetJob(row))
      .catch((e) => console.error("[careers] failed to load job", e))
      .finally(() => setLoadingJob(false));
  }, [jobIdParam]);

  // The store profile only exists for a signed-in owner; public visitors resolve
  // the restaurant name from the job link itself.
  useEffect(() => {
    if (!jobIdParam) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("get_public_job_restaurant", { p_job_id: jobIdParam });
      if (cancelled) return;
      if (error) { console.error("[careers] restaurant name lookup failed", error); return; }
      const row = (data ?? [])[0] as { restaurant_name: string | null } | undefined;
      setPublicName(row?.restaurant_name?.trim() || null);
    })();
    return () => { cancelled = true; };
  }, [jobIdParam]);

  const restaurantName = restaurantProfile?.name?.trim() || publicName || null;


  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!targetJob) return toast.error("Please open a specific job link to apply.");
    if (!firstName.trim() || !lastName.trim()) return toast.error("Please enter your first and last name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("Please enter a valid email address.");
    if (phone.replace(/\D/g, "").length < 10) return toast.error("Please enter a valid phone number.");

    setSubmitting(true);
    try {
      const { submitApplication } = await import("@/lib/people-supabase");
      await submitApplication({
        jobId: targetJob.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        source: "careers",
      });
      setDone(true);
    } catch (e) {
      console.error("[careers] submit failed", e);
      toast.error("We couldn't submit your application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };
  void submitApplication;

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
            {targetJob ? `Apply: ${targetJob.title}` : restaurantName ? `Join the team at ${restaurantName}.` : "Join the team."}
          </h1>
          <p className="mt-3 max-w-xl text-base text-white/85">
            {targetJob
              ? `${targetJob.type} · ${targetJob.payRange}. Takes about a minute.`
              : "Open a specific job link to apply."}
          </p>
        </div>
      </section>

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
                <Field label="Phone">
                  <PhoneInput value={phone} onChange={setPhone} placeholder="(555) 123-4567" />
                </Field>

                <Field label="Email">
                  <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              </div>

              <Field label="Desired position">
                <Input value={targetJob ? `${targetJob.title} — ${targetJob.role}` : ""} disabled placeholder="Open a job link to apply" />
                {targetJob && (
                  <p className="text-xs text-muted-foreground">Pre-filled from job posting.</p>
                )}
              </Field>

              {jobIdParam && !loadingJob && !targetJob && (
                <p className="text-sm text-destructive">This job link is no longer active. Please ask for an updated link.</p>
              )}
              <Button size="lg" className="w-full shadow-elegant" onClick={submit} disabled={submitting || loadingJob || !targetJob}>
                {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>) : loadingJob ? "Loading job…" : !targetJob ? "Open a job link to apply" : "Submit application"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <footer className="mx-auto max-w-3xl px-4 py-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} 86Paper
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
