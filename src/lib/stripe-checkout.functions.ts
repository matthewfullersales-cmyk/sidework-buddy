import { createServerFn } from "@tanstack/react-start";

// Self-serve plans (live mode).
const PLAN_PRICE_IDS = {
  starter: "price_1TzJywR8oYiccj05nLgcRWRx", // Starter $49/mo
  growth: "price_1TzK6vR8oYiccj052xSHe0PG", // Growth $99/mo
} as const;

type Plan = keyof typeof PLAN_PRICE_IDS;

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      origin: string;
      plan: Plan;
      userId?: string;
      email?: string;
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
  .handler(async ({ data }) => {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error("Stripe not configured");

    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": PRICE_ID,
      "line_items[0][quantity]": "1",
      success_url: `${data.origin}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${data.origin}/pricing`,
      allow_promotion_codes: "true",
    });
    if (data.userId) {
      body.set("client_reference_id", data.userId);
      body.set("metadata[user_id]", data.userId);
      body.set("subscription_data[metadata][user_id]", data.userId);
    }
    if (data.email) body.set("customer_email", data.email);

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
