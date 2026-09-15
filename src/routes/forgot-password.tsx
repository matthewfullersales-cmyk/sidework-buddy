import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell } from "./login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Reset your password — 86Paper" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Never reveal whether an account exists for this address.
      if (error) console.error("[forgot-password]", error);
    } catch (err) {
      console.error("[forgot-password]", err);
    }
    setBusy(false);
    setSent(true);
  };

  return (
    <AuthShell title="Reset your password">
      {sent ? (
        <div className="grid gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            If an account exists for {email.trim()}, a link to set a new password is on its way.
            It can take a minute to arrive — check your spam folder if you don't see it.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg" className="h-12" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
