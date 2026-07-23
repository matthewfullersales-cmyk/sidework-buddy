import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/sidework/Logo";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Welcome to 86Paper" },
      { name: "description", content: "Set up your restaurant on 86Paper." },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  // Stripe webhook may take a few seconds to mark the profile active.
  // Poll refreshProfile until subscription_status flips, then jump to /manager.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      attempts++;
      await refreshProfile();
      if (cancelled) return;
      if (attempts >= 10) setChecking(false);
      else setTimeout(tick, 1500);
    };
    void tick();
    return () => { cancelled = true; };
  }, [refreshProfile]);

  useEffect(() => {
    if (profile?.subscription_status === "active") {
      navigate({ to: "/manager" });
    }
  }, [profile?.subscription_status, navigate]);

  return (
    <div className="min-h-screen bg-[#faf7f2] text-stone-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/">
          <Logo />
        </Link>
      </header>
      <section className="mx-auto max-w-2xl px-6 py-24 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">
          Payment received
        </p>
        <h1 className="mt-4 text-5xl font-bold tracking-tight md:text-6xl">
          Welcome to 86Paper.
        </h1>
        <p className="mt-5 text-lg text-stone-600">
          {profile?.subscription_status === "active"
            ? "Your subscription is active. Taking you to your dashboard…"
            : checking
              ? "Confirming your subscription with Stripe…"
              : "We haven't received confirmation from Stripe yet. If you completed payment, refresh this page in a moment."}
        </p>
        <div className="mt-10">
          <Link to="/manager">
            <Button
              size="lg"
              className="bg-stone-900 text-white hover:bg-stone-800"
            >
              Continue to setup
            </Button>
          </Link>
        </div>
        <p className="mt-6 text-sm text-stone-500">
          A receipt has been emailed to you.
        </p>
      </section>
    </div>
  );
}
