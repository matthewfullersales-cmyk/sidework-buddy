import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AuthShell } from "./login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { createCheckoutSession } from "@/lib/stripe-checkout.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  ssr: false,
  head: () => ({ meta: [{ title: "Create account — 86Paper" }] }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const checkout = useServerFn(createCheckoutSession);
  const [restaurantName, setRestaurantName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
    if (!restaurantName.trim() || !firstName.trim() || !lastName.trim()) return toast.error("All fields required");

    setBusy(true);
    const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectTo, data: { full_name: fullName, restaurant_name: restaurantName, role: "owner" } },
    });
    if (error) { setBusy(false); return toast.error(error.message); }

    const uid = data.user?.id;
    if (uid) {
      const { error: pErr } = await supabase.from("profiles").insert({
        id: uid,
        role: "owner",
        full_name: fullName.trim(),
        restaurant_name: restaurantName.trim(),
      });
      if (pErr) { setBusy(false); return toast.error(pErr.message); }
    }

    // If Supabase issued a session immediately, send them straight to Stripe
    // Checkout. Otherwise they must confirm email first, then subscribe on
    // next sign-in (the manager gate will redirect them to /pricing).
    if (data.session && uid) {
      try {
        const { url } = await checkout({
          data: { origin: window.location.origin, userId: uid, email: email.trim() },
        });
        window.location.href = url;
        return;
      } catch (e) {
        setBusy(false);
        toast.error(e instanceof Error ? e.message : "Could not start checkout");
        navigate({ to: "/pricing" });
        return;
      }
    }

    toast.success("Check your email to confirm your account, then sign in to subscribe.");
    navigate({ to: "/login" });
    setBusy(false);
  };

  return (
    <AuthShell title="Create your 86Paper account">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="restaurant">Restaurant name</Label>
          <Input id="restaurant" required value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} maxLength={120} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button type="submit" size="lg" className="h-12" disabled={busy}>{busy ? "Redirecting to checkout…" : "Subscribe — $99/mo"}</Button>
        <p className="text-center text-xs text-muted-foreground">You'll be redirected to Stripe to enter payment. Cancel anytime.</p>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account? <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
