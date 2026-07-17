## Scope clarification (please confirm before I build)

Before writing code I want to flag mismatches between the request and the current codebase, and confirm the plan.

### What actually exists in the code today

- **Twilio SMS is only used in two places**: `src/lib/staff-invite.functions.ts` (new-hire signup link) and `src/lib/applicant-notifications.functions.ts` (interview offer, shadow invite, hire signup). All three are in the "email-only" bucket you want to keep.
- **There is no SMS being sent** for schedule publish, schedule change, shift-trade posts, or time-off decisions. Those triggers don't currently notify anyone — there's nothing to "swap from Twilio to push"; the notification hooks need to be built from scratch.
- **There is no "Yes, notify me" opt-in toggle** in the codebase. I searched (`opt-in`, `notify`, `notificationsEnabled`, etc.) — nothing exists. This needs to be built too.
- **There is no push notification infrastructure**: no VAPID keys, no `push_subscriptions` table, no `push` event handler in the service worker, no subscription API. The PWA today only caches assets.

### Proposed implementation

**Part A — Remove Twilio entirely (fast, low risk)**
1. Strip the SMS branch from `staff-invite.functions.ts` and `applicant-notifications.functions.ts` — Resend email only, return type collapses to `{ email: {...} }`.
2. Update call sites in `src/routes/manager.tsx` (toast copy, "SMS failed" branches, "Twilio A2P" banner) to say "Email sent" / "Email failed".
3. Update `src/routes/privacy.tsx` and `src/routes/terms.tsx` — remove SMS/opt-in language, replace with push notification language.
4. `TWILIO_API_KEY` / `TWILIO_FROM_NUMBER` become unused; leave the secrets in place (harmless) and note the connector can be disconnected.

**Part B — Web push infrastructure (the real work)**
1. **VAPID keys**: generate a keypair, store `VAPID_PUBLIC_KEY` (also exposed as `VITE_VAPID_PUBLIC_KEY`) and `VAPID_PRIVATE_KEY` as project secrets. VAPID subject email hardcoded to `mailto:hello@86paper.com`.
2. **DB migration** — new tables:
   - `push_subscriptions` (id, employee_id fk, endpoint unique, p256dh, auth, user_agent, created_at) with RLS: employee inserts/deletes own; owner reads own restaurant's employees'.
   - `notification_prefs` on `profiles` or a new column on employees: `push_opt_in boolean default false`. This is the "Yes, notify me" toggle.
3. **Custom service worker** — switch from `generateSW` to `injectManifest` in `vite.config.ts` so I can add a `push` + `notificationclick` handler (workbox precache stays).
4. **Client subscription flow**:
   - New `src/lib/push-client.ts`: `enablePush()` = request permission → subscribe with VAPID public key → POST subscription to server fn → flip `push_opt_in=true`.
   - New UI in `src/routes/employee.tsx` (Settings tab / banner): "Get notified about schedule changes, open shifts, and time-off decisions" with an Enable button. Show current state (Enabled / Disabled / Blocked by browser).
5. **Server send helper** — `src/lib/push.server.ts` using the `web-push` npm package (Node-compatible on the Worker with nodejs_compat; if it fails at runtime I'll switch to a hand-rolled fetch to the endpoint using `@negrel/webpush` or the raw WebPush protocol via `crypto.subtle`).
6. **Trigger wiring** — hook the four events. Since the app currently persists schedule/trade/time-off changes optimistically from the client via Supabase directly (no server fn), I'll add thin server fns:
   - `notifyScheduleChanged({ employeeIds, kind: "published" | "adjusted", weekLabel })` — called from `ScheduleSection.tsx` after publish/save. "Published" fans out to everyone on the schedule; "adjusted" targets affected employees.
   - `notifyTradePosted({ shiftId })` — fans out to all eligible role-matched employees (excluding the poster).
   - `notifyTimeOffResolved({ requestId, approved })` — targets the requester.
   Each helper: load opted-in subscriptions → send push with title/body/url → prune dead 410/404 subscriptions.
7. **Preview safety**: skip push registration in dev/preview (same host guard as `register-sw.ts`); the button in the employee settings will say "Available on the published site."

### What I need from you
- Confirm I should proceed with **building the notify-me toggle and the schedule/trade/time-off trigger points from scratch** (they don't exist yet). This is the majority of the work.
- Confirm the "Enable notifications" prompt should live on the **employee dashboard** as a persistent banner + settings toggle (not an on-login modal), since modals on install are widely ignored.
- Confirm using **`web-push` npm** on the server (Worker+nodejs_compat should support it; I'll fall back to a raw implementation if it doesn't bundle).
- OK to remove the SMS/opt-in paragraphs from Privacy/Terms and replace with push language?

Once you confirm, I'll ship Part A immediately (Twilio removal — 10 min) then Part B in one pass.