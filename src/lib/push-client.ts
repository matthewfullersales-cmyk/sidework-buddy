// Client-side push subscription helpers. Guarded so nothing runs in Lovable
// preview / dev / iframes — the same host rules as register-sw.ts.
import { getVapidPublicKey, saveSubscription, deleteSubscription, setPushOptIn } from "@/lib/notifications.functions";

const SW_PATH = "/sw.js";

function isBlockedHost(hostname: string) {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

export function pushIsSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  if (window.self !== window.top) return false;
  if (isBlockedHost(window.location.hostname)) return false;
  return true;
}

export type PushState = "unsupported" | "denied" | "granted-unsubscribed" | "subscribed" | "default";

export async function currentPushState(): Promise<PushState> {
  if (!pushIsSupported()) return "unsupported";
  const perm = Notification.permission;
  if (perm === "denied") return "denied";
  if (perm === "default") return "default";
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "subscribed" : "granted-unsubscribed";
  } catch { return "granted-unsubscribed"; }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function subToJson(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
  const key = sub.getKey?.bind(sub);
  const p256dh = key ? key("p256dh") : null;
  const auth = key ? key("auth") : null;
  const b64url = (buf: ArrayBuffer | null) => {
    if (!buf) return "";
    const bytes = new Uint8Array(buf);
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  return { endpoint: sub.endpoint, p256dh: b64url(p256dh), auth: b64url(auth) };
}

/** Prompt for permission, subscribe, and save on the server. */
export async function enablePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!pushIsSupported()) return { ok: false, reason: "This browser doesn't support push notifications." };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: perm === "denied" ? "Notifications are blocked in your browser settings." : "Permission not granted." };

  let reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!reg) {
    // The service worker is only auto-registered on the published site; the
    // guards in register-sw.ts skip it elsewhere. Try to register on demand.
    try { reg = await navigator.serviceWorker.register(SW_PATH); }
    catch { return { ok: false, reason: "Service worker not available." }; }
  }

  const activeReg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
  ]).catch<ServiceWorkerRegistration | null>(() => null);
  if (!activeReg || !activeReg.active) {
    return { ok: false, reason: "Service worker did not activate. Close the app fully and reopen it, then try again." };
  }

  const { key } = await getVapidPublicKey();
  if (!key) return { ok: false, reason: "Server push keys not configured." };
  let sub: PushSubscription;
  try {
    const raw = urlBase64ToUint8Array(key);
    const appServerKey = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    sub = await activeReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    });
  } catch (e) {
    return { ok: false, reason: (e as Error).message || "Failed to subscribe." };
  }
  const j = subToJson(sub);
  try {
    await saveSubscription({ data: { ...j, userAgent: navigator.userAgent.slice(0, 300) } });
  } catch (e) {
    return { ok: false, reason: (e as Error).message || "Failed to save subscription." };
  }
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      try { await deleteSubscription({ data: { endpoint: sub.endpoint } }); } catch { /* ignore */ }
      try { await sub.unsubscribe(); } catch { /* ignore */ }
    }
  } finally {
    try { await setPushOptIn({ data: { optIn: false } }); } catch { /* ignore */ }
  }
}
