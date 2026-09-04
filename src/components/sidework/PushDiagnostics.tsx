import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type RegInfo = {
  scriptURL: string;
  scope: string;
  installing: string | null;
  waiting: string | null;
  active: string | null;
};

type Result =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; text: string }
  | { kind: "error"; name: string; message: string };

function formatReg(r: ServiceWorkerRegistration): RegInfo {
  const reg = r as ServiceWorkerRegistration & { scriptURL: string };
  return {
    scriptURL: reg.scriptURL,
    scope: reg.scope,
    installing: reg.installing?.state ?? null,
    waiting: reg.waiting?.state ?? null,
    active: reg.active?.state ?? null,
  };
}

export function PushDiagnostics() {
  const [standaloneMatch, setStandaloneMatch] = useState<boolean>(false);
  const [navigatorStandalone, setNavigatorStandalone] = useState<boolean>(false);
  const [userAgent, setUserAgent] = useState<string>("");
  const [swSupported, setSwSupported] = useState<boolean>(false);
  const [pushManagerSupported, setPushManagerSupported] = useState<boolean>(false);
  const [notificationCtor, setNotificationCtor] = useState<boolean>(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unknown">("unknown");
  const [readyState, setReadyState] = useState<string>("");
  const [prod, setProd] = useState<boolean>(false);
  const [hostname, setHostname] = useState<string>("");
  const [href, setHref] = useState<string>("");
  const [registrations, setRegistrations] = useState<RegInfo[]>([]);
  const [controller, setController] = useState<string>("null");
  const [registerResult, setRegisterResult] = useState<Result>({ kind: "idle" });
  const [readyResult, setReadyResult] = useState<Result>({ kind: "idle" });
  const [fetchResult, setFetchResult] = useState<Result>({ kind: "idle" });

  const read = () => {
    if (typeof window === "undefined") return;
    setStandaloneMatch(window.matchMedia("(display-mode: standalone)").matches);
    setNavigatorStandalone((navigator as unknown as { standalone?: boolean }).standalone === true);
    setUserAgent(navigator.userAgent);
    setSwSupported("serviceWorker" in navigator);
    setPushManagerSupported("PushManager" in window);
    setNotificationCtor("Notification" in window && typeof Notification === "function");
    setNotificationPermission(
      "Notification" in window && typeof Notification === "function"
        ? Notification.permission
        : "unknown",
    );
    setReadyState(document.readyState);
    setProd(import.meta.env.PROD === true);
    setHostname(window.location.hostname);
    setHref(window.location.href);

    void (async () => {
      try {
        if (!("serviceWorker" in navigator)) {
          setRegistrations([]);
          setController("null");
          return;
        }
        const regs = await navigator.serviceWorker.getRegistrations();
        setRegistrations(regs.map(formatReg));
        setController(navigator.serviceWorker.controller?.scriptURL ?? "null");
      } catch (e) {
        setRegistrations([]);
        setController(`error: ${(e as Error).name}: ${(e as Error).message}`);
      }
    })();
  };

  useEffect(() => {
    read();
  }, []);

  const handleRegister = async () => {
    setRegisterResult({ kind: "running" });
    const started = performance.now();
    try {
      if (!("serviceWorker" in navigator)) {
        throw new Error("serviceWorker not in navigator");
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const elapsed = Math.round(performance.now() - started);
      const info = formatReg(reg);
      setRegisterResult({
        kind: "ok",
        text: `registered in ${elapsed}ms\nscriptURL: ${info.scriptURL}\nscope: ${info.scope}\ninstalling: ${info.installing ?? "null"}\nwaiting: ${info.waiting ?? "null"}\nactive: ${info.active ?? "null"}`,
      });
    } catch (e) {
      setRegisterResult({
        kind: "error",
        name: (e as Error).name,
        message: (e as Error).message,
      });
    }
  };

  const handleReady = async () => {
    setReadyResult({ kind: "running" });
    const started = performance.now();
    try {
      if (!("serviceWorker" in navigator)) {
        throw new Error("serviceWorker not in navigator");
      }
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout after 20000ms")), 20_000),
        ),
      ]);
      const elapsed = Math.round(performance.now() - started);
      if (!reg.active) {
        throw new Error("ready resolved but reg.active is falsy");
      }
      setReadyResult({
        kind: "ok",
        text: `ready resolved in ${elapsed}ms\nactive.state: ${reg.active.state}\nscriptURL: ${(reg as ServiceWorkerRegistration & { scriptURL: string }).scriptURL}\nscope: ${reg.scope}`,
      });
    } catch (e) {
      const elapsed = Math.round(performance.now() - started);
      setReadyResult({
        kind: "error",
        name: (e as Error).name,
        message: `${(e as Error).message} (after ${elapsed}ms)`,
      });
    }
  };

  const handleFetch = async () => {
    setFetchResult({ kind: "running" });
    try {
      const swRes = await fetch("/sw.js", { cache: "no-store" });
      const pushRes = await fetch("/push-sw.js", { cache: "no-store" });
      setFetchResult({
        kind: "ok",
        text: `/sw.js: status ${swRes.status}, content-type ${swRes.headers.get("content-type") ?? "(none)"}, ${(await swRes.arrayBuffer()).byteLength} bytes\n/push-sw.js: status ${pushRes.status}, content-type ${pushRes.headers.get("content-type") ?? "(none)"}, ${(await pushRes.arrayBuffer()).byteLength} bytes`,
      });
    } catch (e) {
      setFetchResult({
        kind: "error",
        name: (e as Error).name,
        message: (e as Error).message,
      });
    }
  };

  const renderResult = (r: Result) => {
    if (r.kind === "idle") return <span className="text-muted-foreground">—</span>;
    if (r.kind === "running") return <span className="text-muted-foreground">Running…</span>;
    if (r.kind === "ok") return <span className="whitespace-pre-wrap text-emerald-600">{r.text}</span>;
    return (
      <span className="whitespace-pre-wrap text-destructive">
        {r.name}: {r.message}
      </span>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Push diagnostics</CardTitle>
        <Button variant="outline" size="sm" onClick={read}>Refresh</Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
          <Row label="standalone (display-mode)" value={standaloneMatch ? "true" : "false"} />
          <Row label="standalone (navigator.standalone)" value={navigatorStandalone ? "true" : "false"} />
          <Row label="userAgent" value={userAgent} wrap />
          <Row label="serviceWorker in navigator" value={swSupported ? "true" : "false"} />
          <Row label="PushManager in window" value={pushManagerSupported ? "true" : "false"} />
          <Row label="Notification constructor" value={notificationCtor ? "true" : "false"} />
          <Row label="Notification.permission" value={notificationPermission} />
          <Row label="document.readyState" value={readyState} />
          <Row label="import.meta.env.PROD" value={prod ? "true" : "false"} />
          <Row label="location.hostname" value={hostname} />
          <Row label="location.href" value={href} wrap />
          <Row
            label="registrations"
            value={
              registrations.length === 0
                ? "NONE"
                : registrations
                    .map(
                      (r, i) =>
                        `#${i + 1} scriptURL=${r.scriptURL} scope=${r.scope} installing=${r.installing ?? "null"} waiting=${r.waiting ?? "null"} active=${r.active ?? "null"}`,
                    )
                    .join("\n")
            }
            wrap
          />
          <Row label="controller" value={controller} wrap />
        </div>

        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleRegister}>Register SW</Button>
            <Button size="sm" variant="outline" onClick={handleReady}>Wait for ready (20s)</Button>
            <Button size="sm" variant="outline" onClick={handleFetch}>Fetch /sw.js</Button>
          </div>

          <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs">
            <div className="mb-1 font-semibold">Register SW</div>
            <div>{renderResult(registerResult)}</div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs">
            <div className="mb-1 font-semibold">Wait for ready (20s)</div>
            <div>{renderResult(readyResult)}</div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs">
            <div className="mb-1 font-semibold">Fetch /sw.js</div>
            <div>{renderResult(fetchResult)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className={`py-0.5 ${wrap ? "" : "flex items-start gap-2"}`}>
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className={`break-all ${wrap ? "block whitespace-pre-wrap" : ""}`}>{value}</span>
    </div>
  );
}
