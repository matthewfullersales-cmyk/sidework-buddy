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
import { useStore, type Relationship } from "@/lib/sidework-store";
import { AvailabilityPicker, unansweredDays, type PartialWeekly } from "@/components/sidework/AvailabilityPicker";
import { supabase } from "@/integrations/supabase/client";
import { resolveJoinRestaurant } from "@/lib/join.functions";
import { formatPhone } from "@/lib/format-phone";
import { toast } from "sonner";
import { CheckCircle2, Share, Plus } from "lucide-react";

const RELATIONSHIPS: Relationship[] = ["Spouse", "Parent", "Sibling", "Child", "Friend", "Other"];

const joinSchema = z.object({
  firstName: z.string().trim().min(1, "First name required").max(60),
  lastName: z.string().trim().min(1, "Last name required").max(60),
  email: z.string().trim().email("Valid email required").max(255),
  phone: z.string().trim().min(7, "Phone number required").max(30),
  ecFirstName: z.string().trim().min(1, "Emergency contact first name required").max(60),
  ecLastName: z.string().trim().min(1, "Emergency contact last name required").max(60),
  ecPhone: z.string().trim().min(7, "Emergency contact phone required").max(30),
});

export const Route = createFileRoute("/join/$slug")({
  ssr: false,
  head: () => ({ meta: [{ title: "Join the team — 86Paper" }] }),
  component: JoinPage,
});

function JoinPage() {
  const { slug } = Route.useParams();
  const { joinStaff } = useStore();
  const [resolved, setResolved] = useState<{ ownerId: string; restaurantName: string } | null>(null);
  const [resolving, setResolving] = useState(true);
  const restaurantName = resolved?.restaurantName ?? "the team";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await resolveJoinRestaurant({ data: { slug } });
        if (!cancelled) setResolved(r);
      } catch (e) {
        console.error("[join] resolve", e);
        if (!cancelled) setResolved(null);
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [availability, setAvailability] = useState<PartialWeekly>({});
  const [ecFirstName, setEcFirstName] = useState("");
  const [ecLastName, setEcLastName] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [ecRel, setEcRel] = useState<Relationship>("Friend");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ firstName: string } | null>(null);

  const missingDays = unansweredDays(availability);

  const submit = async () => {
    const parsed = joinSchema.safeParse({ firstName, lastName, email, phone, ecFirstName, ecLastName, ecPhone });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return toast.error(first?.message ?? "Please complete the form");
    }
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirmPassword) return toast.error("Passwords don't match");
    if (!resolved) return toast.error("This join link isn't valid");
    if (missingDays.length > 0) return toast.error(`Please answer every day: ${missingDays.join(", ")}.`);

    setSubmitting(true);
    try {
      // 1. Resolve an auth user: reuse only a matching session, else sign up/sign in.
      const { data: sessData } = await supabase.auth.getSession();
      const activeSession = sessData.session;
      const enteredEmail = parsed.data.email.trim().toLowerCase();
      const activeEmail = activeSession?.user.email?.trim().toLowerCase() ?? null;
      let userId = activeSession && activeEmail === enteredEmail ? activeSession.user.id : null;

      if (activeSession && activeEmail !== enteredEmail) {
        const confirmed = window.confirm(
          `You're signed in as ${activeSession.user.email ?? "another account"}. Continuing will sign you out and create an account for ${parsed.data.email.trim()}.`,
        );
        if (!confirmed) return;

        const { error: signOutErr } = await supabase.auth.signOut();
        if (signOutErr) throw new Error("Couldn't sign out the current account. Please try again.");
      }

      if (!userId) {
        const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: parsed.data.email,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: { full_name: `${parsed.data.firstName} ${parsed.data.lastName}`, role: "employee" },
          },
        });
        if (signUpErr && /already registered|already exists/i.test(signUpErr.message)) {
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email: parsed.data.email,
            password,
          });
          if (signInErr) throw new Error("An account already exists for that email. Check your password and try again.");
          userId = signInData.user?.id ?? null;
        } else if (signUpErr) {
          throw new Error(signUpErr.message);
        } else {
          if (!signUpData.session) {
            throw new Error("Confirm your email, then reopen this join link to finish joining.");
          }
          userId = signUpData.session.user.id;
        }
      }

      if (!userId) {
        throw new Error("Check your email to confirm your account, then open this link again to finish joining.");
      }

      // 2. Server resolves the slug again and inserts a PENDING person row.
      await joinStaff({
        slug,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        weeklyAvailability: availability,
        emergencyContact: {
          firstName: parsed.data.ecFirstName,
          lastName: parsed.data.ecLastName,
          phone: parsed.data.ecPhone,
          relationship: ecRel,
        },
      });

      setDone({ firstName: parsed.data.firstName });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't complete your join request");
    } finally {
      setSubmitting(false);
    }
  };

  if (resolving) {
    return (
      <Shell>
        <div className="mx-auto max-w-md px-4 py-16">
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        </div>
      </Shell>
    );
  }

  if (!resolved) {
    return (
      <Shell>
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-2xl font-bold">Join link not found</h1>
          <p className="mt-2 text-muted-foreground">This staff link doesn't match a restaurant on 86Paper.</p>
          <Button asChild className="mt-6"><Link to="/">Go home</Link></Button>
        </div>
      </Shell>
    );
  }

  if (done) return <SuccessScreen firstName={done.firstName} restaurantName={restaurantName} />;


  return (
    <Shell>
      <section className="bg-gradient-hero text-primary-foreground">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <h1 className="text-3xl font-bold leading-tight">{restaurantName} is hiring you on 86Paper!</h1>
          <p className="mt-2 text-white/90">Fill out your profile to get started. Takes under 2 minutes.</p>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-4 py-6">
        <Card className="border-2">
          <CardContent className="grid gap-5 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name"><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} autoComplete="given-name" /></Field>
              <Field label="Last name"><Input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} autoComplete="family-name" /></Field>
            </div>
            <Field label="Email"><Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} autoComplete="email" /></Field>
            <Field label="Phone"><PhoneInput value={phone} onChange={setPhone} /></Field>

            <div className="grid gap-2">
              <Label className="text-sm font-medium">Weekly availability</Label>
              <p className="text-xs text-muted-foreground">Answer every day.</p>
              <AvailabilityPicker value={availability} onChange={setAvailability} />
              {missingDays.length > 0 && (
                <p className="text-xs text-muted-foreground">Still need: {missingDays.join(", ")}</p>
              )}
            </div>

            <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <Label className="text-sm font-medium">Emergency contact</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="First name"><Input value={ecFirstName} onChange={(e) => setEcFirstName(e.target.value)} maxLength={60} /></Field>
                <Field label="Last name"><Input value={ecLastName} onChange={(e) => setEcLastName(e.target.value)} maxLength={60} /></Field>
              </div>
              <Field label="Phone"><PhoneInput value={ecPhone} onChange={setEcPhone} /></Field>
              <Field label="Relationship">
                <Select value={ecRel} onValueChange={(v: Relationship) => setEcRel(v)}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
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


            <Button size="lg" className="h-14 text-base shadow-elegant" onClick={submit} disabled={submitting || missingDays.length > 0}>
              {submitting ? "Joining…" : `Join ${restaurantName}`}
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

function SuccessScreen({ firstName, restaurantName }: { firstName: string; restaurantName: string }) {
  const platform = useMemo<"ios" | "android" | "other">(() => {
    if (typeof navigator === "undefined") return "other";
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (/Android/i.test(ua)) return "android";
    return "other";
  }, []);

  return (
    <Shell>
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/15">
          <CheckCircle2 className="h-12 w-12 text-success" />
        </div>
        <h1 className="mt-6 text-3xl font-bold">Welcome to {restaurantName}, {firstName}!</h1>
        <p className="mt-3 text-base text-muted-foreground">Your request has been sent to your manager for approval.</p>
        <p className="mt-1 text-sm text-muted-foreground">Once they approve you, you'll show up on the schedule.</p>


        <Card className="mt-8 border-2 text-left">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              <p className="font-semibold">Add 86Paper to your home screen</p>
            </div>
            <p className="text-sm text-muted-foreground">
              For easy access to your schedule and more — no app store needed.
            </p>
            {platform === "ios" ? (
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <p className="font-medium">On iPhone:</p>
                <p className="mt-1 text-muted-foreground">
                  Tap the share button <span className="inline-flex items-center gap-1 align-middle"><Share className="inline h-4 w-4" /> (box with arrow)</span> at the bottom of your browser, then tap <span className="font-semibold">"Add to Home Screen"</span>.
                </p>
              </div>
            ) : platform === "android" ? (
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <p className="font-medium">On Android:</p>
                <p className="mt-1 text-muted-foreground">
                  Tap your browser's menu and choose <span className="font-semibold">"Add to Home Screen"</span> (or "Install app") when prompted.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                Open this page on your phone, then add it to your home screen from your browser menu.
              </div>
            )}
            <Button
              size="lg"
              className="h-14 w-full text-base shadow-elegant"
              onClick={() => toast.message("Use your browser menu", { description: "iPhone: Share → Add to Home Screen. Android: Menu → Add to Home Screen." })}
            >
              <Plus className="mr-2 h-4 w-4" /> Add to Home Screen
            </Button>
          </CardContent>
        </Card>

        <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-4 text-left">
          <p className="font-semibold text-primary">What happens next</p>
          <p className="mt-1 text-sm text-foreground/90">
            Your manager reviews your request. Once they approve you and assign your role, you'll show up on the
            schedule.
          </p>
          <Button asChild className="mt-3 w-full">
            <Link to="/employee">Open my 86Paper</Link>
          </Button>

        </div>
      </div>
    </Shell>
  );
}
