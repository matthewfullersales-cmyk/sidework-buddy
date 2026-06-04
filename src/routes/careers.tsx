import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useStore, type JobPosting } from "@/lib/sidework-store";
import { toast } from "sonner";

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
          <h1 className="mt-5 text-5xl font-bold tracking-tight md:text-6xl">Join the team.</h1>
          <p className="mt-4 max-w-xl text-lg text-white/80">
            We're a tight-knit crew that cares deeply about hospitality. Browse open roles and apply in under two minutes.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="mb-6 text-2xl font-bold">Open positions <span className="text-muted-foreground">({open.length})</span></h2>
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

function JobCard({ job }: { job: JobPosting }) {
  const { submitApplication } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", experience: "", availability: "", coverNote: "" });

  const submit = () => {
    if (!form.name || !form.email || !form.phone || !form.experience || !form.availability) {
      return toast.error("Please complete every required field.");
    }
    submitApplication({ jobId: job.id, ...form });
    toast.success("Application submitted — we'll be in touch!");
    setOpen(false);
    setForm({ name: "", email: "", phone: "", experience: "", availability: "", coverNote: "" });
  };

  return (
    <Card className="overflow-hidden border-2 transition-shadow hover:shadow-elegant">
      <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-bold">{job.title}</h3>
            <Badge variant="secondary">{job.role}</Badge>
            <Badge variant="outline">{job.type}</Badge>
          </div>
          <p className="mt-1 text-sm font-semibold text-primary">{job.payRange}</p>
          <p className="mt-3 text-sm text-muted-foreground">{job.description}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="shadow-elegant">Apply now</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Apply: {job.title}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <Field label="Full name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Email *"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Phone *"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Relevant experience *">
                <Textarea rows={3} placeholder="Where you've worked, roles, length of time" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} />
              </Field>
              <Field label="Availability *">
                <Textarea rows={2} placeholder="e.g. Tue–Sun evenings, weekends" value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} />
              </Field>
              <Field label="Short note (optional)">
                <Textarea rows={2} value={form.coverNote} onChange={(e) => setForm({ ...form, coverNote: e.target.value })} />
              </Field>
            </div>
            <DialogFooter>
              <Button onClick={submit}>Submit application</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label className="text-sm font-semibold">{label}</Label>{children}</div>;
}
