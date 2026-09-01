// Server function for delivering applicant-facing notifications (interview
// slot offers, shadow-shift invites, hire signup links) via email (Resend)
// through the Lovable connector gateway. SMS/Twilio was removed — email is
// the sole delivery channel; the caller shows a copyable link fallback.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev";

const payloadSchema = z.object({
  kind: z.enum(["interview_offer", "shadow_invite", "shadow_moved", "shadow_cancelled", "hire_signup"]),
  // shadow_cancelled carries no link; every other kind REQUIRES a valid URL so
  // a CTA can never silently fall back to the marketing homepage.
  link: z.string().url().optional(),
  firstName: z.string().trim().max(120).optional().default(""),
  restaurantName: z.string().trim().max(200).optional().default("our restaurant"),
  email: z.string().trim().email().optional().or(z.literal("").optional()),
  // Kept for backward compat with existing callers; ignored.
  phoneDigits: z.string().regex(/^\d{0,15}$/).optional().default(""),
  slotCount: z.number().int().min(0).max(50).optional(),
  interviewType: z.enum(["phone", "in_person"]).optional(),
  shadowDate: z.string().max(80).optional(),
  shadowTime: z.string().max(80).optional(),
  // Preformatted "Weekday, Mon D" variant for subject lines; body keeps shadowDate.
  shadowDateSubject: z.string().max(80).optional(),
}).superRefine((data, ctx) => {
  if (data.kind !== "shadow_cancelled" && !data.link) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["link"],
      message: `link is required for kind "${data.kind}"`,
    });
  }
});

export type SendResult = {
  email: { attempted: boolean; ok: boolean; error?: string };
};

type Copy = { subject: string; text: string; html: string };

/** Escapes a value for safe interpolation into HTML markup. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
function spellCount(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function ctaButton(link: string, label: string): string {
  const href = esc(link);
  return (
    `<p style="margin:24px 0;"><a href="${href}" style="display:inline-block;background-color:#14532d;color:#ffffff;` +
    `font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:6px;">${esc(label)}</a></p>` +
    `<p style="font-size:12px;color:#6b7280;">Or paste this link into your browser:<br>${href}</p>`
  );
}


function buildCopy(data: z.infer<typeof payloadSchema>): Copy {
  const hi = data.firstName ? `Hi ${data.firstName},` : "Hi,";
  const restaurant = data.restaurantName || "our restaurant";

  if (data.kind === "interview_offer") {
    const count = data.slotCount ?? 0;
    const word = spellCount(count);
    const offerLine =
      count === 1
        ? `We've offered one time — confirm it here if it works for you:`
        : `We've offered ${word} times — pick the one that works for you here:`;
    const formatLine =
      data.interviewType === "in_person"
        ? "This is an in-person interview at the restaurant."
        : data.interviewType === "phone"
          ? "This is a phone interview. They'll call you at the time you pick."
          : "";
    return {
      subject: `Interview with ${restaurant} — pick a time`,
      text:
`${hi}

${restaurant} would like to interview you.${formatLine ? `\n\n${formatLine}` : ""}

${offerLine}
${data.link}

Looking forward to speaking with you.`,
      html:
`<p>${esc(hi)}</p>
<p><strong>${esc(restaurant)}</strong> would like to interview you.</p>
${formatLine ? `<p>${esc(formatLine)}</p>` : ""}
<p>${esc(offerLine)}</p>
${ctaButton(data.link!, "Pick your interview time")}
<p>Looking forward to speaking with you.</p>`,
    };
  }


  if (data.kind === "shadow_invite") {
    const when = [data.shadowDate, data.shadowTime].filter(Boolean).join(" at ");
    const cantMake = `If that time doesn't work, tap "Can't make it" on the same page.`;
    return {
      subject: `Shadow shift at ${restaurant}${data.shadowDateSubject ? ` — ${data.shadowDateSubject}` : ""}`,
      text:
`${hi}

${restaurant} would like to invite you in for a shadow shift${when ? ` on ${when}` : ""}.

Review the details and confirm here:
${data.link}

${cantMake}`,
      html:
`<p>${esc(hi)}</p>
<p><strong>${esc(restaurant)}</strong> would like to invite you in for a shadow shift${when ? ` on <strong>${esc(when)}</strong>` : ""}.</p>
<p>Everything you need — where to come in, who to ask for, and what to wear — is here:</p>
${ctaButton(data.link!, "See the details")}
<p>${esc(cantMake)}</p>`,
    };
  }

  if (data.kind === "shadow_moved") {
    const when = [data.shadowDate, data.shadowTime].filter(Boolean).join(" at ");
    const cantMake = `If that time doesn't work, tap "Can't make it" on the same page.`;
    return {
      subject: `Your shadow shift at ${restaurant} has moved${data.shadowDateSubject ? ` to ${data.shadowDateSubject}` : ""}`,
      text:
`${hi}

Your shadow shift at ${restaurant} has been moved${when ? ` to ${when}` : ""}.

Your earlier confirmation no longer applies. Please confirm the new time here:
${data.link}

${cantMake}`,
      html:
`<p>${esc(hi)}</p>
<p>Your shadow shift at <strong>${esc(restaurant)}</strong> has been moved${when ? ` to <strong>${esc(when)}</strong>` : ""}.</p>
<p>Your earlier confirmation no longer applies. Please confirm the new time:</p>
${ctaButton(data.link!, "Confirm the new time")}
<p>${esc(cantMake)}</p>`,
    };
  }

  if (data.kind === "shadow_cancelled") {
    const when = [data.shadowDate, data.shadowTime].filter(Boolean).join(" at ");
    const line1 = `Your shadow shift at ${restaurant}${when ? ` on ${when}` : ""} has been cancelled.`;
    const line2 = "Nothing else about your application has changed.";
    const line3 = "If a new date is set, you'll get another email from us.";
    return {
      subject: `Your shadow shift at ${restaurant} has been cancelled`,
      text:
`${hi}

${line1} ${line2} ${line3}`,
      html:
`<p>${esc(hi)}</p>
<p>Your shadow shift at <strong>${esc(restaurant)}</strong>${when ? ` on <strong>${esc(when)}</strong>` : ""} has been cancelled.</p>
<p>${esc(line2)}</p>
<p>${esc(line3)}</p>`,
    };
  }


  // hire_signup
  return {
    subject: `Welcome to ${restaurant} — finish setting up your account`,
    text:
`${hi}

Welcome to the team at ${restaurant}! Finish setting up your account here — your personal info, an emergency contact, and confirming your availability:
${data.link}

Excited to have you.`,
    html:
`<p>${esc(hi)}</p>
<p>Welcome to the team at <strong>${esc(restaurant)}</strong>! Finish setting up your account here — your personal info, an emergency contact, and confirming your availability:</p>
${ctaButton(data.link!, "Finish setting up")}
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
