import { createFileRoute, Link } from "@tanstack/react-router";
import { Brain, MonitorPlay, CalendarClock, Check, Quote, Smartphone } from "lucide-react";
import { Logo } from "@/components/sidework/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "86Paper — Restaurant Staff Management" },
      { name: "description", content: "Onboard, train, schedule and hire restaurant staff. Trade shifts, request time off, post jobs — built for restaurant owners." },
      { property: "og:title", content: "86Paper — Restaurant Staff Management" },
      { property: "og:description", content: "Onboard, train, schedule and hire restaurant staff in one place." },
    ],
  }),
  component: Landing,
});

function Landing() {

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:py-5">
        <Logo />
        <nav className="flex items-center gap-4 text-sm font-semibold sm:gap-6">
          <a href="#features" className="hidden text-muted-foreground hover:text-foreground sm:inline">Features</a>
          <a href="#pricing" className="hidden text-muted-foreground hover:text-foreground sm:inline">Pricing</a>
          <Link to="/get-app" className="text-muted-foreground hover:text-foreground">Employee?</Link>
          <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link to="/login">Log in</Link>
          </Button>
        </nav>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-hero text-primary-foreground">
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:pt-16 sm:pb-24 md:grid-cols-2 md:gap-12 md:pt-24 md:pb-32">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> Built for restaurants
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-7xl md:leading-[1.02]">
              Run your <span className="italic text-white/90">whole team</span> in one place.
            </h1>
            <p className="mt-5 max-w-xl text-base text-white/80 sm:text-lg md:text-xl">
              20 years of restaurant expertise, built into software your whole team uses every day. Hire, onboard, train, schedule, swap shifts, and approve time off — without the chaos of group texts and paper binders.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full bg-white text-primary shadow-bold hover:bg-white/90 sm:w-auto">
                <Link to="/login">Get started — free 30-day trial</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto">
                <a href="#features">See how it works</a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-white/60">
              For restaurant owners &amp; managers. Employee?{" "}
              <Link to="/get-app" className="underline underline-offset-2 hover:text-white">Get the app</Link>.
            </p>
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

      {/* KEY FEATURES */}
      <section className="bg-background">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mb-12 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Why 86Paper</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">Built by a restaurant veteran, powered for your team.</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: <Brain className="h-6 w-6" />,
                t: "AI Menu Quizzes",
                d: "Upload your menu and AI instantly generates custom staff knowledge tests. Randomized, timed, and anti-cheat protected.",
              },
              {
                icon: <MonitorPlay className="h-6 w-6" />,
                t: "Expert Training Videos",
                d: "Scenario-based training from a 20-year restaurant industry veteran. Fine dining, bar, fast casual and more.",
              },
              {
                icon: <CalendarClock className="h-6 w-6" />,
                t: "Smart Scheduling",
                d: "Build and manage your whole team's schedule in one place. Handle trades, time off, and sick calls automatically.",
              },
            ].map((f) => (
              <div key={f.t} className="rounded-2xl border-2 border-border bg-card p-7 transition-shadow hover:shadow-elegant">
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold">{f.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
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

      {/* TESTIMONIALS */}
      <section className="bg-background">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mb-12 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">What operators say</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">Fewer texts. Faster training. Happier staff.</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                quote: "We onboarded three new servers in a week without printing a single manual. The AI menu quizzes alone saved me hours.",
                name: "Sarah M.",
                title: "General Manager",
              },
              {
                quote: "Shift trades used to be a group-text nightmare. Now the team handles it themselves and I just tap approve.",
                name: "Marcus D.",
                title: "Owner, neighborhood bistro",
              },
              {
                quote: "Hiring, scheduling, training — one login for the whole team. I finally deleted three other apps.",
                name: "Priya K.",
                title: "Operations Director",
              },
            ].map((t) => (
              <figure key={t.name} className="flex flex-col rounded-2xl border-2 border-border bg-card p-7">
                <Quote className="h-6 w-6 text-primary/60" />
                <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-foreground">"{t.quote}"</blockquote>
                <figcaption className="mt-5 border-t border-border pt-4">
                  <p className="text-sm font-bold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.title}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="border-y border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="mb-12 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Pricing</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">Pricing that scales with your team.</h2>
            <p className="mt-3 text-muted-foreground">Talk to us about a plan that fits your restaurant.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                name: "Starter",
                tag: "For a single location",
                highlight: false,
                features: [
                  "Up to 15 staff members",
                  "Scheduling & shift trades",
                  "Time off management",
                  "Job postings & applications",
                  "Basic onboarding checklist",
                ],
              },
              {
                name: "Growth",
                tag: "For busy full-service teams",
                highlight: true,
                features: [
                  "Unlimited staff",
                  "Everything in Starter",
                  "AI menu quiz generator",
                  "Expert training video library",
                  "Anti-cheat quiz system",
                  "Real-time performance data",
                ],
              },
              {
                name: "Enterprise",
                tag: "For multi-location groups",
                highlight: false,
                features: [
                  "Everything in Growth",
                  "Multiple locations",
                  "Location performance comparison",
                  "Dedicated onboarding & support",
                  "Custom integrations",
                ],
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={
                  tier.highlight
                    ? "relative rounded-2xl border-2 border-primary bg-card p-7"
                    : "rounded-2xl border-2 border-border bg-card p-7"
                }
              >
                {tier.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    Most Popular
                  </span>
                )}
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{tier.name}</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">Contact us</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{tier.tag}</p>
                <ul className="mt-6 space-y-3">
                  {tier.features.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-8 w-full bg-primary text-primary-foreground hover:bg-primary/90">
                  <Link to="/login">Get in touch</Link>
                </Button>
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

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} 86Paper</p>
          <div className="flex items-center gap-5">
            <Link to="/login" className="hover:text-foreground">Manager sign-in</Link>
            <Link to="/get-app" className="inline-flex items-center gap-1 hover:text-foreground">
              <Smartphone className="h-3.5 w-3.5" /> Employee? Get the app
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
