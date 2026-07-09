import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Share, Plus, Smartphone, ChevronRight, MoreVertical } from "lucide-react";
import { detectPlatform, isStandalone, useInstallPrompt, type Platform } from "@/lib/pwa-install";

export const Route = createFileRoute("/get-app")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Get the 86Paper app — for restaurant employees" },
      { name: "description", content: "Add 86Paper to your home screen and stay on top of shifts, trades, and training." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GetAppPage,
});

function GetAppPage() {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<Platform>("other");
  const [alreadyInstalled, setAlreadyInstalled] = useState(false);
  const { canPrompt, installed, promptInstall } = useInstallPrompt();

  useEffect(() => {
    setPlatform(detectPlatform());
    setAlreadyInstalled(isStandalone());
  }, []);

  const goNext = () => navigate({ to: "/employee-start" });

  if (alreadyInstalled || installed) {
    return (
      <Shell>
        <Card><CardContent className="p-6 text-center space-y-4">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/10 text-success">
            <Smartphone className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">You're all set</h1>
          <p className="text-sm text-muted-foreground">86Paper is installed. Let's get you into your restaurant.</p>
          <Button size="lg" className="w-full" onClick={goNext}>Continue<ChevronRight className="ml-1 h-4 w-4"/></Button>
        </CardContent></Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-4">
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Smartphone className="h-6 w-6" />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">Add 86Paper to your phone</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Get one-tap access to your schedule, shift trades, time off, and training — right from your home screen.
          </p>
        </div>

        {platform === "ios" && <IOSInstructions />}
        {platform === "android" && (
          <AndroidInstructions canPrompt={canPrompt} onPrompt={async () => { await promptInstall(); }} />
        )}
        {(platform === "desktop" || platform === "other") && <DesktopInstructions canPrompt={canPrompt} onPrompt={async () => { await promptInstall(); }} />}

        <div className="pt-2 text-center">
          <button onClick={goNext} className="text-sm font-semibold text-primary hover:underline">
            Continue in browser →
          </button>
          <p className="mt-1 text-xs text-muted-foreground">You can always install later.</p>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
        <Logo />
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Back</Link>
      </header>
      <main className="mx-auto max-w-md px-4 pb-16">{children}</main>
    </div>
  );
}

function StepList({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-bold">{i + 1}</div>
          <div className="pt-0.5 text-sm text-foreground">{s}</div>
        </li>
      ))}
    </ol>
  );
}

function IOSInstructions() {
  return (
    <>
      <div className="rounded-xl bg-primary-soft/40 p-3 text-center text-xs font-medium text-primary">
        Use Safari — Add to Home Screen isn't available in other iOS browsers.
      </div>
      <StepList steps={[
        <span>Tap the <strong>Share</strong> button <span className="inline-flex align-middle"><Share className="mx-1 inline h-4 w-4" /></span> at the bottom of Safari.</span>,
        <span>Scroll and tap <strong>Add to Home Screen</strong> <span className="inline-flex align-middle"><Plus className="mx-1 inline h-4 w-4" /></span>.</span>,
        <span>Tap <strong>Add</strong> in the top right. 86Paper will appear on your home screen.</span>,
      ]} />
    </>
  );
}

function AndroidInstructions({ canPrompt, onPrompt }: { canPrompt: boolean; onPrompt: () => Promise<void> }) {
  if (canPrompt) {
    return (
      <Card><CardContent className="p-5 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Chrome can install this app in one tap.</p>
        <Button size="lg" className="w-full" onClick={onPrompt}>Install 86Paper</Button>
      </CardContent></Card>
    );
  }
  return (
    <StepList steps={[
      <span>Tap the <strong>menu</strong> <span className="inline-flex align-middle"><MoreVertical className="mx-1 inline h-4 w-4" /></span> in the top right of Chrome.</span>,
      <span>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</span>,
      <span>Confirm — 86Paper will appear on your home screen.</span>,
    ]} />
  );
}

function DesktopInstructions({ canPrompt, onPrompt }: { canPrompt: boolean; onPrompt: () => Promise<void> }) {
  return (
    <>
      {canPrompt && (
        <Card><CardContent className="p-5 text-center space-y-3">
          <p className="text-sm text-muted-foreground">You can install 86Paper as an app on this device.</p>
          <Button size="lg" className="w-full" onClick={onPrompt}>Install 86Paper</Button>
        </CardContent></Card>
      )}
      <p className="text-center text-xs text-muted-foreground">
        On your phone? Open <strong>86paper.com</strong> in your mobile browser to add it to your home screen.
      </p>
    </>
  );
}
