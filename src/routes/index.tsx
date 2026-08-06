import { createFileRoute, Link } from "@tanstack/react-router";
import {
  QrCode,
  CalendarClock,
  GraduationCap,
  Video,
  Repeat2,
  Eye,
  ArrowRight,
} from "lucide-react";
import { Logo } from "@/components/sidework/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "86Paper — 20 years of restaurant expertise. Starting at $49/month" },
      {
        name: "description",
        content:
          "Testing and screening software for independent restaurants. Menu knowledge tests, staff accountability, and hiring insight. Three plans, starting at $49/month.",
      },
      {
        property: "og:title",
        content: "86Paper — 20 years of restaurant expertise. Starting at $49/month",
      },
      {
        property: "og:description",
        content:
          "Testing and screening software for independent restaurants. Menu knowledge tests, staff accountability, and hiring insight. Three plans, starting at $49/month.",
      },
    ],
  }),
  component: Marketing,
});

function Marketing() {
  return (
    <div className="min-h-screen bg-[#faf7f2] text-stone-900 antialiased">
      {/* NAV */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm font-semibold md:flex">
          <a href="#features" className="text-stone-600 hover:text-stone-900">
            Features
          </a>
          <a href="#why" className="text-stone-600 hover:text-stone-900">
            Why 86Paper
          </a>
          <Link to="/pricing" className="text-stone-600 hover:text-stone-900">
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="hidden text-sm font-semibold text-stone-700 hover:text-stone-900 sm:inline">
            Sign in
          </Link>
          <Link to="/pricing">
            <Button size="sm" className="bg-stone-900 text-white hover:bg-stone-800">
              Get started
            </Button>
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[520px] bg-[radial-gradient(ellipse_at_top,_rgba(180,83,9,0.12),_transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-6 pt-16 pb-24 md:pt-24 md:pb-32">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-stone-700 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-700" />
              For independent restaurants
            </span>
            <h1 className="mt-6 text-5xl font-bold leading-[1.02] tracking-tight md:text-7xl">
              20 years of restaurant
              <br />
              expertise. <span className="italic text-amber-800">Starting at $49 a month.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-stone-700 md:text-xl">
              86Paper isn't another scheduling app. It's how you find out who your people really are — before their first shift. Menu tests they can't fake, onboarding they complete themselves, and a clear record of who did the work and who didn't.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/pricing">
                <Button
                  size="lg"
                  className="w-full bg-stone-900 text-white shadow-[4px_4px_0_0_rgba(180,83,9,1)] transition-transform hover:-translate-y-0.5 hover:bg-stone-800 sm:w-auto"
                >
                  See pricing <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <a href="#features">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full border-stone-300 bg-white text-stone-900 hover:bg-stone-100 sm:w-auto"
                >
                  What you get
                </Button>
              </a>
            </div>
            <p className="mt-4 text-sm text-stone-500">
              Three plans. No contracts. Cancel anytime.
            </p>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section id="why" className="border-y border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-5">
          <div className="md:col-span-2">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              Why we built it
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
              The tools chains pay six figures for. Priced like you.
            </h2>
          </div>
          <div className="space-y-6 text-lg text-stone-700 md:col-span-3">
            <p>
              Enterprise workforce software wasn't built for the 12-table bistro or
              the neighborhood taproom. It's built for corporate ops teams with
              lawyers and IT departments.
            </p>
            <p>
              Independent owners get stuck stitching together group texts,
              spreadsheets, and paper binders — while the chain down the street
              runs on real systems.
            </p>
            <p className="font-semibold text-stone-900">
              86Paper is those systems, translated. The playbook of a 20-year
              operator, in an app your host can use on a Tuesday.
            </p>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="bg-[#faf7f2]">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-14 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              What you get
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
              Every part of running a floor — handled.
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <FeatureCard
              icon={<QrCode className="h-6 w-6" />}
              title="40 employees? They onboard themselves."
              body="Print a QR code. Staff scan it, add their name, phone, email, emergency contact, experience, and availability before their first shift. No chasing paperwork."
              tag="Self-onboarding"
            />
            <FeatureCard
              icon={<CalendarClock className="h-6 w-6" />}
              title="AI writes your schedule. You approve it."
              body="Builds a full week in seconds based on availability, role, and minimum staffing. Someone requests off — it suggests the replacement. You never drop below coverage."
              tag="Scheduling"
            />
            <FeatureCard
              icon={<GraduationCap className="h-6 w-6" />}
              title="They prove the menu before they touch a table."
              body="AI-generated menu knowledge test on your actual menu — allergens, preparations, wine pairings. New hires pass before they hit the floor."
              tag="Testing"
            />
            <FeatureCard
              icon={<Video className="h-6 w-6" />}
              title="Screen applicants in five minutes."
              body="Send a video interview link before you commit to a shadow shift. Sort the serious from the not-so-serious without burning an evening on no-shows."
              tag="Hiring"
            />
            <FeatureCard
              icon={<Repeat2 className="h-6 w-6" />}
              title="Sick call at 3pm? Handled by 3:04."
              body="One tap posts the shift to eligible, available staff. First qualified pickup gets it. Manager approves — or not. Nobody's texting the group chat."
              tag="Shift trades"
            />
            <FeatureCard
              icon={<Eye className="h-6 w-6" />}
              title="We help you see when you're not looking."
              body="Quiz anti-cheat, test completion, onboarding behavior — the data quietly tells you who's serious and who's not. Long before they cost you a Friday night."
              tag="Character signals"
            />
          </div>
        </div>
      </section>

      {/* PROOF STRIP */}
      <section className="bg-stone-900 text-stone-100">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 text-center md:grid-cols-3">
          <Stat n="20 yrs" label="of floor experience baked in" />
          <Stat n="1 app" label="replacing 5 tools + a paper binder" />
          <Stat n="$99" label="a month. Not per seat." />
        </div>
      </section>

      {/* CLOSING CTA */}
      <section className="bg-[#faf7f2]">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-4xl font-bold tracking-tight md:text-6xl">
            You already know how to run the restaurant.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-stone-700">
            Let us handle the paperwork, the training binder, the group texts, and
            the "hey, can anyone cover tonight?" Focus on the food and the room.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/pricing">
              <Button
                size="lg"
                className="w-full bg-stone-900 text-white shadow-[4px_4px_0_0_rgba(180,83,9,1)] transition-transform hover:-translate-y-0.5 hover:bg-stone-800 sm:w-auto"
              >
                Get started — $99/mo <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button
                size="lg"
                variant="outline"
                className="w-full border-stone-300 bg-white text-stone-900 hover:bg-stone-100 sm:w-auto"
              >
                I already have an account
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 text-sm text-stone-500 sm:flex-row sm:items-center">
          <div>© {new Date().getFullYear()} 86Paper LLC</div>
          <div className="flex gap-5">
            <Link to="/pricing" className="hover:text-stone-900">Pricing</Link>
            <Link to="/privacy" className="hover:text-stone-900">Privacy</Link>
            <Link to="/terms" className="hover:text-stone-900">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
  tag,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tag: string;
}) {
  return (
    <div className="group rounded-2xl border-2 border-stone-900 bg-white p-7 shadow-[4px_4px_0_0_rgba(23,23,23,1)] transition-transform hover:-translate-y-1 hover:shadow-[6px_6px_0_0_rgba(180,83,9,1)]">
      <div className="flex items-center justify-between">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-stone-900 text-amber-100">
          {icon}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
          {tag}
        </span>
      </div>
      <h3 className="mt-5 text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-stone-600">{body}</p>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div className="text-5xl font-bold tracking-tight text-amber-200">{n}</div>
      <div className="mt-2 text-sm text-stone-400">{label}</div>
    </div>
  );
}
