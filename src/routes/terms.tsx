import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/sidework/Logo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — 86Paper" },
      { name: "description", content: "86Paper Terms of Service — the rules and guidelines for using our platform." },
      { property: "og:title", content: "Terms of Service — 86Paper" },
      { property: "og:description", content: "86Paper Terms of Service — the rules and guidelines for using our platform." },
    ],
    links: [{ rel: "canonical", href: "https://86paper.com/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
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
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mb-4">Last updated: July 2026</p>

          <p className="mt-6 mb-4 leading-relaxed">
            These Terms of Service govern your use of the 86Paper platform, operated by 86Paper LLC ("86Paper," "we," "us").
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Use of the Platform</h2>
          <p className="mb-4 leading-relaxed">
            86Paper provides software to help restaurant owners and managers with scheduling, hiring, and team communication. By using the platform, you agree to these terms.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Push Notifications</h2>
          <p className="mb-4 leading-relaxed">
            By enabling notifications, you consent to receive browser push notifications from 86Paper about work schedules, shift-trade availability, and time-off decisions. You may opt out at any time from your profile settings, your browser's site permissions, or by uninstalling the app. Delivery depends on your device, browser, and network; 86Paper is not liable for delayed or undelivered notifications. Interview, shadow-shift, and new-hire invitations are delivered by email; 86Paper does not send SMS/text messages.
          </p>


          <h2 className="mt-10 text-xl font-semibold tracking-tight">Accounts</h2>
          <p className="mb-4 leading-relaxed">
            You are responsible for maintaining accurate information in your profile, including your contact information.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Acceptable Use</h2>
          <p className="mb-4 leading-relaxed">
            You agree to use the platform only for its intended purpose of workforce scheduling and hiring management, and not to misuse, disrupt, or attempt to gain unauthorized access to the platform.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Disclaimer of Warranties</h2>
          <p className="mb-4 leading-relaxed">
            The platform is provided "as is" without warranties of any kind.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Limitation of Liability</h2>
          <p className="mb-4 leading-relaxed">
            To the fullest extent permitted by law, 86Paper LLC shall not be liable for indirect, incidental, or consequential damages arising from use of the platform.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Changes to These Terms</h2>
          <p className="mb-4 leading-relaxed">
            We may update these terms from time to time. Continued use of the platform constitutes acceptance of any changes.
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
