import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
          "One price for independent restaurants. $99/month founding rate, locked for life. Unlimited staff, no contracts.",
      },
      { property: "og:title", content: "Pricing — 86Paper" },
      {
        property: "og:description",
        content:
          "One price for independent restaurants. $99/month founding rate, locked for life.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const checkout = useServerFn(createCheckoutSession);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const startCheckout = async () => {
    try {
      setLoading(true);
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate({ to: "/signup", search: { plan: "growth" } });
        setLoading(false);
        return;
      }
      const { url } = await checkout({
        data: { origin: window.location.origin, plan: "growth" },
      });
      window.location.href = url;
    } catch (e) {
      setLoading(false);
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
    }
  };

  const features = [
    "Unlimited staff",
    "Menu Knowledge Test that gates scheduling",
    "Employee self-onboarding via QR",
    "AI weekly scheduling",
    "Shift trade & sick-call board",
    "Video interview screening",
    "Anti-cheat & completion tracking",
  ];

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
            One price. Everything included.
          </h1>
          <p className="mt-5 text-lg text-stone-600">
            Built for independents. No contracts. Cancel anytime.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-md">
          <div className="rounded-3xl border-2 border-stone-900 bg-white p-8 text-left shadow-[8px_8px_0_0_rgba(23,23,23,1)] ring-4 ring-amber-700 ring-offset-2 ring-offset-[#faf7f2]">
            <p className="text-sm font-bold uppercase tracking-widest text-amber-700">
              Founding rate
            </p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight">$99</span>
              <span className="text-stone-500">/month</span>
            </div>
            <p className="mt-2 text-sm text-stone-600">
              Locked for life. Regular price{" "}
              <span className="line-through">$149/month</span>.
            </p>
            <p className="mt-1 text-sm font-semibold text-amber-800">
              First 25 restaurants only.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-700" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Button
                size="lg"
                onClick={startCheckout}
                disabled={loading}
                className="w-full bg-amber-700 text-white hover:bg-amber-800"
              >
                {loading ? "Loading…" : "Get started"}
              </Button>
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-stone-500">
            More than one location?{" "}
            <a
              href="mailto:hello@86paper.com?subject=86Paper%20Multi-location"
              className="font-semibold text-stone-700 underline hover:text-stone-900"
            >
              Talk to us.
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
