import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/sidework/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "86Paper — From application to first shift" },
      {
        name: "description",
        content:
          "Hiring software for independent restaurants. One place for the interviews, the shadow shifts and the schedule they land on.",
      },
      {
        property: "og:title",
        content: "86Paper — From application to first shift",
      },
      {
        property: "og:description",
        content:
          "Hiring software for independent restaurants. One place for the interviews, the shadow shifts and the schedule they land on.",
      },
    ],
  }),
  component: Marketing,
});

const STEPS = [
  {
    title: "Post the job.",
    body: "Applicants land in one pipeline instead of your inbox, your texts and a stack of paper by the host stand.",
  },
  {
    title: "Send interview times.",
    body: "You set the slots you're actually free. They pick one and it's booked.",
  },
  {
    title: "Schedule the shadow shift.",
    body: "They get the date, where to come in, where to park, who to ask for and what to wear.",
  },
  {
    title: "Hire them and put them on the schedule.",
    body: "They join on their phone and see their shifts.",
  },
];

function Marketing() {
  return (
    <div className="min-h-screen bg-[#faf7f2] text-stone-900 antialiased">
      {/* NAV */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <Link
          to="/login"
          className="text-sm font-semibold text-stone-700 hover:text-stone-900"
        >
          Sign in
        </Link>
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
              From application to first shift.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-stone-700 md:text-xl">
              One place for the interviews, the shadow shifts and the schedule
              they land on.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-y border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-14 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              How it works
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="rounded-2xl border-2 border-stone-900 bg-[#faf7f2] p-7 shadow-[4px_4px_0_0_rgba(23,23,23,1)]"
              >
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-stone-900 text-lg font-bold text-amber-100">
                  {i + 1}
                </div>
                <h2 className="mt-5 text-xl font-bold tracking-tight">
                  {step.title}
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-stone-600">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHO BUILT IT */}
      <section className="bg-[#faf7f2]">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
            Who built it
          </p>
          <p className="mt-4 text-xl leading-relaxed text-stone-700 md:text-2xl">
            86Paper is built in Rochester, New York by someone who spent twenty
            years working in restaurants. Every decision in it comes from the
            floor, not a focus group.
          </p>
        </div>
      </section>

      {/* CLOSING */}
      <section className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <p className="text-xl leading-relaxed text-stone-700 md:text-2xl">
            86Paper isn't open to new restaurants yet. If you want to be one of
            the first, email{" "}
            <a
              href="mailto:hello@86paper.com"
              className="font-semibold text-amber-800 underline hover:text-stone-900"
            >
              hello@86paper.com
            </a>
          </p>
        </div>
      </section>

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
