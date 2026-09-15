import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/sidework/Logo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — 86Paper" },
      { name: "description", content: "86Paper Terms of Service — subscription, billing, cancellation, and how responsibility for hiring and labor law is allocated." },
      { property: "og:title", content: "Terms of Service — 86Paper" },
      { property: "og:description", content: "86Paper Terms of Service — subscription, billing, cancellation, and how responsibility for hiring and labor law is allocated." },
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
          <p className="text-sm text-muted-foreground mb-4">Last updated: September 2026</p>

          <p className="mt-6 mb-4 leading-relaxed">
            These Terms of Service govern your use of the 86Paper platform, operated by 86Paper LLC ("86Paper," "we," "us"). By subscribing to or using the platform, you agree to them.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Who these terms are between</h2>
          <p className="mb-4 leading-relaxed">
            These Terms are an agreement between 86Paper and the restaurant or business that subscribes to the platform ("you," "Customer").
          </p>
          <p className="mb-4 leading-relaxed">
            Your managers, staff and applicants may hold individual accounts on 86Paper. Those accounts are free and exist because you invited the person or posted a job they applied to. They do not create a separate subscription, and the relationship between you and those people, including their employment, is yours alone.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">What 86Paper is, and what it is not</h2>
          <p className="mb-4 leading-relaxed">
            86Paper is software for running restaurant hiring and scheduling: posting a job, collecting applications, booking interviews, scheduling shadow shifts, hiring, and building and sharing the schedule.
          </p>
          <p className="mb-4 leading-relaxed">
            86Paper is not a time clock, a timekeeping system, a payroll provider, a point-of-sale system, or an HR or legal advisory service. Nothing in the platform or in any communication from us is legal, tax, employment or accounting advice.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Your account</h2>
          <p className="mb-4 leading-relaxed">
            You are responsible for keeping your account information accurate, for controlling who in your business has manager access, and for everything done through accounts you create or approve. Tell us promptly if you believe an account has been used without your permission.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Subscription and fees</h2>
          <p className="mb-4 leading-relaxed">
            86Paper is sold as a monthly subscription at $99 per restaurant location, in US dollars, charged in advance. One subscription covers one restaurant at one address, with no limit on the number of staff, managers or applicants.
          </p>
          <p className="mb-4 leading-relaxed">
            Payments are processed by Stripe. You provide your payment details directly to Stripe, and 86Paper never receives or stores your full card number. Fees are exclusive of any applicable taxes, which are added where required.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Automatic renewal and price changes</h2>
          <p className="mb-4 leading-relaxed">
            Your subscription renews automatically each month on the anniversary of the day you subscribed, and continues until you cancel. Each renewal is charged to the payment method on file.
          </p>
          <p className="mb-4 leading-relaxed">
            We may change the subscription price. If we do, we will email you at least 30 days beforehand, and the new price takes effect at your next renewal. If you do not want to continue at the new price, you can cancel before it takes effect.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Cancellation and refunds</h2>
          <p className="mb-4 leading-relaxed">
            You can cancel at any time from the Billing section of your Settings, without contacting us and without giving a reason. Cancelling takes effect at the end of the period you have already paid for. You keep full access until then, and you are not charged again.
          </p>
          <p className="mb-4 leading-relaxed">
            Fees already paid are non-refundable, and we do not refund partial months.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Failed payments</h2>
          <p className="mb-4 leading-relaxed">
            If a payment fails, we will retry it and email you. If the subscription remains unpaid after 14 days, we may suspend access to the manager dashboard until it is settled. Suspension is not deletion: your data remains, and access is restored as soon as payment goes through.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Your data and your people's data</h2>
          <p className="mb-4 leading-relaxed">
            Everything you and your staff put into 86Paper, including applicant records, schedules, availability and contact details, belongs to you. We store and process it in order to provide the service to you. We do not sell it and we do not use it to advertise to anyone.
          </p>
          <p className="mb-4 leading-relaxed">
            Because that information is about real people who applied to or work for your restaurant, you are responsible for collecting and using it lawfully, including any notice or consent your jurisdiction requires, and for responding to requests from your own applicants and employees about their records.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Hiring decisions are yours</h2>
          <p className="mb-4 leading-relaxed">
            86Paper records and organizes your hiring process. It does not screen, score, rank, filter or recommend candidates, and it does not make or influence hiring decisions. Every decision about who to interview, who to bring in and who to hire is made by you.
          </p>
          <p className="mb-4 leading-relaxed">
            You are responsible for complying with employment and anti-discrimination law in your jurisdiction, including equal opportunity requirements and any restrictions on what you may ask an applicant.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Shadow shifts</h2>
          <p className="mb-4 leading-relaxed">
            86Paper lets you schedule a shadow shift and send the details to a candidate. It takes no position on whether that time is compensable working time, and scheduling one is not a determination that it is paid or unpaid.
          </p>
          <p className="mb-4 leading-relaxed">
            Whether a person must be paid for time spent at your restaurant, and at what rate, is governed by federal and state wage and hour law and is entirely your responsibility as the employer.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Scheduled hours are an estimate</h2>
          <p className="mb-4 leading-relaxed">
            Where 86Paper shows the number of hours a person is scheduled for in a week, that figure is calculated from the shifts on the schedule. It is not a record of hours worked. Shifts run long and people stay late, and 86Paper does not know about any of it.
          </p>
          <p className="mb-4 leading-relaxed">
            You remain responsible for recording actual hours worked and for complying with overtime, break and wage law. Any warning the platform shows about approaching overtime is a convenience based on scheduled time only, and is not a compliance check.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Employing minors</h2>
          <p className="mb-4 leading-relaxed">
            Restaurants often employ people under 18. 86Paper does not verify anyone's age and does not apply any restriction based on it. Compliance with child labor law, including hour limits, permitted tasks and working papers, is your responsibility.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Communications</h2>
          <p className="mb-4 leading-relaxed">
            By enabling notifications, you consent to receive browser push notifications from 86Paper about work schedules, shift-trade availability, and time-off decisions. You may opt out at any time from your profile settings, your browser's site permissions, or by uninstalling the app.
          </p>
          <p className="mb-4 leading-relaxed">
            Interview, shadow-shift and new-hire invitations are delivered by email. 86Paper does not send SMS or text messages. Delivery depends on your device, browser, email provider and network, and 86Paper is not liable for delayed or undelivered messages. We may also email you about your account, billing, and material changes to the service; these are not marketing messages and you cannot opt out of them while you hold an account.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Acceptable use</h2>
          <p className="mb-4 leading-relaxed">
            You agree to use the platform only for its intended purpose of restaurant hiring and workforce scheduling, and not to misuse it, disrupt it, attempt to gain unauthorized access to it, resell access to it, or use it to store information unrelated to running your restaurant.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Our intellectual property</h2>
          <p className="mb-4 leading-relaxed">
            86Paper, including the software, its design and its content, belongs to 86Paper LLC. Your subscription grants you a limited, non-exclusive, non-transferable right to use it while your subscription is active, and nothing more.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Availability of the service</h2>
          <p className="mb-4 leading-relaxed">
            We work to keep 86Paper available, but we do not promise any particular level of uptime, and we may take the service down for maintenance or updates. We may change or discontinue features.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Disclaimer of warranties</h2>
          <p className="mb-4 leading-relaxed">
            The platform is provided "as is" and "as available," without warranties of any kind, express or implied, including any warranty of merchantability, fitness for a particular purpose, or accuracy. We do not warrant that the platform will be uninterrupted or error-free.
          </p>
          <p className="mb-4 leading-relaxed">
            86Paper acts on the information you and your staff enter. We have no obligation to verify its accuracy, and we disclaim liability arising from information that is inaccurate or incomplete.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Your indemnity</h2>
          <p className="mb-4 leading-relaxed">
            You agree to indemnify and hold 86Paper LLC harmless from claims, losses and costs arising out of your use of the platform, the information you put into it, your employment decisions, or your failure to comply with employment, wage and hour, or data protection law.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Limitation of liability</h2>
          <p className="mb-4 leading-relaxed">
            To the fullest extent permitted by law, 86Paper's total liability arising out of or relating to the platform is limited to the amount you paid us in the twelve months before the event giving rise to the claim.
          </p>
          <p className="mb-4 leading-relaxed">
            We are not liable for indirect, incidental, special or consequential damages, including lost profits, lost business, lost data, or costs arising from a shift that was not covered or a message that was not delivered.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Suspension and termination</h2>
          <p className="mb-4 leading-relaxed">
            We may suspend or close an account that is unpaid, that is being used unlawfully, or that is being used in a way that harms the platform or other users. Except where the law or an immediate risk requires otherwise, we will email you first and give you a reasonable chance to put it right.
          </p>
          <p className="mb-4 leading-relaxed">
            You may stop using 86Paper at any time by cancelling your subscription.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">What happens to your data when you leave</h2>
          <p className="mb-4 leading-relaxed">
            After your subscription ends, you may request a copy of your data for 30 days by emailing hello@86paper.com. We delete your data within 90 days of the subscription ending, except where we are required to keep records for longer.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Changes to these terms</h2>
          <p className="mb-4 leading-relaxed">
            We may update these Terms. If a change materially affects your rights, and in particular anything about billing, renewal or cancellation, we will email you before it takes effect. Continuing to use 86Paper after that means you accept the change.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Governing law</h2>
          <p className="mb-4 leading-relaxed">
            These Terms are governed by the laws of the State of New York, without regard to its conflict of laws rules. Any dispute will be brought in the state or federal courts located in Monroe County, New York, and both parties consent to that jurisdiction.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Contact us</h2>
          <p className="mb-4 leading-relaxed">
            86Paper LLC
            <br />
            233 Devonshire Dr, Rochester, NY 14625
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
