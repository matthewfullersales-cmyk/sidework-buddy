import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublicTeamInvite, claimTeamInvite, type PublicTeamInvite } from "@/lib/hiring-supabase";
import { permissionsFromFlags, permissionsDescriptor, PERMISSION_KEYS, PERMISSION_META } from "@/lib/permissions";
import { toast } from "sonner";

export const Route = createFileRoute("/team-invite/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Accept team invite — 86Paper" }] }),
  component: TeamInvitePage,
});

function TeamInvitePage() {
  const { id } = useParams({ from: "/team-invite/$id" });
  const navigate = useNavigate();
  const [invite, setInvite] = useState<PublicTeamInvite | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const inv = await fetchPublicTeamInvite(id);
        if (!inv) setLoadErr("This invite link isn't valid.");
        else setInvite(inv);
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "Could not load invite");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    setBusy(true);
    try {
      const emailTrim = email.trim();
      const redirectTo = `${window.location.origin}/team-invite/${id}`;
      // Try sign-in first — if the account already exists, use it; otherwise sign up.
      let userId: string | null = null;
      const signIn = await supabase.auth.signInWithPassword({ email: emailTrim, password });
      if (signIn.data.user) {
        userId = signIn.data.user.id;
      } else {
        const signUp = await supabase.auth.signUp({
          email: emailTrim,
          password,
          options: { emailRedirectTo: redirectTo, data: { full_name: invite.name, role: "employee" } },
        });
        if (signUp.error) throw signUp.error;
        userId = signUp.data.user?.id ?? null;
        if (!signUp.data.session) {
          toast.success("Check your email to confirm, then reopen this invite to finish.");
          setBusy(false);
          return;
        }
      }
      if (!userId) throw new Error("Sign-in did not return a user");
      await claimTeamInvite(id, userId);
      toast.success("You're linked — welcome!");
      navigate({ to: "/manager" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not claim invite");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5">
        <Link to="/"><Logo /></Link>
      </header>
      <div className="mx-auto max-w-md px-4 py-6">
        <h1 className="mb-2 text-center text-2xl font-bold tracking-tight">Accept your team invite</h1>
        {invite?.restaurantName && (
          <p className="mb-6 text-center text-sm text-muted-foreground">
            {invite.canManageHiring && invite.canManageSchedule
              ? <>You've been invited to help manage hiring and scheduling at <span className="font-semibold text-foreground">{invite.restaurantName}</span>.</>
              : invite.canManageHiring
                ? <>You've been invited to help manage hiring at <span className="font-semibold text-foreground">{invite.restaurantName}</span>.</>
                : <>You've been invited to help manage scheduling at <span className="font-semibold text-foreground">{invite.restaurantName}</span>.</>}
          </p>
        )}
        <Card className="border-2">
          <CardContent className="p-6">
            {loading && <p className="text-sm text-muted-foreground">Loading invite…</p>}
            {!loading && loadErr && <p className="text-sm text-destructive">{loadErr}</p>}
            {!loading && invite?.claimed && (
              <div className="space-y-3">
                <Badge className="bg-success text-success-foreground hover:bg-success">Already claimed</Badge>
                <p className="text-sm text-muted-foreground">This invite has already been used. If that account is yours, sign in normally.</p>
                <Button asChild className="w-full"><Link to="/login">Go to sign in</Link></Button>
              </div>
            )}
            {!loading && invite && !invite.claimed && !invite.canManageHiring && !invite.canManageSchedule && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Your restaurant owner hasn't turned on manager access for you yet. Ask them to enable "Can manage hiring" or "Can manage scheduling" for your name, then reopen this link.
                </p>
              </div>
            )}
            {!loading && invite && !invite.claimed && (invite.canManageHiring || invite.canManageSchedule) && (
              <form onSubmit={submit} className="grid gap-4">
                <p className="text-sm text-muted-foreground">
                  Hi <span className="font-semibold text-foreground">{invite.firstName ?? invite.name}</span> — create a password to activate your login. If you already have an account with this email, we'll just link it.
                </p>
                <div className="grid gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" size="lg" className="h-12" disabled={busy}>{busy ? "Working…" : "Activate my login"}</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
