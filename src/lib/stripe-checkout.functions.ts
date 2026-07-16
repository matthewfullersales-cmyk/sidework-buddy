import { createServerFn } from "@tanstack/react-start";

const PRICE_IDS: Record<string, string> = {
  starter: "price_1TtwjfJlcbyvYgFpijY3cglh",
  growth: "price_1TtwjgJlcbyvYgFpCEc30ek6",
};

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((input: { plan: "starter" | "growth"; origin: string }) => {
    if (!PRICE_IDS[input.plan]) throw new Error("Invalid plan");
    if (!input.origin || !/^https?:\/\//.test(input.origin))
      throw new Error("Invalid origin");
    return input;
  })
  .handler(async ({ data }) => {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error("Stripe not configured");

    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": PRICE_IDS[data.plan],
      "line_items[0][quantity]": "1",
      success_url: `${data.origin}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${data.origin}/pricing`,
      allow_promotion_codes: "true",
    });

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
