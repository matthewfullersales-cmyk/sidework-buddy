// Server function for the "welcome back" email sent when a manager reactivates
// an archived employee. Mirrors staff-invite.functions.ts exactly in structure;
// delivered via email (Resend) through the Lovable connector gateway.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev";

const payloadSchema = z.object({
  signInUrl: z.string().url(),
  firstName: z.string().trim().max(120).optional().default(""),
  // No fake placeholder: empty means "no name", and the copy falls back to
  // generic wording that never renders "your team" as if it were a name.
  restaurantName: z.string().trim().max(200).optional().default(""),
  email: z.string().trim().email().optional().or(z.literal("").optional()),
  senderName: z.string().trim().max(120).optional().default("86Paper"),
});

export type SendResult = {
  email: { attempted: boolean; ok: boolean; error?: string };
};

/** Escape interpolated values before injecting them into the HTML body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildBody(firstName: string, restaurantName: string, signInUrl: string) {
  const hasName = restaurantName.length > 0;
  const hi = firstName ? `Hi ${firstName},` : "Hi,";
  const addedLine = hasName
    ? `You've been added back to the team at ${restaurantName}.`
    : `You've been added back to the team.`;

  const text =
`${hi}

${addedLine}

Sign in to see your schedule:
${signInUrl}

If you weren't expecting this, you can ignore this message.`;

  const hiHtml = escapeHtml(hi);
  const addedHtml = escapeHtml(addedLine);
  const urlHtml = escapeHtml(signInUrl);
  const buttonStyle =
    "display:inline-block;background-color:#14532d;color:#ffffff;font-size:14px;" +
    "padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;";
  const html =
`<p>${hiHtml}</p>
<p>${addedHtml}</p>
<p>Sign in to see your schedule.</p>
<p style="text-align:center;margin:28px 0;">
  <a href="${urlHtml}" style="${buttonStyle}">Sign in</a>
</p>
<p style="color:#888;font-size:12px;word-break:break-all;">${urlHtml}</p>
<p style="color:#888;font-size:12px">If you weren't expecting this, you can ignore this message.</p>`;

  return { text, html };
}

async function sendEmailViaResend(args: {
  to: string; firstName: string; restaurantName: string; signInUrl: string; senderName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey  = process.env.RESEND_API_KEY;
  if (!lovableKey) return { ok: false, error: "LOVABLE_API_KEY not configured" };
  if (!resendKey)  return { ok: false, error: "RESEND_API_KEY not configured (Resend connector not linked)" };

  const body = buildBody(args.firstName, args.restaurantName, args.signInUrl);
  const from = `${args.senderName} <invites@86paper.com>`;

  try {
    const resp = await fetch(`${GATEWAY_URL}/resend/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.restaurantName
          ? `You're back on the schedule at ${args.restaurantName}`
          : `You're back on the schedule`,
        text: body.text,
        html: body.html,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[reactivation email] Resend ${resp.status}: ${errText}`);
      return { ok: false, error: `Resend ${resp.status}: ${errText.slice(0, 400)}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reactivation email] exception", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Send a reactivation ("welcome back") email. Owner-only. Returns per-channel
 * outcome so the caller can surface a warning when email fails.
 */
export const sendReactivationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => payloadSchema.parse(data))
  .handler(async ({ data }): Promise<SendResult> => {
    const email = (data.email ?? "").trim();
    const emailRes = email
      ? await sendEmailViaResend({
          to: email,
          firstName: data.firstName ?? "",
          restaurantName: (data.restaurantName ?? "").trim(),
          signInUrl: data.signInUrl,
          senderName: (data.senderName ?? "").trim() || "86Paper",
        })
      : { ok: false, error: "no email" };

    return {
      email: { attempted: !!email, ok: !!email && emailRes.ok, error: emailRes.error },
    };
  });
