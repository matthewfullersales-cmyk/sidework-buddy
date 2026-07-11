import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Logo } from "@/components/sidework/Logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";

import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useStore,
  type Role,
  type Relationship,
  type WeeklyAvailability,
  type DayKey,
  DAY_KEYS,
  defaultWeeklyAvailability,
} from "@/lib/sidework-store";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublicHireInvite, claimHireInvite, type PublicHireInviteInfo } from "@/lib/hiring-supabase";
import { formatPhone } from "@/lib/format-phone";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Share, Plus } from "lucide-react";

const FOH_ROLES: Role[] = ["Host", "Busser", "Server Assistant", "Bar Back", "Bartender", "Server", "Manager", "Assistant Manager"];
const BOH_ROLES: Role[] = ["Chef", "Sous Chef", "Line Cook", "Fry Cook", "Saute", "Grill", "Pizza", "Garde Manger", "Dishwasher", "Prep"];
const RELATIONSHIPS: Relationship[] = ["Spouse", "Parent", "Sibling", "Child", "Friend", "Other"];

const hiredSchema = z.object({
  firstName: z.string().trim().min(1, "First name required").max(60),
  lastName: z.string().trim().min(1, "Last name required").max(60),
  email: z.string().trim().email("Valid email required").max(255),
  phone: z.string().trim().min(7, "Phone number required").max(30),
  ecFirstName: z.string().trim().min(1, "Emergency contact first name required").max(60),
  ecLastName: z.string().trim().min(1, "Emergency contact last name required").max(60),
  ecPhone: z.string().trim().min(7, "Emergency contact phone required").max(30),
});

export const Route = createFileRoute("/hired/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "Welcome to the team — 86Paper" }] }),
  component: HiredPage,
});

type AvKind = "full" | "partial" | "none";

function HiredPage() {
  const { id } = Route.useParams();
  const { joinStaff } = useStore();

  const [invite, setInvite] = useState<PublicHireInviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("Server");
  const [availability, setAvailability] = useState<WeeklyAvailability>(() => defaultWeeklyAvailability());
  const [ecFirstName, setEcFirstName] = useState("");
  const [ecLastName, setEcLastName] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [ecRel, setEcRel] = useState<Relationship>("Friend");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ firstName: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicHireInvite(id)
      .then((res) => {
        if (cancelled) return;
        if (!res) { setNotFound(true); return; }
        setInvite(res);
        const first = res.firstName ?? res.name.split(" ")[0] ?? "";
        const last = res.lastName ?? res.name.split(" ").slice(1).join(" ") ?? "";
        setFirstName(first);
        setLastName(last);
        setEmail(res.email ?? "");
        setPhone(res.phone ? formatPhone(res.phone) : "");
        if (res.role && [...FOH_ROLES, ...BOH_ROLES].includes(res.role as Role)) {
          setRole(res.role as Role);
        }
      })
      .catch((e) => {
        console.error("[hired page]", e);
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  const setDayKind = (day: DayKey, kind: AvKind) =>
    setAvailability((prev) => ({
      ...prev,
      [day]: kind === "partial" ? { kind: "partial", meals: ["Lunch", "Dinner"] } : { kind },
    }));

  const restaurantName = invite?.restaurantName ?? "the team";
  const alreadyClaimed = !!invite?.hiredEmployeeId && !/^e_/.test(invite.hiredEmployeeId);

  const submit = async () => {
    const parsed = hiredSchema.safeParse({ firstName, lastName, email, phone, ecFirstName, ecLastName, ecPhone });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return toast.error(first?.message ?? "Please complete the form");
    }
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirmPassword) return toast.error("Passwords don't match");

    setSubmitting(true);
    joinStaff({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      role,
      weeklyAvailability: availability,
      emergencyContact: { firstName: parsed.data.ecFirstName, lastName: parsed.data.ecLastName, phone: parsed.data.ecPhone, relationship: ecRel },
    });

    const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: parsed.data.email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: `${parsed.data.firstName} ${parsed.data.lastName}`, role: "employee" },
      },
    });
    if (signUpErr) {
      setSubmitting(false);
      return toast.error(signUpErr.message);
    }
    const uid = signUpData.user?.id;
    if (uid) {
      const { error: pErr } = await supabase.from("profiles").insert({
        id: uid,
        role: "employee",
        full_name: `${parsed.data.firstName} ${parsed.data.lastName}`,
      });
      if (pErr) {
        setSubmitting(false);
        return toast.error(pErr.message);
      }
      try {
        await claimHireInvite(id, uid);
      } catch (e) {
        console.error("[claimHireInvite]", e);
        // Non-fatal for the user — account is created; manager can re-link manually.
      }
    }

    setSubmitting(false);
    setDone({ firstName: parsed.data.firstName });
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
        <p className="mt-2 text-muted-foreground">This hire link may have expired or been revoked.</p>
        <Button asChild className="mt-6"><Link to="/">Go home</Link></Button>
      </Centered>
    );
  }

  if (alreadyClaimed) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">Invite already claimed</h1>
        <p className="mt-2 text-muted-foreground">
          Looks like this hire link has already been used. If that wasn't you, please contact {restaurantName}.
        </p>
        <Button asChild className="mt-6"><Link to="/auth">Sign in</Link></Button>
      </Centered>
    );
  }

  if (done) return <SuccessScreen firstName={done.firstName} restaurantName={restaurantName} />;

  return (
    <Shell>
      <section className="bg-gradient-hero text-primary-foreground">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            🎉 You're hired
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight">Welcome to {restaurantName}, {invite.firstName ?? invite.name}!</h1>
          <p className="mt-2 text-white/90">
            Finish setting up your account to start your training. Takes under 2 minutes.
          </p>
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

            <Field label="Primary role">
              <Select value={role} onValueChange={(v: Role) => setRole(v)}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Front of House</SelectLabel>
                    {FOH_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Back of House</SelectLabel>
                    {BOH_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-2">
              <Label className="text-sm font-medium">Weekly availability</Label>
              <p className="text-xs text-muted-foreground">Tap to choose Full day, Partial, or Off for each day.</p>
              <div className="grid gap-2">
                {DAY_KEYS.map((d) => {
                  const kind: AvKind = availability[d].kind;
                  return (
                    <div key={d} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
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
                  );
                })}
              </div>
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
              <Field label="Password"><Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              <Field label="Confirm password"><Input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field>
            </div>

            <Button size="lg" className="h-14 text-base shadow-elegant" onClick={submit} disabled={submitting}>
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
        <p className="mt-3 text-base text-muted-foreground">You're all set on 86Paper.</p>
        <p className="mt-1 text-sm text-muted-foreground">Your manager has been notified.</p>

        <Card className="mt-8 border-2 text-left">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              <p className="font-semibold">Add 86Paper to your home screen</p>
            </div>
            <p className="text-sm text-muted-foreground">
              For easy access to your schedule, training, and more — no app store needed.
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
          </CardContent>
        </Card>

        <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-4 text-left">
          <p className="font-semibold text-primary">Your training starts here.</p>
          <p className="mt-1 text-sm text-foreground/90">
            Complete your videos and quizzes before your first shift.
          </p>
          <Button asChild className="mt-3 w-full">
            <Link to="/employee">Open my training</Link>
          </Button>
        </div>
      </div>
    </Shell>
  );
}
