import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/sidework/Logo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — 86Paper" },
      { name: "description", content: "86Paper Privacy Policy — what we collect from restaurants, applicants and staff, who controls it, and how long we keep it." },
      { property: "og:title", content: "Privacy Policy — 86Paper" },
      { property: "og:description", content: "86Paper Privacy Policy — what we collect from restaurants, applicants and staff, who controls it, and how long we keep it." },
    ],
    links: [{ rel: "canonical", href: "https://86paper.com/privacy" }],
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
          <p className="text-sm text-muted-foreground mb-4">Last updated: September 2026</p>

          <p className="mt-6 mb-4 leading-relaxed">
            86Paper LLC ("86Paper," "we," "us") makes hiring and scheduling software for restaurants. This policy explains what information the platform holds, who controls it, and what you can do about it.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Two kinds of people use 86Paper</h2>
          <p className="mb-4 leading-relaxed">
            A restaurant subscribes to 86Paper and uses it to run its hiring and scheduling. Its applicants, staff and managers then use the platform because that restaurant invited them or because they applied to a job it posted.
          </p>
          <p className="mb-4 leading-relaxed">
            For information about a restaurant's own applicants and employees, the restaurant decides what is collected and what happens to it. We hold and process that information on the restaurant's behalf in order to run the service. If you applied to a restaurant or work for one, that restaurant is the right place to start with any request about your records, and we will support them in answering you.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">What we collect from restaurants</h2>
          <p className="mb-4 leading-relaxed">
            Your name and email address, your restaurant's name, and the business details you choose to add — address, phone number, website and social handles, which appear to candidates on interview and shadow-shift pages. We also hold the settings you configure: your opening hours, meal periods, positions, shadow-shift details and your overtime warning level.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">What we collect from applicants</h2>
          <p className="mb-4 leading-relaxed">
            When someone applies to a job through 86Paper we collect their first and last name, email address, phone number, their weekly availability, how long they have worked in restaurants, and their longest time at one restaurant job. We record which job they applied to and when.
          </p>
          <p className="mb-4 leading-relaxed">
            We do not collect or store resumes, documents, photographs, government identification, dates of birth, or bank details from applicants.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">What we collect from staff</h2>
          <p className="mb-4 leading-relaxed">
            For people who work at a restaurant on 86Paper we hold their name, email address and phone number, an emergency contact if they provide one, their weekly availability, and their schedule, time-off requests and shift trades.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Payment information</h2>
          <p className="mb-4 leading-relaxed">
            Subscription payments are processed by Stripe. Card details are entered directly with Stripe and 86Paper never receives or stores a full card number. We keep a Stripe customer reference, the subscription status, and the date the current billing period ends, so the platform knows whether an account is active.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Push notifications</h2>
          <p className="mb-4 leading-relaxed">
            With your consent, we deliver browser push notifications for new schedule publications, schedule change alerts, open shift and trade board availability, and time-off request decisions. To deliver them we store your browser's push subscription, which is an endpoint URL and a pair of encryption keys, so your device's push service can reach you. You may opt out at any time by turning notifications off in your profile settings, revoking notification permission for this site in your browser, or uninstalling the app. 86Paper does not send marketing push notifications.
          </p>
          <p className="mb-4 leading-relaxed">
            Interview invitations, shadow-shift invitations and new-hire signup links are delivered by email. 86Paper does not send SMS or text messages.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">How we use information</h2>
          <p className="mb-4 leading-relaxed">
            We use it to run the platform: to show a restaurant its applicants, to book interviews and shadow shifts, to send the emails and notifications those steps require, to build and share schedules, and to take subscription payments. We also use it to answer support requests and to keep the service secure and working.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">What we never do</h2>
          <p className="mb-4 leading-relaxed">
            We do not sell personal information. We do not use it for advertising, and we do not allow anyone else to. We do not score, rank, rate or profile applicants or employees, and there is no automated decision-making anywhere in the platform — every hiring and scheduling decision is made by a person at the restaurant.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Who else processes information for us</h2>
          <p className="mb-4 leading-relaxed">
            We use a small number of service providers, and only to run the platform: Supabase, which hosts our database and handles sign-in. Stripe, which processes subscription payments. Resend, which delivers our email. Lovable, which hosts the application. These providers may hold information only to perform those functions for us.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">How long we keep information</h2>
          <p className="mb-4 leading-relaxed">
            While a restaurant's subscription is active, we keep its records for as long as the restaurant wants them, and the restaurant can delete records from within the platform.
          </p>
          <p className="mb-4 leading-relaxed">
            After a subscription ends, the restaurant may request a copy of its data for 30 days. We delete it within 90 days of the subscription ending, except where we are required to keep records for longer. Restaurants should be aware they may have their own legal obligation to retain hiring records, and should keep their own copy where that applies.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Your choices</h2>
          <p className="mb-4 leading-relaxed">
            If you are a restaurant subscribed to 86Paper, you can access and correct your information in the platform, and you can contact us at hello@86paper.com to request a copy or deletion.
          </p>
          <p className="mb-4 leading-relaxed">
            If you are an applicant or an employee at a restaurant that uses 86Paper, the restaurant controls your records. Ask them first. If you contact us directly we will pass your request to them and help them act on it.
          </p>
          <p className="mb-4 leading-relaxed">
            Anyone can turn off push notifications at any time from their profile settings or their browser's site permissions.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Security</h2>
          <p className="mb-4 leading-relaxed">
            Access to restaurant data is restricted at the database level so that one restaurant cannot see another's records. A staff account can see its own record and its own shifts, plus any shift a colleague at the same restaurant has posted to the trade board, and nothing else. Passwords are stored by our authentication provider in hashed form and are never visible to us. No system is perfectly secure, and we cannot guarantee that information will never be accessed improperly.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">People under 18</h2>
          <p className="mb-4 leading-relaxed">
            Restaurants often employ people under 18, and 86Paper does not ask anyone their age. We do not knowingly collect more information from a person under 18 than we do from anyone else, and the fields listed above are all we collect from any applicant. The restaurant is responsible for complying with the law that applies to employing and holding records about minors. If you believe a person under 18 has information in 86Paper that should be removed, contact the restaurant, or contact us and we will help.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Cookies and local storage</h2>
          <p className="mb-4 leading-relaxed">
            86Paper uses browser storage only to run the service: keeping you signed in, and remembering settings such as which tab you were last on. We do not use advertising cookies, and we do not run advertising or marketing tracking scripts of our own. Our hosting provider keeps standard server request logs and may collect basic, aggregated usage statistics about the site.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Changes to this policy</h2>
          <p className="mb-4 leading-relaxed">
            We may update this policy. If a change materially affects how we handle your information, we will email account holders before it takes effect.
          </p>

          <h2 className="mt-10 text-xl font-semibold tracking-tight">Contact us</h2>
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
