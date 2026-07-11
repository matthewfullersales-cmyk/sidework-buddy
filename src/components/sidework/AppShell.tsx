import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { LogOut, ArrowLeftRight } from "lucide-react";

export function AppShell({ children, nav }: { children: ReactNode; nav: { to: string; label: string; icon: ReactNode }[] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, signOut, effectiveOwner, employeeContext } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  // Dual-role affordance: users who both have manager permissions AND a
  // linked employee record see a pill to jump between the two dashboards.
  const hasManager = (effectiveOwner?.permissions?.size ?? 0) > 0;
  const hasEmployee = !!employeeContext?.employeeId;
  const showDualRoleSwitcher = hasManager && hasEmployee;
  const inManagerArea = location.pathname.startsWith("/manager");
  const switcherTarget = inManagerArea ? "/employee" : "/manager";
  const switcherLabel = inManagerArea ? "Switch to My Schedule" : "Switch to Manager";

  return (
    <div className="min-h-screen bg-background pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))] md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="shrink-0"><Logo /></Link>
          {session && (
            <Button variant="ghost" size="sm" onClick={handleSignOut} title="Sign out" className="h-11 md:h-9">
              <LogOut className="h-4 w-4" />
              <span className="ml-1.5 hidden sm:inline">Sign out</span>
            </Button>
          )}
        </div>
        <nav className="mx-auto hidden max-w-6xl gap-1 px-4 pb-2 md:flex">
          {nav.map((n) => {
            const active = location.pathname === n.to || location.pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {n.icon}{n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-safe backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md justify-around">
          {nav.map((n) => {
            const active = location.pathname === n.to || location.pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                {n.icon}<span className="font-medium">{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}


export { Button };
