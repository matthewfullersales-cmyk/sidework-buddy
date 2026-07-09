import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sign in — 86Paper" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    // Resolve access: owners AND granted hiring-managers land on /manager.
    const uid = data.user?.id;
    if (uid) {
      const { data: eff } = await supabase.rpc("get_effective_owner");
      const row = (eff ?? [])[0] as { acting: string } | undefined;
      if (!row) {
        // Not an owner and not a granted hiring manager — likely a plain employee.
        toast.message("This is the manager sign-in. Redirecting to employee sign-in…");
        await supabase.auth.signOut();
        setBusy(false);
        return navigate({ to: "/employee-login" });
      }
    }
    toast.success("Welcome back");
    navigate({ to: "/manager" });
  };

  return (
    <AuthShell title="Sign in to your restaurant">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" size="lg" className="h-12" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here? <Link to="/signup" className="font-semibold text-primary hover:underline">Create an account</Link>
      </p>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Staff member? <Link to="/employee-login" className="font-semibold text-primary hover:underline">Employee sign-in</Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5">
        <Link to="/"><Logo /></Link>
      </header>
      <div className="mx-auto max-w-md px-4 py-6">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-tight">{title}</h1>
        <Card className="border-2">
          <CardContent className="p-6">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
