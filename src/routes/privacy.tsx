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

          <h2 className="mt-10 text-xl font-semibold tracking-tight">SMS/Text Messaging</h2>
          <p className="mb-4 leading-relaxed">
            With your consent, we send text messages to the phone number on file for purposes including: interview scheduling, work schedule notifications, schedule change alerts, and open shift availability alerts. Message frequency varies based on your role and activity. Message and data rates may apply. You may opt out of SMS notifications at any time by replying STOP to any message, or by disabling notifications in your account settings. Reply HELP for assistance.
          </p>
          <p className="mb-4 leading-relaxed">
            We do not sell or share your mobile phone number or SMS opt-in status with third parties for their marketing purposes. Your phone number is used solely to deliver the notifications described above.
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
