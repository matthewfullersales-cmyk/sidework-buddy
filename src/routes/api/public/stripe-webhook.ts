import { createFileRoute } from "@tanstack/react-router";

// Stripe webhook. Configure the endpoint URL in the Stripe dashboard
// (Developers → Webhooks) pointing at `/api/public/stripe-webhook`, subscribe
// to: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted, invoice.payment_failed. Copy the signing
// secret into project secrets as STRIPE_WEBHOOK_SECRET.

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!signingSecret) {
          console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set");
          return new Response("Webhook not configured", { status: 500 });
        }
        const sigHeader = request.headers.get("stripe-signature");
        if (!sigHeader) return new Response("Missing signature", { status: 400 });

        const rawBody = await request.text();
        const verified = await verifyStripeSignature(rawBody, sigHeader, signingSecret);
        if (!verified) return new Response("Invalid signature", { status: 400 });

        let event: StripeEvent;
        try {
          event = JSON.parse(rawBody) as StripeEvent;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          switch (event.type) {
            case "checkout.session.completed": {
              const s = event.data.object as StripeCheckoutSession;
              const userId = s.client_reference_id ?? s.metadata?.user_id;
              if (!userId) {
                console.warn("[stripe-webhook] checkout.session.completed with no user_id");
                break;
              }
              await supabaseAdmin
                .from("profiles")
                .update({
                  subscription_status: "active",
                  stripe_customer_id: (s.customer as string) ?? null,
                  stripe_subscription_id: (s.subscription as string) ?? null,
                })
                .eq("id", userId);
              break;
            }
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
              const sub = event.data.object as StripeSubscription;
              const userId = sub.metadata?.user_id;
              const status = mapSubStatus(sub.status, event.type === "customer.subscription.deleted");
              const periodEnd = sub.current_period_end
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null;
              const patch = {
                subscription_status: status,
                stripe_subscription_id: sub.id,
                stripe_customer_id: (sub.customer as string) ?? null,
                subscription_current_period_end: periodEnd,
              };
              if (userId) {
                await supabaseAdmin.from("profiles").update(patch).eq("id", userId);
              } else if (sub.customer) {
                await supabaseAdmin
                  .from("profiles")
                  .update(patch)
                  .eq("stripe_customer_id", sub.customer as string);
              }
              break;
            }
            case "invoice.payment_failed": {
              const inv = event.data.object as { customer?: string };
              if (inv.customer) {
                await supabaseAdmin
                  .from("profiles")
                  .update({ subscription_status: "past_due" })
                  .eq("stripe_customer_id", inv.customer);
              }
              break;
            }
            default:
              // ignore
              break;
          }
        } catch (err) {
          console.error("[stripe-webhook] handler error", err);
          return new Response("Handler error", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});

function mapSubStatus(stripeStatus: string, deleted: boolean): string {
  if (deleted) return "canceled";
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") return "past_due";
  if (stripeStatus === "canceled") return "canceled";
  return "inactive";
}

// --- Stripe signature verification (t=..,v1=..) ---------------------------
async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const idx = kv.indexOf("=");
      return [kv.slice(0, idx), kv.slice(idx + 1)];
    }),
  );
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqualHex(expected, v1);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// --- Minimal Stripe event shapes -----------------------------------------
type StripeEvent = {
  type: string;
  data: { object: unknown };
};
type StripeCheckoutSession = {
  client_reference_id?: string | null;
  metadata?: Record<string, string | undefined>;
  customer?: string | null;
  subscription?: string | null;
};
type StripeSubscription = {
  id: string;
  status: string;
  customer?: string | null;
  current_period_end?: number | null;
  metadata?: Record<string, string | undefined>;
};
