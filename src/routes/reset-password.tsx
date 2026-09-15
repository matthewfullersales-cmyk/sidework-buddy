import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthShell } from "./login";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Set a new password — 86Paper" }] }),
  component: ResetPasswordPage,
});

type Status = "checking" | "ready" | "invalid";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) setStatus("ready");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setStatus("ready");
    });
    // The client consumes the recovery hash asynchronously; give it a moment
    // before declaring the link dead.
    const timer = setTimeout(() => {
      if (!cancelled) setStatus((s) => (s === "checking" ? "invalid" : s));
    }, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirm) return toast.error("Enter your new password twice.");
    if (password.length < 8) return toast.error("Use at least 8 characters.");
    if (password !== confirm) return toast.error("Those passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    toast.success("Password updated");
    navigate({ to: "/manager" });
  };

  if (status === "checking") {
    return (
      <AuthShell title="Set a new password">
        <p className="text-center text-sm text-muted-foreground">Checking your link…</p>
      </AuthShell>
    );
  }

  if (status === "invalid") {
    return (
      <AuthShell title="This link has expired">
        <p className="text-center text-sm text-muted-foreground">
          That reset link has expired or was already used. Request a new one and we'll email it
          right over.
        </p>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/forgot-password" className="font-semibold text-primary hover:underline">
            Request a new link
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="password">New password</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <Button type="submit" size="lg" className="h-12" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
