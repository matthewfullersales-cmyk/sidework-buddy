import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AuthShell } from "./login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { devSignup, devSignupEnabled } from "@/lib/dev-signup.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/dev-signup")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Internal QA signup — 86Paper" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DevSignupPage,
});

function DevSignupPage() {
  const navigate = useNavigate();
  const checkEnabled = useServerFn(devSignupEnabled);
  const create = useServerFn(devSignup);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    checkEnabled()
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, [checkEnabled]);

  if (enabled === null) return null;

  if (!enabled) {
    return (
      <AuthShell title="404 — Page not found">
        <p className="text-center text-sm text-muted-foreground">Not available.</p>
      </AuthShell>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords don't match");
    if (!restaurantName.trim() || !firstName.trim() || !lastName.trim()) {
      return toast.error("All fields required");
    }

    setBusy(true);
    try {
      await create({
        data: {
          restaurantName: restaurantName.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
        },
      });
    } catch (err) {
      setBusy(false);
      return toast.error(err instanceof Error ? err.message : "Not available");
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("QA tenant ready");
    navigate({ to: "/manager" });
  };

  return (
    <AuthShell title="Internal QA signup">
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
          <PasswordInput id="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <PasswordInput id="confirm" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <Button type="submit" size="lg" className="h-12" disabled={busy}>
          {busy ? "Creating tenant…" : "Create QA owner account"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Internal use only. No payment is collected.</p>
      </form>
    </AuthShell>
  );
}
