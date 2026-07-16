import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/sidework/Logo";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome to 86Paper" },
      { name: "description", content: "Set up your restaurant on 86Paper." },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
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
          Let's set up your restaurant. We'll walk you through your locations, roles,
          and your first staff invites.
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
