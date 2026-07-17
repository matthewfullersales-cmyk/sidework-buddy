// Web push sender. Uses the `web-push` npm package (Node-only bits are pulled
// in by node compat). Only imported dynamically from server function handlers,
// never from client-reachable modules. The .server.ts filename enforces that.
import webpush from "web-push";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || "mailto:hello@86paper.com";
  if (!pub || !priv) throw new Error("VAPID keys not configured");
  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

export type PushSub = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Send `payload` to each subscription. Returns list of endpoint ids that
 * responded 404/410 (Gone) — caller should delete those.
 */
export async function sendPushToAll(
  subs: PushSub[],
  payload: PushPayload,
): Promise<{ deadIds: string[] }> {
  if (subs.length === 0) return { deadIds: [] };
  ensureConfigured();
  const body = JSON.stringify(payload);
  const deadIds: string[] = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: 60 * 60 * 24 },
      );
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        deadIds.push(s.id);
      } else {
        console.error("[push send]", s.endpoint.slice(0, 60), status, (e as Error).message);
      }
    }
  }));
  return { deadIds };
}
