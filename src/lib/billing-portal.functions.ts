import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { origin: string }) => {
    if (!input.origin || !/^https?:\/\//.test(input.origin))
      throw new Error("Invalid origin");
    return input;
  })
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("You must be signed in to manage billing");

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error("Stripe not configured");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error("[billing-portal] profile lookup failed", error);
      throw new Error("Couldn't open billing. Please try again.");
    }
    const customerId = row?.stripe_customer_id;
    if (!customerId)
      throw new Error(
        "No billing account is attached to this restaurant yet. If you think that's wrong, email hello@86paper.com.",
      );

    const body = new URLSearchParams({
      customer: customerId,
      return_url: `${data.origin}/manager`,
    });

    const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const json = (await res.json()) as { url?: string; error?: { message?: string } };
    if (!res.ok || !json.url) {
      console.error("[billing-portal] stripe error", json.error);
      throw new Error(json.error?.message ?? "Couldn't open billing. Please try again.");
    }
    return { url: json.url };
  });