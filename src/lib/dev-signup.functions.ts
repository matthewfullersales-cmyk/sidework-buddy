import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  restaurantName: z.string().trim().min(1).max(120),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

export const devSignupEnabled = createServerFn({ method: "GET" }).handler(async () => {
  return { enabled: process.env["DEV_SIGNUP_ENABLED"] === "true" };
});

export const devSignup = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const notAvailable = () => new Error("Not available");

    if (process.env["DEV_SIGNUP_ENABLED"] !== "true") throw notAvailable();

    // Allowlist lives server-side only (never in the client bundle).
    const email = data.email.trim().toLowerCase();
    const allowed = /^matt86paper(\+[^@\s]+)?@gmail\.com$/.test(email);
    if (!allowed) throw notAvailable();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const fullName = `${data.firstName.trim()} ${data.lastName.trim()}`.trim();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        restaurant_name: data.restaurantName.trim(),
        role: "owner",
      },
    });
    if (error || !created.user) {
      throw new Error(error?.message ?? "Could not create account");
    }

    // The on_auth_user_created trigger creates the profile row; mark it paid.
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ subscription_status: "active" })
      .eq("id", created.user.id);
    if (updateError) throw new Error(updateError.message);

    return { ok: true as const };
  });
