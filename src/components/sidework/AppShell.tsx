import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { useStore } from "@/lib/sidework-store";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut } from "lucide-react";

export function AppShell({ children, nav }: { children: ReactNode; nav: { to: string; label: string; icon: ReactNode }[] }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, employees } = useStore();
  const { session, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  const onSwitch = (val: string) => {
    if (val === "manager") {
      setCurrentUser({ type: "manager", id: "owner" });
      navigate({ to: "/manager" });
    } else {
      setCurrentUser({ type: "employee", id: val });
      navigate({ to: "/employee" });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-[max(6rem,calc(5rem+env(safe-area-inset-bottom)))] md:pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="shrink-0"><Logo /></Link>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">Demo as</span>
            <Select
              value={currentUser.type === "manager" ? "manager" : currentUser.id}
              onValueChange={onSwitch}
            >
              <SelectTrigger className="h-11 w-[160px] text-sm sm:w-[180px] md:h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Manager (Owner)</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name} — {e.primaryRole}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
