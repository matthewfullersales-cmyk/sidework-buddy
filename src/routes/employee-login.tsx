import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthShell } from "./login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/employee-login")({
  ssr: false,
  head: () => ({ meta: [{ title: "Employee sign-in — 86Paper" }] }),
  component: EmployeeLoginPage,
});

function EmployeeLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setBusy(false); return toast.error(error.message); }
    const uid = data.user?.id;
    if (uid) {
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
      if (prof?.role === "owner") {
        toast.message("This is the employee sign-in. Redirecting to manager sign-in…");
        await supabase.auth.signOut();
        setBusy(false);
        return navigate({ to: "/login" });
      }
    }
    toast.success("Welcome back");
    navigate({ to: "/employee" });
  };

  return (
    <AuthShell title="Employee sign-in">
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
        Don't have an account yet?{" "}
        <Link to="/employee-start" className="font-semibold text-primary hover:underline">Find your restaurant</Link>
      </p>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Manager? <Link to="/login" className="font-semibold text-primary hover:underline">Manager sign-in</Link>
      </p>
    </AuthShell>
  );
}
