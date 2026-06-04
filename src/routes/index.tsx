import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/sidework-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sidework — Restaurant Staff Management" },
      { name: "description", content: "Onboard, train, and schedule restaurant staff. Trade shifts, run training, and stay compliant — built for restaurant owners." },
      { property: "og:title", content: "Sidework — Restaurant Staff Management" },
      { property: "og:description", content: "Onboard, train, and schedule restaurant staff in one place." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser } = useStore();

  useEffect(() => {
    // auto-route returning users
    if (currentUser.type === "manager") return;
  }, [currentUser]);

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
        <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground">Features</a>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-8 pb-20 md:pt-16 md:pb-28">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Built for restaurants
            </span>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              Onboard, train, and schedule your staff — in one place.
            </h1>
            <p className="mt-4 max-w-lg text-base text-muted-foreground md:text-lg">
              Sidework turns hiring, role-based training, and shift trades into a calm, simple workflow your whole team can actually use.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => enterAs("manager", "owner")} className="shadow-elegant">
                I'm a Manager / Owner
              </Button>
              <Button size="lg" variant="outline" onClick={() => enterAs("employee", "e1")}>
                I'm an Employee
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Demo mode — explore with sample data. Switch roles anytime in the header.</p>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-elegant">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-success" />
                  <span className="text-sm font-medium">Onboarding overview</span>
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
                        <p className="text-sm font-medium">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.role}</p>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${e.pct}%` }} />
                      </div>
                    </div>
                    <span className="w-10 text-right text-xs font-medium text-muted-foreground">{e.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="pointer-events-none absolute -bottom-8 -right-4 hidden h-32 w-32 rounded-full bg-primary/20 blur-3xl md:block" />
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-border bg-secondary/50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 md:grid-cols-3">
          {[
            { t: "Role-based training", d: "Assign videos by role. Locked until watched in full — quizzes must pass before moving on." },
            { t: "Shift trade board", d: "Only role-approved staff can pick up. Manager approval, or auto-approve trusted employees." },
            { t: "One clear dashboard", d: "See onboarding status, the weekly schedule, and pending trades at a glance." },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold">{f.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Sidework
      </footer>
    </div>
  );
}
