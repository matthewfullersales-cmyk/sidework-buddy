import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/sidework/Logo";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — 86Paper" },
      {
        name: "description",
        content:
          "86Paper isn't open to new restaurants yet. Pricing will be posted here when it is.",
      },
      { property: "og:title", content: "Pricing — 86Paper" },
      {
        property: "og:description",
        content:
          "86Paper isn't open to new restaurants yet. Pricing will be posted here when it is.",
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
          <Link
            to="/login"
            className="text-stone-600 hover:text-stone-900"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Pricing isn't set yet.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-stone-700">
          86Paper isn't open to new restaurants yet. When it is, pricing will
          be here.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-stone-700">
          If you'd like to be one of the first, email{" "}
          <a
            href="mailto:hello@86paper.com"
            className="font-semibold text-amber-800 underline hover:text-stone-900"
          >
            hello@86paper.com
          </a>
        </p>
      </section>
    </div>
  );
}
