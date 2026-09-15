import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/sidework/Logo";
import { useAuth } from "@/lib/auth-context";
import { createCheckoutSession } from "@/lib/stripe-checkout.functions";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — 86Paper" },
      {
        name: "description",
        content:
          "$99 a month per restaurant. Unlimited staff, every feature, no contract. Hiring and scheduling for independent restaurants.",
      },
      { property: "og:title", content: "Pricing — 86Paper" },
      {
        property: "og:description",
        content:
          "$99 a month per restaurant. Unlimited staff, every feature, no contract. Hiring and scheduling for independent restaurants.",
      },
    ],
  }),
  component: PricingPage,
});

const PRIMARY_BUTTON =
  "cursor-pointer rounded-lg border-2 border-stone-900 bg-stone-900 px-6 py-3.5 text-base font-bold text-amber-100 shadow-[3px_3px_0_0_rgba(23,23,23,1)] disabled:opacity-60";
const SECONDARY_BUTTON =
  "rounded-lg border-2 border-stone-900 bg-white px-6 py-3.5 text-base font-bold text-stone-900 shadow-[3px_3px_0_0_rgba(23,23,23,1)] disabled:opacity-60";

const FEATURES = [
  ["A link for every job", " you post — they apply in a minute"],
  ["One pipeline", " — every applicant in one place"],
  ["Interview times", " you're actually free for"],
  ["Shadow shifts", " with a packet they can read first"],
  ["The emails sent for you", " — offers, confirmations, reschedules"],
  ["A QR code for the break room", " — your crew scans it and they're on"],
  ["The schedule", ", on their phone, current"],
  ["Availability, time off and trades", " that come to you"],
  ["Weekly hours", " flagged before anyone hits overtime"],
  ["Your roster in one place", " — who's active, who's new, who's gone"],
] as const;

const REPLACEMENTS = [
  [
    "Resumes in your inbox, a few in your texts, a stack of paper by the host stand.",
    "One pipeline. Every applicant lands in it.",
  ],
  [
    "Six texts back and forth to book one interview.",
    "You post the times you're free. They pick one. It's booked.",
  ],
  [
    "A sticky note that says who's shadowing Thursday.",
    "A shadow shift with the date, where to come in, where to park and what to wear.",
  ],
  [
    "A printed schedule with three cross-outs on it.",
    "The schedule on their phone, current, the second you change it.",
  ],
  [
    "A group chat to find someone to cover Friday, and no way to know who actually agreed.",
    "They put the shift up, someone takes it, and nothing changes on your schedule until you say yes.",
  ],
  [
    "A text at eleven at night asking for the 14th off.",
    "A request that waits for your yes or no instead of getting lost.",
  ],
  [
    "A note somewhere about who can't work Tuesdays, from whenever they told you.",
    "Availability on file, and it only changes when you approve the change.",
  ],
  [
    "Adding up hours in your head to see who's close to 40.",
    "Weekly hours on the schedule, flagged before overtime.",
  ],
] as const;

const QUESTIONS = [
  [
    "What counts as one restaurant?",
    "One address, one account, $99. A second location is a second subscription.",
  ],
  [
    "How many people can I add?",
    "As many as you have — servers, cooks, hosts, managers. There's no per-person charge, so hiring six people in March doesn't change your bill.",
  ],
  [
    "Do my staff pay anything?",
    "No. They sign in on their phone, free, for as long as they work for you.",
  ],
  [
    "Is there a contract?",
    "Month to month. No setup fee, no annual commitment, no onboarding call you have to sit through.",
  ],
  [
    "How do I cancel?",
    "A button in your settings. You shouldn't have to email anyone to stop paying, so cancelling is as easy as signing up was. You keep access through the end of the month you've already paid for, and you're not charged again.",
  ],
] as const;

function CtaBlock() {
  const { loading, session, profile } = useAuth();
  const checkout = useServerFn(createCheckoutSession);
  const [busy, setBusy] = useState(false);
  const startCheckout = async () => {
    setBusy(true);
    try {
      const { url } = await checkout({
        data: { origin: window.location.origin, plan: "growth" },
      });
      window.location.href = url;
    } catch (e) {
      console.error("[pricing] checkout", e);
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    }
  };

  if (loading || (session && !profile)) {
    return (
      <button type="button" className={PRIMARY_BUTTON} disabled>
        Loading…
      </button>
    );
  }

  if (!session) {
    return (
      <div className="grid justify-items-start gap-3">
        <Link to="/signup" className={PRIMARY_BUTTON}>
          Start your restaurant — $99/mo
        </Link>
        <p className="max-w-sm text-sm text-stone-600">
          You'll enter payment on Stripe. Nothing is charged until you do.
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <button type="button" className={PRIMARY_BUTTON} disabled>
        Loading…
      </button>
    );
  }

  if (profile.role !== "owner") {
    return (
      <div className="grid justify-items-start gap-3">
        <p className="text-sm font-semibold text-stone-700">
          You're signed in as staff — 86Paper is free for you.
        </p>
        <Link to="/employee" className={SECONDARY_BUTTON}>
          Go to your shifts
        </Link>
      </div>
    );
  }

  if (profile.subscription_status === "active") {
    return (
      <div className="grid justify-items-start gap-3">
        <p className="font-semibold text-success">Your subscription is active</p>
        <Link to="/manager" className={SECONDARY_BUTTON}>
          Back to your dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="grid justify-items-start gap-3">
      <button
        type="button"
        className={PRIMARY_BUTTON}
        onClick={startCheckout}
        disabled={busy}
      >
        {busy ? "Starting checkout…" : "Subscribe — $99/mo"}
      </button>
      <p className="max-w-sm text-sm text-stone-600">
        Signed in as {session.user.email}. This picks up where you left off.
      </p>
    </div>
  );
}

function PricingPage() {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };
  return (
    <div className="min-h-screen bg-[#faf7f2] text-stone-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/">
          <Logo />
        </Link>
        <nav className="flex items-center gap-4 text-sm font-semibold">
          <Link to="/" className="text-stone-600 hover:text-stone-900">
            Home
          </Link>
          {!loading && session ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="cursor-pointer text-sm font-semibold text-stone-600 hover:text-stone-900"
            >
              Sign out
            </button>
          ) : (
            <Link
              to="/login"
              className="text-stone-600 hover:text-stone-900"
            >
              Sign in
            </Link>
          )}
        </nav>
      </header>


      <main>
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-12 md:pt-24 md:pb-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-stone-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-700" />
            Pricing
          </span>
          <h1 className="mt-6 max-w-4xl text-5xl font-bold leading-[1.02] tracking-tight md:text-6xl">
            $99 a month. Every part of it.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-stone-700">
            One restaurant, every person who works there, no setup fee and no
            contract. There is no tier that unlocks the part you actually needed.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20">
          <div className="overflow-hidden rounded-2xl border-2 border-stone-900 bg-white shadow-[4px_4px_0_0_rgba(23,23,23,1)]">
            <div className="flex flex-col justify-between gap-8 border-b-2 border-stone-900 bg-[#faf7f2] p-6 sm:p-8 md:flex-row md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-6xl font-bold md:text-7xl">$99</span>
                  <span className="text-xl text-stone-600">/ month</span>
                </div>
                <p className="mt-3 text-stone-700">
                  Per restaurant. <strong>Unlimited staff.</strong> Billed monthly,
                  cancel any time.
                </p>
              </div>
              <div className="shrink-0">
                <CtaBlock />
              </div>
            </div>
            <div className="p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-stone-500">
                What's in it
              </p>
              <ul className="mt-6 grid gap-x-10 gap-y-4 md:grid-cols-2">
                {FEATURES.map(([lead, rest]) => (
                  <li key={lead} className="flex items-start gap-3 text-stone-700">
                    <span className="mt-2 h-2 w-2 shrink-0 bg-amber-700" />
                    <span>
                      <strong className="text-stone-900">{lead}</strong>
                      {rest}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="border-y border-stone-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              What it replaces
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              Eight places become one.
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-stone-700">
              Nothing here is new work. It's the work you already do, in one flow
              instead of eight.
            </p>
            <div className="mt-10 overflow-hidden rounded-2xl border-2 border-stone-900 shadow-[4px_4px_0_0_rgba(23,23,23,1)]">
              <div className="hidden bg-stone-900 sm:grid sm:grid-cols-2">
                <div className="px-5 py-4 text-sm font-bold text-stone-300">
                  Right now
                </div>
                <div className="border-t border-stone-700 px-5 py-4 text-sm font-bold text-amber-100 sm:border-t-0 sm:border-l">
                  In 86Paper
                </div>
              </div>
              {REPLACEMENTS.map(([before, after]) => (
                <div
                  key={before}
                  className="grid border-t border-stone-200 sm:grid-cols-2"
                >
                  <div className="bg-white px-5 py-5 text-stone-500">
                    <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-stone-400 sm:hidden">Right now</span>
                    {before}
                  </div>
                  <div className="border-t border-stone-200 bg-[#fffdfa] px-5 py-5 font-semibold text-stone-900 sm:border-t-0 sm:border-l">
                    <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-amber-700 sm:hidden">In 86Paper</span>
                    {after}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#faf7f2]">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              What it doesn't do
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              On purpose.
            </h2>
            <div className="mt-8 max-w-3xl border-l-4 border-amber-700 pl-6 text-lg leading-relaxed text-stone-700">
              <p>
                86Paper is <strong>not a time clock, not payroll, not a POS and not an HR suite</strong>. It doesn't write your schedule for you.
              </p>
              <p className="mt-5">
                Every one of those is somebody else's product, and bolting them on
                is how scheduling software ends up with four tabs you never open and
                one you need on a Friday night.
              </p>
              <p className="mt-5">
                The application, the interview, the shadow shift, the hire, the schedule they land on. Not most of it. All of it.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-3xl px-6 py-20">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              Questions
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              The short answers.
            </h2>
            <dl className="mt-8">
              {QUESTIONS.map(([question, answer]) => (
                <div key={question} className="border-t border-stone-200 py-6">
                  <dt className="font-bold text-stone-900">{question}</dt>
                  <dd className="mt-2 leading-relaxed text-stone-600">{answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="bg-[#faf7f2]">
          <div className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Everything from “we’re hiring” to “you’re on Friday.”
            </h2>
            <div className="mt-8 flex justify-center text-left">
              <CtaBlock />
            </div>
            <p className="mt-8 text-sm text-stone-600">
              Questions first?{" "}
              <a
                href="mailto:hello@86paper.com"
                className="font-semibold text-amber-800 underline hover:text-stone-900"
              >
                hello@86paper.com
              </a>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 text-sm text-stone-500 sm:flex-row sm:items-center">
          <div>© {new Date().getFullYear()} 86Paper LLC</div>
          <div className="flex gap-5">
            <Link to="/privacy" className="hover:text-stone-900">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-stone-900">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
