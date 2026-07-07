import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { checkAdminAccess, getAdminOverview } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin — 86Paper" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { loading, session } = useAuth();
  const navigate = useNavigate();
  const checkFn = useServerFn(checkAdminAccess);
  const overviewFn = useServerFn(getAdminOverview);

  const [accessChecked, setAccessChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    checkFn({})
      .then((r) => {
        if (!r.isAdmin) {
          navigate({ to: "/" });
        } else {
          setIsAdmin(true);
        }
      })
      .catch(() => navigate({ to: "/" }))
      .finally(() => setAccessChecked(true));
  }, [loading, session, checkFn, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => overviewFn({}),
    enabled: isAdmin,
  });

  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return data.restaurants;
    return data.restaurants.filter(
      (r) =>
        (r.restaurantName ?? "").toLowerCase().includes(needle) ||
        r.ownerEmail.toLowerCase().includes(needle) ||
        r.ownerName.toLowerCase().includes(needle),
    );
  }, [data, q]);

  if (loading || !accessChecked || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">86Paper · Platform Admin</p>
            <h1 className="text-lg font-semibold">Accounts overview</h1>
          </div>
          <Badge variant="outline" className="border-primary/40 text-primary">Free tier</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-6 py-6">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Restaurant accounts" value={data?.totalOwners ?? "—"} />
          <StatCard label="Employee accounts" value={data?.totalEmployees ?? "—"} />
          <StatCard label="Signups this week" value={data?.signupsThisWeek ?? "—"} />
          <StatCard label="Plan" value="Free tier" muted />
        </section>

        <section className="rounded-md border border-border bg-background">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Restaurant accounts</h2>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search restaurant, owner, or email"
              className="h-8 max-w-xs"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Restaurant</th>
                  <th className="px-4 py-2 font-medium">Owner</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Signed up</th>
                  <th className="px-4 py-2 text-right font-medium">Employees</th>
                  <th className="px-4 py-2 font-medium">Plan</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No accounts.</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.userId} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{r.restaurantName || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-2">{r.ownerName}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.ownerEmail}</td>
                    <td className="px-4 py-2 text-muted-foreground">{new Date(r.signupDate).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.employeeCount}</td>
                    <td className="px-4 py-2"><Badge variant="outline" className="text-[10px]">Free</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value, muted }: { label: string; value: string | number; muted?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${muted ? "text-muted-foreground" : ""}`}>{value}</p>
    </div>
  );
}
