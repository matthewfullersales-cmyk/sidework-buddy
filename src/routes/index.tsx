import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Logo } from "@/components/sidework/Logo";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/sidework-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sidework — Restaurant Staff Management" },
      { name: "description", content: "Onboard, train, schedule and hire restaurant staff. Trade shifts, request time off, post jobs — built for restaurant owners." },
      { property: "og:title", content: "Sidework — Restaurant Staff Management" },
      { property: "og:description", content: "Onboard, train, schedule and hire restaurant staff in one place." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const { setCurrentUser } = useStore();

  const enterAs = (type: "manager" | "employee", id: string) => {
    if (type === "manager") {
      setCurrentUser({ type: "manager", id: "owner" });
      navigate({ to: "/manager" });
    } else {
      setCurrentUser({ type: "employee", id });
      navigate({ to: "/employee" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-5 text-sm font-semibold">
          <a href="#features" className="text-muted-foreground hover:text-foreground">Features</a>
          <Link to="/careers" className="text-muted-foreground hover:text-foreground">Careers</Link>
        </nav>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-hero text-primary-foreground">
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-24 md:grid-cols-2 md:pt-24 md:pb-32">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> Built for restaurants
            </span>
            <h1 className="mt-6 text-5xl font-bold leading-[1.02] tracking-tight md:text-7xl">
              Run your <span className="italic text-white/90">whole team</span> in one place.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/80 md:text-xl">
              20 years of restaurant expertise, built into software your whole team uses every day. Hire, onboard, train, schedule, swap shifts, and approve time off — without the chaos of group texts and paper binders.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => enterAs("manager", "owner")} className="bg-white text-primary shadow-bold hover:bg-white/90">
                I'm a Manager / Owner
              </Button>
              <Button size="lg" variant="outline" onClick={() => enterAs("employee", "e1")} className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                I'm an Employee
              </Button>
            </div>
            <p className="mt-4 text-xs text-white/60">Demo mode — explore with sample data. Switch roles anytime in the header.</p>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-white/15 bg-white p-5 text-foreground shadow-bold">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-success" />
                  <span className="text-sm font-semibold">Onboarding overview</span>
                </div>
                <span className="text-xs text-muted-foreground">This week</span>
              </div>
              <ul className="mt-4 space-y-3">
                {[
                  { name: "Maya Chen", role: "Server", pct: 100 },
                  { name: "Diego Alvarez", role: "Bartender", pct: 50 },
                  { name: "Priya Patel", role: "Kitchen", pct: 0 },
                ].map((e) => (
                  <li key={e.name} className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                      {e.name.split(" ").map((p) => p[0]).join("")}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between">
                        <p className="text-sm font-semibold">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.role}</p>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${e.pct}%` }} />
                      </div>
                    </div>
                    <span className="w-10 text-right text-xs font-semibold text-muted-foreground">{e.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="border-y border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mb-12 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Everything you need</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">One app. Whole staff. Zero spreadsheets.</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { t: "Role-based training", d: "Assign videos by role. Locked until watched in full — quizzes must pass before moving on." },
              { t: "Shift trade board", d: "Only role-approved staff can pick up. Manager approval, or auto-approve trusted employees." },
              { t: "Time off requests", d: "Staff request days off in two taps. You approve, deny, or comment — full history kept." },
              { t: "Job posting & hiring", d: "Post openings to a public careers page. Applications land in your dashboard, ready to review." },
              { t: "Weekly schedule", d: "See every shift, every person, every day — without piecing together five tools." },
              { t: "One clear dashboard", d: "Onboarding, pending trades, applications, and time off — all at a glance." },
            ].map((f) => (
              <div key={f.t} className="rounded-2xl border-2 border-border bg-card p-7 transition-shadow hover:shadow-elegant">
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <h3 className="text-lg font-bold">{f.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CAREERS CTA */}
      <section className="bg-gradient-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-14">
          <div>
            <h3 className="text-2xl font-bold md:text-3xl">Hiring? Your careers page is ready.</h3>
            <p className="mt-2 text-white/80">Share one link. Applications flow straight into your dashboard.</p>
          </div>
          <Link to="/careers">
            <Button size="lg" className="bg-white text-primary shadow-bold hover:bg-white/90">View careers page →</Button>
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Sidework
      </footer>
    </div>
  );
}
