import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/sidework-store";
import { slugify } from "@/lib/slug";
import { loadMyJoinSlug, setMyJoinSlug } from "@/lib/restaurant-slug";
import { toast } from "sonner";
import { Copy, Download, QrCode, Printer } from "lucide-react";

/**
 * The join slug lives in the database (profiles.slug) so an unauthenticated
 * visitor can resolve it. There is deliberately no local fallback: a restaurant
 * with no name gets no join link at all.
 */
export function useJoinUrl() {
  const { restaurantProfile } = useStore();
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [restaurantName, setRestaurantName] = useState<string | null>(restaurantProfile?.name ?? null);

  const refresh = async () => {
    setLoading(true);
    try {
      const s = await loadMyJoinSlug();
      setSlug(s.slug);
      setRestaurantName(s.restaurantName ?? restaurantProfile?.name ?? null);
    } catch (e) {
      console.error("[useJoinUrl]", e);
      setSlug(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await loadMyJoinSlug();
        if (cancelled) return;
        setSlug(s.slug);
        setRestaurantName(s.restaurantName ?? restaurantProfile?.name ?? null);
      } catch (e) {
        if (!cancelled) console.error("[useJoinUrl]", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [restaurantProfile?.name]);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://86paper.com";
  return {
    slug,
    loading,
    ready: Boolean(slug),
    url: slug ? `${origin}/join/${slug}` : "",
    restaurantName: restaurantName ?? restaurantProfile?.name ?? "your restaurant",
    setSlug,
    refresh,
  };
}


function useQrDataUrl(value: string, size = 512) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(value, {
          width: size,
          margin: 1,
          color: { dark: "#14532d", light: "#ffffff" },
          errorCorrectionLevel: "M",
        }),
      )
      .then((d) => { if (!cancelled) setSrc(d); })
      .catch(() => { if (!cancelled) setSrc(""); });
    return () => { cancelled = true; };
  }, [value, size]);
  return src;
}

export function StaffOnboardingCard() {
  const { restaurantProfile } = useStore();
  const { slug, url, restaurantName, ready, loading, setSlug } = useJoinUrl();
  const qr = useQrDataUrl(ready ? url : "", 512);
  const [editSlug, setEditSlug] = useState(slug ?? "");
  const [showPrint, setShowPrint] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setEditSlug(slug ?? ""); }, [slug]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: url });
    } catch {
      toast.message("Copy this link", { description: url });
    }
  };

  const download = () => {
    if (!qr) return;
    const a = document.createElement("a");
    a.href = qr;
    a.download = `86paper-join-${slug}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const saveSlug = async () => {
    const next = slugify(editSlug);
    if (!next) return toast.error("Slug can't be empty");
    if (next === slug) return;
    setSaving(true);
    try {
      const applied = await setMyJoinSlug(next);
      setSlug(applied);
      toast.success(`Slug updated to /join/${applied}`, { description: "Your old link still works." });
    } catch (e) {
      toast.error("Couldn't update slug", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Staff Onboarding</CardTitle></CardHeader>
        <CardContent><div className="h-24 animate-pulse rounded bg-muted" /></CardContent>
      </Card>
    );
  }

  if (!ready) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="text-base">Staff Onboarding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">Set your restaurant name before you can share a join link.</p>
          <p className="text-xs text-muted-foreground">
            Your join link and QR code are built from your restaurant name. Add it under Settings → Restaurant info
            and the link will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Staff Onboarding</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">Share this link with your staff to let them join {restaurantName} on 86Paper. New joins wait for your approval before they can be scheduled.</p>
      </CardHeader>
      <CardContent className="space-y-5">

        <div className="grid gap-2">
          <Label className="text-sm">Your join link</Label>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-muted px-3 py-2 text-sm">{url}</code>
            <Button size="sm" variant="outline" onClick={copy}><Copy className="mr-1.5 h-4 w-4" /> Copy</Button>
          </div>
        </div>

        <div className="grid gap-2">
          <Label className="text-sm">Customize slug</Label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">/join/</span>
            <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} className="max-w-xs" maxLength={40} />
            <Button size="sm" variant="outline" onClick={saveSlug} disabled={saving || slugify(editSlug) === slug}>Save</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Changing this keeps your old link working, so printed QR codes stay valid.</p>

        </div>

        <div className="grid gap-3 sm:grid-cols-[auto,1fr] sm:items-center">
          <div className="grid place-items-center rounded-xl border-2 border-border bg-white p-3">
            {qr ? <img src={qr} alt="Join QR code" className="h-48 w-48" /> : <div className="h-48 w-48 animate-pulse rounded bg-muted" />}
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Your staff can scan this QR code on their phone to open the join page instantly.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={download} disabled={!qr}><Download className="mr-1.5 h-4 w-4" /> Download QR</Button>
              <Button variant="outline" onClick={() => setShowPrint(true)} disabled={!qr}><Printer className="mr-1.5 h-4 w-4" /> Print-ready poster</Button>
            </div>
          </div>
        </div>
      </CardContent>

      {showPrint && (
        <PrintablePosterDialog
          restaurantName={restaurantProfile?.name ?? "our team"}
          url={url}
          qr={qr}
          onClose={() => setShowPrint(false)}
        />
      )}
    </Card>
  );
}

export function StaffJoinBanner({ onShowQr }: { onShowQr: () => void }) {
  const { url, ready, loading } = useJoinUrl();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Join link copied");
    } catch {
      toast.message("Copy this link", { description: url });
    }
  };
  if (loading) return null;
  if (!ready) {
    return (
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Join link unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">Add your restaurant name in Settings to generate a staff join link and QR code.</p>
        </CardContent>
      </Card>
    );
  }
  return (

    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Your staff join link</p>
          <code className="mt-1 block truncate text-sm">{url}</code>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={copy}><Copy className="mr-1.5 h-4 w-4" /> Copy</Button>
          <Button size="sm" onClick={onShowQr}><QrCode className="mr-1.5 h-4 w-4" /> QR</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function FullscreenQrDialog({ onClose }: { onClose: () => void }) {
  const { url, restaurantName } = useJoinUrl();
  const qr = useQrDataUrl(url, 800);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Scan to join {restaurantName}</DialogTitle>
        </DialogHeader>
        <div className="grid place-items-center p-4">
          <div className="rounded-xl border-2 border-border bg-white p-4">
            {qr ? <img src={qr} alt="Join QR code" className="h-72 w-72" /> : <div className="h-72 w-72 animate-pulse rounded bg-muted" />}
          </div>
          <p className="mt-3 text-center text-sm text-muted-foreground">Have staff scan this with their phone camera.</p>
          <code className="mt-1 break-all text-center text-xs">{url}</code>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PrintablePosterDialog({ restaurantName, url, qr, onClose }: { restaurantName: string; url: string; qr: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const printNow = () => {
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) return toast.error("Pop-up blocked");
    w.document.write(`
      <html><head><title>86Paper Join Poster — ${restaurantName}</title>
      <style>
        body { margin: 0; font-family: -apple-system, system-ui, sans-serif; color: #14532d; }
        .poster { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:48px 32px; text-align:center; min-height: 100vh; }
        .brand { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
        .restaurant { margin-top: 8px; font-size: 18px; color: #475569; }
        .headline { margin-top: 28px; font-size: 40px; font-weight: 800; line-height: 1.1; max-width: 600px; }
        img { margin-top: 28px; width: 360px; height: 360px; }
        .url { margin-top: 16px; font-family: ui-monospace, monospace; font-size: 14px; color: #475569; }
      </style></head><body onload="setTimeout(()=>window.print(),200)">
        <div class="poster">
          <div class="brand">▤ 86Paper</div>
          <div class="restaurant">${restaurantName}</div>
          <div class="headline">Scan to join our team on 86Paper</div>
          <img src="${qr}" alt="QR" />
          <div class="url">${url}</div>
        </div>
      </body></html>
    `);
    w.document.close();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Print-ready poster</DialogTitle>
        </DialogHeader>
        <div ref={ref} className="rounded-xl border-2 border-border bg-white p-6 text-center text-foreground">
          <p className="text-lg font-bold tracking-tight">▤ 86Paper</p>
          <p className="text-sm text-muted-foreground">{restaurantName}</p>
          <p className="mt-4 text-2xl font-extrabold leading-tight">Scan to join our team on 86Paper</p>
          <div className="mt-4 grid place-items-center">
            {qr && <img src={qr} alt="QR" className="h-56 w-56" />}
          </div>
          <code className="mt-3 block break-all text-xs text-muted-foreground">{url}</code>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={printNow}><Printer className="mr-1.5 h-4 w-4" /> Print poster</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useStaffJoinUrl() { return useJoinUrl(); }
