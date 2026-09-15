/**
 * The one place this app sends email from.
 *
 * Every Resend call goes through here so the From address, the API-key check
 * and the error shape live in a single place. Adding a header here adds it to
 * every email the product sends.
 */

/** Sending address for all product email. Not a mailbox — see `replyTo`. */
export const EMAIL_FROM_ADDRESS = "invites@86paper.com";

export type SendEmailArgs = {
  /** Full From header, e.g. `Perlos via 86Paper <invites@86paper.com>`. */
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Where a human reply should land. Omitted when there is nowhere to send it. */
  replyTo?: string;
  /**
   * Console log tag carried over from the pre-consolidation senders, e.g.
   * "staff-invite email" — keeps server logs attributable per email type.
   */
  logLabel?: string;
};

export async function sendResendEmail(
  args: SendEmailArgs,
): Promise<{ ok: boolean; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, error: "RESEND_API_KEY not configured (Resend connector not linked)" };
  const label = args.logLabel ?? "email";

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: args.from,
        to: [args.to],
        subject: args.subject,
        text: args.text,
        html: args.html,
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[${label}] Resend ${resp.status}: ${body}`);
      // Truncated to keep error strings surfacing in toasts readable.
      return { ok: false, error: `Resend ${resp.status}: ${body.slice(0, 400)}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${label}] exception`, msg);
    return { ok: false, error: msg };
  }
}
