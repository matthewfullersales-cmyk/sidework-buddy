// Server function for delivering applicant-facing notifications (interview
// slot offers, shadow-shift invites, hire signup links) via email (Resend)
// through the Lovable connector gateway. SMS/Twilio was removed — email is
// the sole delivery channel; the caller shows a copyable link fallback.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev";

const payloadSchema = z.object({
  kind: z.enum(["interview_offer", "shadow_invite", "hire_signup"]),
  link: z.string().url(),
  firstName: z.string().trim().max(120).optional().default(""),
  restaurantName: z.string().trim().max(200).optional().default("our restaurant"),
  email: z.string().trim().email().optional().or(z.literal("").optional()),
  // Kept for backward compat with existing callers; ignored.
  phoneDigits: z.string().regex(/^\d{0,15}$/).optional().default(""),
  slotCount: z.number().int().min(0).max(50).optional(),
  shadowDate: z.string().max(80).optional(),
  shadowTime: z.string().max(80).optional(),
});

export type SendResult = {
  email: { attempted: boolean; ok: boolean; error?: string };
};

type Copy = { subject: string; text: string; html: string };

function buildCopy(data: z.infer<typeof payloadSchema>): Copy {
  const hi = data.firstName ? `Hi ${data.firstName},` : "Hi,";
  const restaurant = data.restaurantName || "our restaurant";

  if (data.kind === "interview_offer") {
    const count = data.slotCount ?? 0;
    const slotWord = count === 1 ? "time slot" : "time slots";
    return {
      subject: `Interview with ${restaurant} — pick a time`,
      text:
`${hi}

${restaurant} would like to interview you. We've offered ${count} ${slotWord} — pick one that works for you here:
${data.link}

Looking forward to speaking with you.`,
      html:
`<p>${hi}</p>
<p><strong>${restaurant}</strong> would like to interview you. We've offered ${count} ${slotWord} — pick one that works for you here:</p>
<p><a href="${data.link}">${data.link}</a></p>
<p>Looking forward to speaking with you.</p>`,
    };
  }

  if (data.kind === "shadow_invite") {
    const when = [data.shadowDate, data.shadowTime].filter(Boolean).join(" at ");
    return {
      subject: `Shadow shift at ${restaurant}`,
      text:
`${hi}

${restaurant} would like to invite you in for a shadow shift${when ? ` on ${when}` : ""}.

Review the details and confirm here:
${data.link}

See you soon!`,
      html:
`<p>${hi}</p>
<p><strong>${restaurant}</strong> would like to invite you in for a shadow shift${when ? ` on <strong>${when}</strong>` : ""}.</p>
<p>Review the details and confirm here:<br><a href="${data.link}">${data.link}</a></p>
<p>See you soon!</p>`,
    };
  }

  // hire_signup
  return {
    subject: `Welcome to ${restaurant} — finish setting up your account`,
    text:
`${hi}

Welcome to the team at ${restaurant}! Finish setting up your account and start your training here:
${data.link}

Excited to have you.`,
    html:
`<p>${hi}</p>
<p>Welcome to the team at <strong>${restaurant}</strong>! Finish setting up your account and start your training here:</p>
<p><a href="${data.link}">${data.link}</a></p>
<p>Excited to have you.</p>`,
  };
}

async function sendEmail(to: string, copy: Copy, restaurantName: string): Promise<{ ok: boolean; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey  = process.env.RESEND_API_KEY;
  if (!lovableKey) return { ok: false, error: "LOVABLE_API_KEY not configured" };
  if (!resendKey)  return { ok: false, error: "RESEND_API_KEY not configured" };
  const from = `${restaurantName} via 86Paper <invites@86paper.com>`;
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
        to: [to],
        subject: copy.subject,
        text: copy.text,
        html: copy.html,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[applicant-notify email] Resend ${resp.status}: ${errText}`);
      return { ok: false, error: `Resend ${resp.status}: ${errText.slice(0, 400)}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[applicant-notify email] exception", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Send an applicant-facing notification via email. Failures are captured (not
 * thrown) so the caller can surface a copy-link fallback in the UI.
 */
export const sendApplicantNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => payloadSchema.parse(data))
  .handler(async ({ data }): Promise<SendResult> => {
    const copy = buildCopy(data);
    const email = (data.email ?? "").trim();
    const restaurant = data.restaurantName || "our restaurant";

    const emailRes = email
      ? await sendEmail(email, copy, restaurant)
      : { ok: false, error: "no email" };

    return {
      email: { attempted: !!email, ok: !!email && emailRes.ok, error: emailRes.error },
    };
  });
