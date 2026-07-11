// Server functions for delivering staff invites over email (Resend) and SMS (Twilio).
// Both channels go through the Lovable connector gateway using the workspace
// connections linked to this project. Failures on either channel are logged
// and returned per-channel so the client can surface a fallback (copy link).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev";

const payloadSchema = z.object({
  inviteUrl: z.string().url(),
  firstName: z.string().trim().max(120).optional().default(""),
  restaurantName: z.string().trim().max(200).optional().default("your team"),
  email: z.string().trim().email().optional().or(z.literal("").optional()),
  phoneDigits: z.string().regex(/^\d{0,15}$/).optional().default(""),
  senderName: z.string().trim().max(120).optional().default("86Paper"),
});

type SendResult = {
  email: { attempted: boolean; ok: boolean; error?: string };
  sms:   { attempted: boolean; ok: boolean; error?: string };
};

function buildBody(firstName: string, restaurantName: string, inviteUrl: string) {
  const hi = firstName ? `Hi ${firstName},` : "Hi,";
  return {
    text:
`${hi}

You've been added to the team at ${restaurantName} on 86Paper.

Finish setting up your account here:
${inviteUrl}

If you weren't expecting this, you can ignore this message.`,
    html:
`<p>${hi}</p>
<p>You've been added to the team at <strong>${restaurantName}</strong> on 86Paper.</p>
<p>Finish setting up your account here:<br>
<a href="${inviteUrl}">${inviteUrl}</a></p>
<p style="color:#888;font-size:12px">If you weren't expecting this, you can ignore this message.</p>`,
    sms: `${restaurantName} added you on 86Paper. Finish setup: ${inviteUrl}`,
  };
}

async function sendEmailViaResend(args: {
  to: string; firstName: string; restaurantName: string; inviteUrl: string; senderName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey  = process.env.RESEND_API_KEY;
  if (!lovableKey) return { ok: false, error: "LOVABLE_API_KEY not configured" };
  if (!resendKey)  return { ok: false, error: "RESEND_API_KEY not configured (Resend connector not linked)" };

  const body = buildBody(args.firstName, args.restaurantName, args.inviteUrl);
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
        subject: `You're invited to ${args.restaurantName} on 86Paper`,
        text: body.text,
        html: body.html,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[staff-invite email] Resend ${resp.status}: ${errText}`);
      return { ok: false, error: `Resend ${resp.status}: ${errText.slice(0, 400)}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[staff-invite email] exception", msg);
    return { ok: false, error: msg };
  }
}

async function sendSmsViaTwilio(args: {
  toDigits: string; firstName: string; restaurantName: string; inviteUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey  = process.env.TWILIO_API_KEY;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!lovableKey) return { ok: false, error: "LOVABLE_API_KEY not configured" };
  if (!twilioKey)  return { ok: false, error: "TWILIO_API_KEY not configured" };
  if (!fromNumber) return { ok: false, error: "TWILIO_FROM_NUMBER not configured (add your Twilio number in Project Settings → Secrets)" };

  const body = buildBody(args.firstName, args.restaurantName, args.inviteUrl);
  const digits = args.toDigits.replace(/\D/g, "");
  const to = digits.length === 10 ? `+1${digits}` : `+${digits}`;

  try {
    const resp = await fetch(`${GATEWAY_URL}/twilio/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": twilioKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: fromNumber, Body: body.sms }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[staff-invite sms] Twilio ${resp.status}: ${errText}`);
      return { ok: false, error: `Twilio ${resp.status}: ${errText.slice(0, 400)}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[staff-invite sms] exception", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Fire the invite via email and/or SMS in parallel. Only owners (authenticated
 * users) can call this. Each channel reports its own outcome so the caller can
 * still surface a copyable link as a backup for whichever channel didn't land.
 */
export const sendStaffInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => payloadSchema.parse(data))
  .handler(async ({ data }): Promise<SendResult> => {
    const email = (data.email ?? "").trim();
    const phone = (data.phoneDigits ?? "").trim();

    const [emailRes, smsRes] = await Promise.all([
      email
        ? sendEmailViaResend({
            to: email,
            firstName: data.firstName ?? "",
            restaurantName: data.restaurantName ?? "your team",
            inviteUrl: data.inviteUrl,
            senderName: data.senderName ?? "86Paper",
          })
        : Promise.resolve({ ok: false, error: "no email" } as const),
      phone
        ? sendSmsViaTwilio({
            toDigits: phone,
            firstName: data.firstName ?? "",
            restaurantName: data.restaurantName ?? "your team",
            inviteUrl: data.inviteUrl,
          })
        : Promise.resolve({ ok: false, error: "no phone" } as const),
    ]);

    return {
      email: { attempted: !!email, ok: !!email && emailRes.ok, error: emailRes.error },
      sms:   { attempted: !!phone, ok: !!phone && smsRes.ok,   error: smsRes.error },
    };
  });
