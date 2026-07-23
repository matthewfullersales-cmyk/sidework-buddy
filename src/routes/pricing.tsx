import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/sidework/Logo";
import { createCheckoutSession } from "@/lib/stripe-checkout.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — 86Paper" },
      {
        name: "description",
        content:
          "Simple pricing for independent restaurants. Starter, Growth, and Multi-location plans.",
      },
      { property: "og:title", content: "Pricing — 86Paper" },
      {
        property: "og:description",
        content: "Simple pricing for independent restaurants.",
      },
    ],
  }),
  component: PricingPage,
});

type Plan = "starter" | "growth";

function PricingPage() {
  const checkout = useServerFn(createCheckoutSession);
  const [loading, setLoading] = useState<Plan | null>(null);

  const startCheckout = async (plan: Plan) => {
    try {
      setLoading(plan);
      const { url } = await checkout({
        data: { plan, origin: window.location.origin },
      });
      window.location.href = url;
    } catch (e) {
      setLoading(null);
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    }
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
          <Link to="/login">
            <Button size="sm" className="bg-stone-900 text-white hover:bg-stone-800">
              Sign in
            </Button>
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">
            Pricing
          </p>
          <h1 className="mt-4 text-5xl font-bold tracking-tight md:text-6xl">
            Pick your plan.
          </h1>
          <p className="mt-5 text-lg text-stone-600">
            Built for independents. Cancel anytime.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          <PlanCard
            highlighted
            name="Growth"
            price="$99"
            suffix="/month"
            blurb="Unlimited staff, single location."
            features={[
              "Everything in Starter",
              "Unlimited staff",
              "Video interview screening",
              "Character & completion tracking",
            ]}
            cta={
              <Button
                size="lg"
                onClick={() => startCheckout("growth")}
                disabled={loading !== null}
                className="w-full bg-amber-700 text-white hover:bg-amber-800"
              >
                {loading === "growth" ? "Loading…" : "Get started"}
              </Button>
            }
          />
          <PlanCard
            name="Starter"
            price="$49"
            suffix="/month"
            blurb="Up to 15 staff, single location."
            features={[
              "Employee self-onboarding via QR",
              "AI weekly scheduling",
              "Training & menu quizzes",
              "Shift trade & sick-call board",
            ]}
            cta={
              <Button
                size="lg"
                onClick={() => startCheckout("starter")}
                disabled={loading !== null}
                className="w-full bg-stone-900 text-white hover:bg-stone-800"
              >
                {loading === "starter" ? "Loading…" : "Get started"}
              </Button>
            }
          />
          <PlanCard
            name="Multi-location"
            price="$79"
            suffix="/mo per location"
            blurb="For 2+ locations. Talk to us."
            features={[
              "Everything in Growth",
              "Cross-location scheduling",
              "Consolidated reporting",
              "Priority support",
            ]}
            cta={
              <a href="mailto:hello@86paper.com?subject=86Paper%20Multi-location">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-white"
                >
                  Contact us
                </Button>
              </a>
            }
          />
        </div>
      </section>
    </div>
  );
}

function PlanCard({
  name,
  price,
  suffix,
  blurb,
  features,
  cta,
  highlighted,
}: {
  name: string;
  price: string;
  suffix: string;
  blurb: string;
  features: string[];
  cta: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border-2 border-stone-900 bg-white p-8 text-left shadow-[8px_8px_0_0_rgba(23,23,23,1)] ${
        highlighted ? "ring-4 ring-amber-700 ring-offset-2 ring-offset-[#faf7f2]" : ""
      }`}
    >
      <p className="text-sm font-bold uppercase tracking-widest text-amber-700">
        {name}
      </p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-5xl font-bold tracking-tight">{price}</span>
        <span className="text-stone-500">{suffix}</span>
      </div>
      <p className="mt-2 text-sm text-stone-600">{blurb}</p>
      <ul className="mt-6 space-y-3 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-700" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">{cta}</div>
    </div>
  );
}
