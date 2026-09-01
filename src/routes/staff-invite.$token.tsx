import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Logo } from "@/components/sidework/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type Relationship,
  type DayAvailability,
  type DayHalf,
  type DayKey,
  DAY_KEYS,
} from "@/lib/sidework-store";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchPublicStaffInvite,
  claimStaffInvite,
  type PublicStaffInviteInfo,
} from "@/lib/employees-supabase";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

const RELATIONSHIPS: Relationship[] = ["Spouse", "Parent", "Sibling", "Child", "Friend", "Other"];

const claimSchema = z.object({
  email: z.string().trim().email("Valid email required").max(255),
  phone: z.string().trim().min(7, "Phone number required").max(30),
  ecFirstName: z.string().trim().max(60).optional(),
  ecLastName: z.string().trim().max(60).optional(),
  ecPhone: z.string().trim().max(30).optional(),
});

export const Route = createFileRoute("/staff-invite/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Complete your invite — 86Paper" }] }),
  component: StaffInvitePage,
});

type AvKind = "full" | "partial" | "none";

function StaffInvitePage() {
  const { token } = Route.useParams();

  const [invite, setInvite] = useState<PublicStaffInviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // Starts empty on purpose: nothing is stored for a day the person never taps.
  const [availability, setAvailability] = useState<Partial<Record<DayKey, DayAvailability>>>({});
  const [ecFirstName, setEcFirstName] = useState("");
  const [ecLastName, setEcLastName] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [ecRel, setEcRel] = useState<Relationship | "">("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ firstName: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicStaffInvite(token)
      .then((res) => {
        if (cancelled) return;
        if (!res) { setNotFound(true); return; }
        setInvite(res);
        if (res.email) setEmail(res.email);
        if (res.phone) setPhone(res.phone);
      })
      .catch((e) => { console.error("[staff-invite]", e); if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const setDayKind = (day: DayKey, kind: AvKind) =>
    setAvailability((prev) => {
      if (kind !== "partial") return { ...prev, [day]: { kind } };
      const cur = prev[day];
      // Keep an already-chosen half when re-tapping Partial; otherwise leave
      // the half unspecified rather than guessing.
      return { ...prev, [day]: { kind: "partial", ...(cur?.kind === "partial" && cur.half ? { half: cur.half } : {}) } };
    });

  // Exactly one half; tapping the other replaces it rather than accumulating.
  const setDayHalf = (day: DayKey, half: DayHalf) =>
    setAvailability((prev) => ({ ...prev, [day]: { kind: "partial", half } }));

  const availabilityCheck = useMemo(() => {
    const missing: string[] = [];
    for (const d of DAY_KEYS) {
      const entry = availability[d];
      if (!entry) {
        missing.push(d);
        continue;
      }
      if (entry.kind === "partial" && !entry.half) {
        missing.push(`${d} (Day or Night)`);
      }
    }
    return { complete: missing.length === 0, missing };
  }, [availability]);

  const restaurantName = invite?.restaurantName ?? "the team";
  const inviteName = `${invite?.firstName ?? ""} ${invite?.lastName ?? ""}`.trim();
  const inviteRole = invite?.primaryRole ?? "";

  const submit = async () => {
    if (submitting) return;

    const parsed = claimSchema.safeParse({ email, phone, ecFirstName, ecLastName, ecPhone });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return toast.error(first?.message ?? "Please complete the form");
    }
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirmPassword) return toast.error("Passwords don't match");

    setSubmitting(true);

    try {
      let uid: string | undefined;

      // 1. Existing session for this invite email — use it without re-signing up.
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData.session?.user;
      const claimEmail = parsed.data.email;
      if (sessionUser && sessionUser.email?.toLowerCase() === claimEmail.toLowerCase()) {
        uid = sessionUser.id;
      } else {
        // 2. Otherwise sign up.
        const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: claimEmail,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: { full_name: inviteName, role: "employee" },
          },
        });

        if (signUpErr) {
          const errMsg = signUpErr.message.toLowerCase();
          if (errMsg.includes("already registered") || errMsg.includes("already exists")) {
            // 3. Account exists — sign in with the password they just typed.
            const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
              email: claimEmail,
              password,
            });
            if (signInErr || !signInData.user) {
              setSubmitting(false);
              return toast.error(
                "An account already exists for this email, and that password doesn't match. Sign in at the employee sign-in page or reset your password."
              );
            }
            uid = signInData.user.id;
          } else {
            setSubmitting(false);
            return toast.error(signUpErr.message);
          }
        } else {
          uid = signUpData.user?.id;
          if (!uid) {
            setSubmitting(false);
            return toast.error("Signup failed — please try again");
          }
        }
      }

      // Profile row is created by the `on_auth_user_created` database trigger.

      try {
        void uid;
        const hasEc =
          Boolean(parsed.data.ecFirstName?.trim()) ||
          Boolean(parsed.data.ecLastName?.trim()) ||
          Boolean(parsed.data.ecPhone?.trim()) ||
          Boolean(ecRel);
        await claimStaffInvite(token, {
          email: parsed.data.email,
          phone: parsed.data.phone,
          weekly_availability: availability,
          ...(hasEc
            ? {
                emergency_contact: {
                  firstName: parsed.data.ecFirstName?.trim() ?? "",
                  lastName: parsed.data.ecLastName?.trim() ?? "",
                  phone: parsed.data.ecPhone?.trim() ?? "",
                  ...(ecRel ? { relationship: ecRel } : {}),
                },
              }
            : {}),
        });
      } catch (claimErr: any) {
        setSubmitting(false);
        const claimMsg = String(claimErr?.message ?? claimErr).toLowerCase();
        if (claimMsg.includes("already claimed")) {
          return toast.error("This invite has already been used. Please sign in at the employee sign-in page.");
        }
        if (claimMsg.includes("invite not found")) {
          return toast.error("This invite link is invalid or expired. Ask your manager for a new one.");
        }
        return toast.error(
          "The final step didn't finish, but your account was created successfully. Press the button again to complete your invite."
        );
      }

      setSubmitting(false);
      setDone({ firstName: invite?.firstName ?? "" });
    } catch (e) {
      setSubmitting(false);
      toast.error("Something went wrong. Your account may already exist—press the button again or sign in at the employee sign-in page.");
    }
  };

  if (loading) {
    return (
      <Centered>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Loading your invite…</p>
      </Centered>
    );
  }
  if (notFound || !invite) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">Invite not found</h1>
        <p className="mt-2 text-muted-foreground">We couldn't find an invite for this link. Double-check the link your manager sent you.</p>
        <Button asChild className="mt-6"><Link to="/">Go home</Link></Button>
      </Centered>
    );
  }
  if (invite.expired) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">This invite has expired</h1>
        <p className="mt-2 text-muted-foreground">
          Ask your manager to send you a new invite link.
        </p>
        <Button asChild className="mt-6"><Link to="/">Go home</Link></Button>
      </Centered>
    );
  }
  if (invite.claimed) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">Invite already used</h1>
        <p className="mt-2 text-muted-foreground">This invite has already been claimed. Please sign in instead.</p>
        <Button asChild className="mt-6"><Link to="/employee-login">Sign in</Link></Button>
      </Centered>
    );
  }
  if (done) {
    return (
      <Centered>
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/15">
          <CheckCircle2 className="h-12 w-12 text-success" />
        </div>
        <h1 className="mt-6 text-3xl font-bold">Welcome to {restaurantName}, {done.firstName}!</h1>
        <p className="mt-3 text-muted-foreground">Your account is ready.</p>
        <Button asChild className="mt-6 w-full"><Link to="/employee">Open my 86Paper</Link></Button>
      </Centered>
    );
  }

  return (
    <Shell>
      <section className="bg-gradient-hero text-primary-foreground">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            You're invited
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight">Join {restaurantName} on 86Paper</h1>
          <p className="mt-2 text-white/90">Fill in a few details to finish setting up your account.</p>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-4 py-6">
        <Card className="border-2">
          <CardContent className="grid gap-5 p-5">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm font-medium">
                You're joining {restaurantName}
                {inviteRole ? <> as <span className="font-semibold">{inviteRole}</span></> : null}
                {inviteName ? <>, {inviteName}.</> : "."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                If your name or role is wrong, ask your manager to fix it — you can't change it here.
              </p>
            </div>

            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Phone"><PhoneInput value={phone} onChange={setPhone} /></Field>

            <div className="grid gap-2">
              <Label className="text-sm font-medium">Weekly availability</Label>
              <p className="text-xs text-muted-foreground">
                Tap Full, Partial, or Off for each day. If Partial, also choose Day or Night.
              </p>
              <div className="grid gap-2">
                {DAY_KEYS.map((d) => {
                  const entry = availability[d];
                  const kind: AvKind | undefined = entry?.kind;
                  const half = entry?.kind === "partial" ? entry.half : undefined;
                  return (
                    <div key={d} className="grid gap-2 rounded-lg border border-border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="w-12 text-sm font-semibold">{d}</span>
                        <div className="grid flex-1 grid-cols-3 gap-1">
                          {(["full", "partial", "none"] as AvKind[]).map((k) => {
                            const active = k === kind;
                            const label = k === "full" ? "Full" : k === "partial" ? "Partial" : "Off";
                            return (
                              <button
                                key={k}
                                type="button"
                                onClick={() => setDayKind(d, k)}
                                className={`min-h-11 rounded-md border text-xs font-medium transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {kind === "partial" ? (
                        <div className="grid grid-cols-2 gap-1 pl-12">
                          {(["day", "night"] as DayHalf[]).map((h) => {
                            const active = h === half;
                            return (
                              <button
                                key={h}
                                type="button"
                                onClick={() => setDayHalf(d, h)}
                                className={`min-h-11 rounded-md border text-xs font-medium transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
                              >
                                {h === "day" ? "Day" : "Night"}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                  </div>
                );
              })}
              </div>
              {!availabilityCheck.complete ? (
                <p className="text-xs text-muted-foreground">
                  Still need: {availabilityCheck.missing.join(", ")}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <Label className="text-sm font-medium">Emergency contact</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="First name"><Input value={ecFirstName} onChange={(e) => setEcFirstName(e.target.value)} maxLength={60} /></Field>
                <Field label="Last name"><Input value={ecLastName} onChange={(e) => setEcLastName(e.target.value)} maxLength={60} /></Field>
              </div>
              <Field label="Phone"><PhoneInput value={ecPhone} onChange={setEcPhone} /></Field>
              <Field label="Relationship">
                <Select value={ecRel || undefined} onValueChange={(v: Relationship) => setEcRel(v)}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Select relationship (optional)" /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <Label className="text-sm font-medium">Create a password</Label>
              <p className="-mt-1 text-xs text-muted-foreground">You'll use this with your email to sign in to 86Paper.</p>
              <Field label="Password"><PasswordInput autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              <Field label="Confirm password"><PasswordInput autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
            </div>

            <Button
              size="lg"
              className="h-14 text-base shadow-elegant"
              onClick={submit}
              disabled={submitting || !availabilityCheck.complete}
            >
              {submitting ? "Setting up…" : `Join ${restaurantName}`}
            </Button>
          </CardContent>
        </Card>
      </section>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5">
        <Link to="/"><Logo /></Link>
      </header>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 py-5">
        <Link to="/"><Logo /></Link>
      </header>
      <div className="mx-auto max-w-md px-4 py-16 text-center">{children}</div>
    </div>
  );
}
