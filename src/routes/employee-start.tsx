import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/sidework/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Building2, ChevronRight, Loader2 } from "lucide-react";
import { searchRestaurants, type RestaurantSearchResult } from "@/lib/search-restaurants";

export const Route = createFileRoute("/employee-start")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Find your restaurant — 86Paper" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmployeeStartPage,
});

function EmployeeStartPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RestaurantSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const debounced = useDebounced(query, 250);

  useEffect(() => {
    let cancelled = false;
    const q = debounced.trim();
    if (!q) { setResults([]); setLoading(false); setError(null); return; }
    setLoading(true);
    setError(null);
    searchRestaurants(q)
      .then((r) => { if (!cancelled) setResults(r); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Search failed"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
        <Logo />
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Back</Link>
      </header>

      <main className="mx-auto max-w-md px-4 pb-16">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Welcome to 86Paper</h1>
          <p className="mt-2 text-sm text-muted-foreground">Find your restaurant to get started, or sign in if you already have an account.</p>
        </div>

        <div className="mt-6 rounded-2xl border-2 border-border bg-card p-5">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">New here?</label>
          <p className="mt-1 text-sm text-foreground">Search for your restaurant.</p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              className="h-12 pl-9"
              placeholder="e.g. Perlo's"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setTouched(true); }}
            />
            {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          </div>

          <div className="mt-3 space-y-2">
            {error && <p className="text-xs text-destructive">{error}</p>}
            {!loading && touched && debounced.trim() && results.length === 0 && !error && (
              <p className="text-sm text-muted-foreground">
                No matches. Double-check the spelling — or ask your manager if they've set up 86Paper yet.
              </p>
            )}
            {results.map((r) => (
              <Link
                key={r.owner_id}
                to="/join/$slug"
                params={{ slug: r.slug }}
                className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 transition hover:border-primary hover:bg-primary-soft/30"
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.restaurant_name}</p>
                  <p className="text-xs text-muted-foreground">Tap to join the team</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Already joined?</p>
            <p className="mt-1 text-sm text-foreground">Sign in to your account.</p>
            <Button asChild variant="outline" size="lg" className="mt-3 w-full">
              <Link to="/employee-login">Employee sign in</Link>
            </Button>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Manager or owner? <Link to="/login" className="font-semibold text-primary hover:underline">Manager sign-in</Link>
        </p>
      </main>
    </div>
  );
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useMemo(() => v, [v]);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
