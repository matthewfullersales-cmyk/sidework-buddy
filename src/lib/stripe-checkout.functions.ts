import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Single self-serve plan (live mode): $99/month founding rate.
// $149 is copy-only — there is no Stripe price object for it.
const FOUNDING_PRICE_ID = "price_1TzK6vR8oYiccj052xSHe0PG"; // $99/mo

type Plan = "growth";

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      origin: string;
      plan: Plan;
    }) => {
      if (!input.origin || !/^https?:\/\//.test(input.origin))
        throw new Error("Invalid origin");
      if (!input.plan || !(input.plan in PLAN_PRICE_IDS))
        throw new Error(
          `Invalid plan: expected "starter" or "growth", got "${String(input.plan)}"`,
        );
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const email =
      typeof context.claims.email === "string" ? context.claims.email : undefined;
    if (!userId) throw new Error("You must be signed in to start checkout");

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error("Stripe not configured");

    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": PLAN_PRICE_IDS[data.plan],
      "line_items[0][quantity]": "1",
      success_url: `${data.origin}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${data.origin}/pricing`,
      allow_promotion_codes: "true",
    });
    body.set("client_reference_id", userId);
    body.set("metadata[user_id]", userId);
    body.set("subscription_data[metadata][user_id]", userId);
    if (email) body.set("customer_email", email);


    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const json = (await res.json()) as { url?: string; error?: { message?: string } };
    if (!res.ok || !json.url) {
      throw new Error(json.error?.message ?? "Failed to create checkout session");
    }
    return { url: json.url };
  });
