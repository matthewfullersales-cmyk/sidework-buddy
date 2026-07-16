// Server function for delivering applicant-facing notifications (interview
// slot offers, shadow-shift invites, hire signup links) over email (Resend)
// and SMS (Twilio) via the Lovable connector gateway.
//
// The Twilio "From" number is hardcoded — it's 86Paper's public business
// number, not sensitive. Each channel reports its own outcome so the caller
// can surface a copyable link fallback if either channel fails (e.g. Twilio
// A2P registration still pending).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev";
const TWILIO_FROM_NUMBER = "+15858448280";

const payloadSchema = z.object({
  kind: z.enum(["interview_offer", "shadow_invite", "hire_signup"]),
  link: z.string().url(),
  firstName: z.string().trim().max(120).optional().default(""),
  restaurantName: z.string().trim().max(200).optional().default("our restaurant"),
  email: z.string().trim().email().optional().or(z.literal("").optional()),
  phoneDigits: z.string().regex(/^\d{0,15}$/).optional().default(""),
  // Optional context that shapes the message body:
  slotCount: z.number().int().min(0).max(50).optional(),
  shadowDate: z.string().max(80).optional(),
  shadowTime: z.string().max(80).optional(),
});

type SendResult = {
  email: { attempted: boolean; ok: boolean; error?: string };
  sms:   { attempted: boolean; ok: boolean; error?: string };
};

type Copy = { subject: string; text: string; html: string; sms: string };

function buildCopy(data: z.infer<typeof payloadSchema>): Copy {
  const hi = data.firstName ? `Hi ${data.firstName},` : "Hi,";
  const restaurant = data.restaurantName || "our restaurant";

  if (data.kind === "interview_offer") {
    const count = data.slotCount ?? 0;
    const slotWord = count === 1 ? "time slot" : "time slots";
    const subject = `Interview with ${restaurant} — pick a time`;
    const body = `${restaurant} would like to interview you. Pick a time that works: ${data.link}`;
    return {
      subject,
      sms: body,
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
    const subject = `Shadow shift at ${restaurant}`;
    const smsWhen = when ? ` on ${when}` : "";
    return {
      subject,
      sms: `${restaurant} invited you to a shadow shift${smsWhen}. Details & confirm: ${data.link}`,
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
  const subject = `Welcome to ${restaurant} — finish setting up your account`;
  return {
    subject,
    sms: `Welcome to ${restaurant}! Finish setting up your account: ${data.link}`,
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

async function sendSms(toDigits: string, copy: Copy): Promise<{ ok: boolean; error?: string; sid?: string; status?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey  = process.env.TWILIO_API_KEY;
  if (!lovableKey) return { ok: false, error: "LOVABLE_API_KEY not configured" };
  if (!twilioKey)  return { ok: false, error: "TWILIO_API_KEY not configured" };
  const digits = toDigits.replace(/\D/g, "");
  if (!digits) return { ok: false, error: "no phone digits" };
  const to = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  try {
    const resp = await fetch(`${GATEWAY_URL}/twilio/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": twilioKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: copy.sms }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error(`[applicant-notify sms] Twilio ${resp.status}: ${text}`);
      return { ok: false, error: `Twilio ${resp.status}: ${text.slice(0, 400)}` };
    }
    // Twilio returns 201 with a Message resource. `status` starts as "queued"
    // for async delivery; carrier/A2P failures show up later. Detect immediate
    // failure and — for accepted messages — poll once briefly to catch fast
    // rejections (e.g. error 30034: US A2P 10DLC unregistered number).
    let body: { sid?: string; status?: string; error_code?: number | null; error_message?: string | null } = {};
    try { body = JSON.parse(text); } catch { /* ignore parse */ }
    if (body.status === "failed" || body.status === "undelivered" || (body.error_code && body.error_code !== 0)) {
      const errMsg = `Twilio ${body.status ?? "failed"} (code ${body.error_code}): ${body.error_message ?? "carrier rejected"}`;
      console.error(`[applicant-notify sms] ${errMsg}`);
      return { ok: false, error: errMsg, sid: body.sid, status: body.status };
    }
    if (body.sid) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const poll = await fetch(`${GATEWAY_URL}/twilio/Messages/${body.sid}.json`, {
          headers: { "Authorization": `Bearer ${lovableKey}`, "X-Connection-Api-Key": twilioKey },
        });
        if (poll.ok) {
          const pj = await poll.json() as { status?: string; error_code?: number | null; error_message?: string | null };
          if (pj.status === "failed" || pj.status === "undelivered" || (pj.error_code && pj.error_code !== 0)) {
            const errMsg = `Twilio ${pj.status} (code ${pj.error_code}): ${pj.error_message ?? "carrier rejected"}`;
            console.error(`[applicant-notify sms] ${errMsg} sid=${body.sid}`);
            return { ok: false, error: errMsg, sid: body.sid, status: pj.status };
          }
          return { ok: true, sid: body.sid, status: pj.status };
        }
      } catch (e) {
        console.warn("[applicant-notify sms] poll failed", e);
      }
    }
    return { ok: true, sid: body.sid, status: body.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[applicant-notify sms] exception", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Send an applicant-facing notification via email + SMS in parallel. Failures
 * on either channel are captured (not thrown) so the caller can surface a
 * copy-link fallback in the UI.
 */
export const sendApplicantNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => payloadSchema.parse(data))
  .handler(async ({ data }): Promise<SendResult> => {
    const copy = buildCopy(data);
    const email = (data.email ?? "").trim();
    const phone = (data.phoneDigits ?? "").trim();
    const restaurant = data.restaurantName || "our restaurant";

    const [emailRes, smsRes] = await Promise.all([
      email
        ? sendEmail(email, copy, restaurant)
        : Promise.resolve({ ok: false, error: "no email" } as const),
      phone
        ? sendSms(phone, copy)
        : Promise.resolve({ ok: false, error: "no phone" } as const),
    ]);

    return {
      email: { attempted: !!email, ok: !!email && emailRes.ok, error: emailRes.error },
      sms:   { attempted: !!phone, ok: !!phone && smsRes.ok,   error: smsRes.error },
    };
  });
