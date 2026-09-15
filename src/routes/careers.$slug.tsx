import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type PublicJobRow = {
  restaurant_name: string | null;
  job_id: string | null;
  title: string | null;
  job_type: string | null;
  pay_range: string | null;
  description: string | null;
  posted_at: string | null;
};

type PublicJob = {
  id: string;
  title: string;
  jobType: string;
  payRange: string;
  description: string;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "empty"; restaurantName: string | null }
  | { kind: "jobs"; restaurantName: string | null; jobs: PublicJob[] };

export const Route = createFileRoute("/careers/$slug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Careers — 86Paper" },
      { name: "description", content: "Open positions. Apply in about a minute." },
    ],
  }),
  component: CareersSlugPage,
});

function CareersSlugPage() {
  const { slug } = Route.useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_public_jobs_by_slug", { p_slug: slug });
        if (cancelled) return;
        if (error) {
          console.error("[careers index] load failed", error);
          setState({ kind: "error" });
          return;
        }
        const rows = (data ?? []) as PublicJobRow[];
        if (rows.length === 0) {
          setState({ kind: "not-found" });
          return;
        }
        const restaurantName = rows[0]?.restaurant_name ?? null;
        const jobs: PublicJob[] = rows
          .filter((r) => r.job_id !== null)
          .map((r) => ({
            id: r.job_id as string,
            title: r.title ?? "",
            jobType: r.job_type ?? "",
            payRange: r.pay_range ?? "",
            description: r.description ?? "",
          }));
        setState(jobs.length === 0 ? { kind: "empty", restaurantName } : { kind: "jobs", restaurantName, jobs });
      } catch (error) {
        if (cancelled) return;
        console.error("[careers index] load failed", error);
        setState({ kind: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const restaurantName = state.kind === "jobs" || state.kind === "empty" ? state.restaurantName : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <Link to="/"><Logo /></Link>
      </header>

      {(state.kind === "jobs" || state.kind === "empty") && (
        <section className="bg-gradient-hero text-primary-foreground">
          <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> Now Hiring
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">
              {restaurantName ? `Join the team at ${restaurantName}.` : "Join the team."}
            </h1>
            {state.kind === "jobs" && (
              <p className="mt-3 max-w-xl text-base text-white/85">
                Pick a role below. The application takes about a minute.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-3xl px-4 py-8 md:py-10">
        {state.kind === "loading" && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {state.kind === "not-found" && (
          <Card className="border-2">
            <CardContent className="p-5 sm:p-7">
              <h2 className="text-xl font-bold">This link isn't active</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Double-check the address, or ask the restaurant for a current link.
              </p>
            </CardContent>
          </Card>
        )}

        {state.kind === "error" && (
          <Card className="border-2">
            <CardContent className="p-5 sm:p-7">
              <h2 className="text-xl font-bold">Something went wrong loading this page.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Refresh and try again. If it keeps happening, ask the restaurant to send you a direct link to the job.
              </p>
            </CardContent>
          </Card>
        )}

        {state.kind === "empty" && (
          <Card className="border-2">
            <CardContent className="p-5 sm:p-7">
              <h2 className="text-xl font-bold">No openings right now.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing is posted at the moment. It's worth checking back — restaurant schedules change fast.
              </p>
            </CardContent>
          </Card>
        )}

        {state.kind === "jobs" && (
          <div className="grid gap-4">
            {state.jobs.map((job) => (
              <Card key={job.id} className="border-2">
                <CardContent className="grid gap-3 p-5 sm:p-7">
                  <h2 className="text-xl font-bold">{job.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {job.jobType} · {job.payRange}
                  </p>
                  {job.description && (
                    <p className="whitespace-pre-line text-sm">{job.description}</p>
                  )}
                  <Button asChild size="lg" className="mt-2 w-full shadow-elegant sm:w-auto sm:justify-self-start">
                    <Link to="/careers" search={{ job: job.id }}>Apply</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <footer className="mx-auto max-w-3xl px-4 py-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} 86Paper
      </footer>
    </div>
  );
}
