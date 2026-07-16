import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/sidework/Logo";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — 86Paper" },
      {
        name: "description",
        content:
          "One simple plan. $49/month for 20 years of restaurant expertise, built into software your whole team uses every day.",
      },
      { property: "og:title", content: "Pricing — 86Paper" },
      {
        property: "og:description",
        content: "One simple plan. $49/month. Built for independent restaurant owners.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
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
          <Link to="/login">
            <Button size="sm" className="bg-stone-900 text-white hover:bg-stone-800">
              Sign in
            </Button>
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">
          Pricing
        </p>
        <h1 className="mt-4 text-5xl font-bold tracking-tight md:text-6xl">
          One plan. No games.
        </h1>
        <p className="mt-5 text-lg text-stone-600">
          The tools big chains pay six figures for — priced for the independents who
          actually need them.
        </p>

        <div className="mx-auto mt-12 max-w-md rounded-3xl border-2 border-stone-900 bg-white p-8 text-left shadow-[8px_8px_0_0_rgba(23,23,23,1)]">
          <p className="text-sm font-bold uppercase tracking-widest text-amber-700">
            86Paper
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-6xl font-bold tracking-tight">$49</span>
            <span className="text-stone-500">/month</span>
          </div>
          <p className="mt-2 text-sm text-stone-600">
            Everything, for one restaurant. Cancel anytime.
          </p>

          <ul className="mt-6 space-y-3 text-sm">
            {[
              "Employee self-onboarding via QR code",
              "AI-powered weekly scheduling",
              "Built-in training & menu quizzes",
              "Video interview screening",
              "Shift trade & sick-call board",
              "Character & completion tracking",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-700" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <Button
            size="lg"
            disabled
            className="mt-8 w-full bg-stone-900 text-white hover:bg-stone-800"
          >
            Checkout coming soon
          </Button>
          <p className="mt-3 text-center text-xs text-stone-500">
            Stripe checkout wires up next.
          </p>
        </div>

        <p className="mt-10 text-sm text-stone-600">
          Multi-location? <Link to="/" className="font-semibold underline">Get in touch</Link>.
        </p>
      </section>
    </div>
  );
}
