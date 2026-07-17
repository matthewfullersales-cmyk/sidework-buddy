import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/sidework/Logo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — 86Paper" },
      { name: "description", content: "86Paper Privacy Policy — how we collect, use, and protect your information." },
      { property: "og:title", content: "Privacy Policy — 86Paper" },
      { property: "og:description", content: "86Paper Privacy Policy — how we collect, use, and protect your information." },
    ],
    links: [{ rel: "canonical", href: "https://sidework-buddy.lovable.app/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <Logo />
        </Link>
        <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Back to home
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-4">
        <article className="text-foreground">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-4">Last updated: July 2026</p>

          <p className="mt-6 mb-4 leading-relaxed">
            86Paper LLC ("86Paper," "we," "us") provides workforce management software for restaurants. This policy explains how we collect, use, and protect information from restaurant owners, managers, and employees who use our platform.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Information We Collect</h2>
          <p className="mb-4 leading-relaxed">
            We collect information you provide directly, including name, phone number, email address, and employment-related information (schedules, availability, role, and application materials) submitted through the 86Paper platform.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Push Notifications</h2>
          <p className="mb-4 leading-relaxed">
            With your consent, we deliver browser push notifications to your device for purposes including: new schedule publications, schedule change alerts, open shift/trade board availability, and time-off request decisions. To deliver push notifications we store your browser's push subscription (endpoint URL and encryption keys) so your device's push service can reach you. You may opt out at any time by turning notifications off in your profile settings, revoking notification permission for this site in your browser, or uninstalling the app from your device. 86Paper does not send marketing push notifications.
          </p>
          <p className="mb-4 leading-relaxed">
            Interview invitations, shadow-shift invitations, and new-hire signup links are delivered by email — 86Paper no longer sends any SMS/text messages.
          </p>


          <h2 className="mt-10 text-xl font-semibold tracking-tight">How We Use Information</h2>
          <p className="mb-4 leading-relaxed">
            We use collected information to operate the scheduling and hiring features of the platform, communicate with you about your employment or application status, and improve our services.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Data Sharing</h2>
          <p className="mb-4 leading-relaxed">
            We do not sell personal information. We may share information with service providers who help us operate the platform (such as messaging and email delivery providers), solely to provide our services to you.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Data Retention</h2>
          <p className="mb-4 leading-relaxed">
            We retain information for as long as necessary to provide our services and comply with legal obligations.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Your Choices</h2>
          <p className="mb-4 leading-relaxed">
            You can opt out of SMS notifications at any time. You can request access to, correction of, or deletion of your personal information by contacting us at hello@86paper.com.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Contact Us</h2>
          <p className="mb-4 leading-relaxed">
            86Paper LLC
            <br />
            <a href="mailto:hello@86paper.com" className="text-primary hover:underline">
              hello@86paper.com
            </a>
          </p>
        </article>
      </main>
    </div>
  );
}
