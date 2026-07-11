## Scope reminder
Regular staff roster (`restaurant_employees` / Team section). This does NOT reuse anything from the manager-permissions `restaurant_team_members` system being removed in the parallel revert.

## What I found

**Current "Add manually" flow** (`src/routes/manager.tsx` ~L447–481)
- Dialog collects `{ name, email, role }` only — no phone, no split names.
- Calls `inviteEmployee({name,email,role})` in `sidework-store.tsx` (L1417), which builds an `Employee` with just `name` (writes to `restaurant_employees` via `insertEmployee`), and fires a fake "training assigned" notification.
- No email/link is actually sent to the invitee. Row is created immediately with owner-entered data — the invitee never sees a form. Contradicts Matt's description.

**Existing self-fill pipelines already in the app**
- `join.$slug.tsx` — open shareable join link (from `StaffOnboardingCard`). Anyone with the URL can fill first/last/email/phone/availability/emergency contact and sign up. This calls `joinStaff(...)` which creates a fresh employee row (not tied to any pre-created one).
- `hired.$id.tsx` — targeted post-hire self-onboarding, tied to a `job_applications` row via `claim_hire_invite` RPC. Pre-fills from `get_public_hire_invite` (name/email/phone from application), lets the hire complete missing details + create their auth account, then links the auth user back.

**Where phone is collected today** (all should share one component)
- Uses `formatPhone` already: `join.$slug.tsx`, `hired.$id.tsx`, `employee.tsx` (self profile + emergency contact), `careers.tsx`, `manager.tsx` EmployeeEditor (self + emergency contact ~L654, L723), `manager.tsx` BusinessInfoEditor and ManagementTeamComposer (~L2471 — being removed in revert).
- Raw `<input>` with no mask: `AvailabilityEditor.tsx` L419–422 (emergency contact phone), `manager.tsx` L1945 (applicant-edit dialog phone).

**Name reconciliation**
- DB has both `name` and `first_name`/`last_name`. `join.$slug` and `hired.$id` write all three (name = trimmed `${first} ${last}`). Old `inviteEmployee` and older seed data write only `name`. UI (`manager.tsx` L492) prefers `firstName + lastName` when present, else falls back to `name`. Rule going forward: first/last are the source of truth for new writes; `name` is a computed convenience mirror kept in sync on every write.

## Plan

### 1. Shared masked phone input component
Add `src/components/ui/phone-input.tsx`:
- Thin wrapper around shadcn `Input`.
- Props: all `Input` props except `onChange`, plus `value: string`, `onChange: (formatted: string) => void`, optional `onDigitsChange?: (digits: string) => void`.
- Defaults: `type="tel"`, `inputMode="tel"`, `autoComplete="tel"`, `placeholder="(555) 555-1234"`, `maxLength={14}`.
- Internally applies `formatPhone` on every keystroke. `formatPhone` in `src/lib/format-phone.ts` stays; the component just centralizes the JSX + defaults.

Swap every current phone input over to `<PhoneInput>`:
- `join.$slug.tsx` (main + EC), `hired.$id.tsx` (main + EC), `employee.tsx` (main + EC), `careers.tsx`, `manager.tsx` EmployeeEditor (main + EC), `manager.tsx` applicant-edit dialog (L1945 — currently unmasked, bug fix in passing), `AvailabilityEditor.tsx` EC phone (currently unmasked), `manager.tsx` BusinessInfoEditor (Restaurant Info phone). The `ManagementTeamComposer` phone input is deleted by the parallel revert — no action here.

### 2. "Add manually" form — split name + add phone (but repurpose it, see §3)
Replace the current three-field dialog with `First name`, `Last name`, `Email`, `Phone` (via `PhoneInput`), `Primary role`. Phone optional; the invitee will normally fill it themselves.

### 3. Invite-fill workflow (owner sends stub, invitee fills the rest)
Reuse the existing `restaurant_employees`-based pipeline; do NOT build a parallel one and do NOT hijack `job_applications` / `claim_hire_invite` (that flow is bound to postings).

Server side (one migration):
- Add column `restaurant_employees.invite_token uuid` (nullable, unique, default `gen_random_uuid()` on insert of stub rows only — set via app code, not a table default, so existing rows stay null).
- Add SECURITY DEFINER RPC `get_public_employee_invite(p_token uuid)` → returns `{ id, first_name, last_name, email, phone, primary_role, restaurant_name, claimed boolean }`. Read-only; safe for anon.
- Add SECURITY DEFINER RPC `claim_employee_invite(p_token uuid, p_auth_user_id uuid, p_patch jsonb)` → validates token, verifies row not already claimed (auth_user_id null), applies whitelisted fields from `p_patch` (`first_name`, `last_name`, `phone`, `weekly_availability`, `emergency_contact`), sets `auth_user_id`, `personal_info_complete = true`, `onboarding_started = true`, clears `invite_token`, keeps `name` in sync with first/last. Rejects changes to `owner_id`, `primary_role`, `approved_roles`, `seniority`, etc. (mirrors the existing `enforce_employee_self_edit_scope` intent).
- No new RLS policies needed for the reads/writes — RPCs are security-definer.

Client side:
- `src/lib/employees-supabase.ts`: add `fetchPublicEmployeeInvite(token)` and `claimEmployeeInvite(token, uid, patch)` wrappers.
- Rework `inviteEmployee` in `sidework-store.tsx` to accept `{ firstName, lastName, email, phone?, role }`. It creates the stub Employee locally AND writes the DB row with an `invite_token` (uuid) plus `personal_info_complete: false`, `onboarding_started: false`. Removes the fake "training assigned" notification (misleading — nothing has happened yet).
- The owner-facing success toast returns a copyable invite URL: `${origin}/staff-invite/{token}`. Same UX as the join-link "Copy" button (`navigator.clipboard.writeText`, fallback toast). No email sending added — matches existing join-link behavior (owner texts/emails it themselves).
- New route `src/routes/staff-invite.$token.tsx`: mirrors `hired.$id.tsx` layout, but backed by the new RPCs and `restaurant_employees` instead of `job_applications`. Fields: first/last (prefilled + editable), email (prefilled read-only — anchors the auth signup), `PhoneInput`, weekly availability, emergency contact (first/last/`PhoneInput`/relationship), password + confirm. On submit: zod-validate → `supabase.auth.signUp` → insert `profiles` row with `role: 'employee'` → `claim_employee_invite(token, uid, patch)` → local `joinStaff` mirror (so the just-signed-in employee sees themselves) → success screen matching `hired.$id`.
- Team card in `manager.tsx` gains a "Copy invite link" affordance on rows where `auth_user_id` is null and `invite_token` is present, so the owner can re-copy without re-inviting.

Realtime sync (already wired for `restaurant_employees`) will surface the invitee's submitted details in the owner's Team card without action on the owner's part — this is the "populates their row automatically" Matt asked for.

### 4. Cleanup / consistency
- Fix `manager.tsx` L1945 (applicant phone) and `AvailabilityEditor.tsx` EC phone to use the new `PhoneInput` (drive-by mask fixes).
- Keep `join.$slug.tsx` (open link) untouched aside from the `PhoneInput` swap — it stays as the low-friction share-a-link path. "Add manually" is now the targeted-invite path for a specific hire.
- Everywhere new code writes to `restaurant_employees`, keep `name = trim(first + ' ' + last)` in sync (mirroring existing `sync_team_member_name` pattern; we do it in the app to avoid a trigger on the employees table).

## Verification (after implementation, in build mode)
- Playwright + service-role seeded owner (same technique as prior turns):
  1. Open manager Settings → Team → Add Staff → Add manually. Confirm split first/last, live phone mask formatting as digits are typed, invite URL appears in toast after submit.
  2. DB: seeded row has `invite_token`, `personal_info_complete=false`, `auth_user_id=null`, `name` = "First Last".
  3. Open the `/staff-invite/{token}` URL in a fresh context. Verify prefill (name/email), phone mask, availability/EC form, complete signup.
  4. DB: same row now has `auth_user_id`, `phone`, `weekly_availability`, `emergency_contact`, `personal_info_complete=true`, `invite_token=null`.
  5. Manager Team card: row auto-updates (realtime) with the submitted phone + full details.
  6. Grep confirms zero remaining raw `<Input type="tel" ...>` outside `<PhoneInput>`.
- `bun run build` clean. Clean up all seeded data.

## Open assumption (flag)
Matt said "name + email is probably enough to kick it off." I'm keeping Primary role in the owner-side stub (owner-scoped field per `enforce_employee_self_edit_scope`; invitee can't set it). Phone is optional at the owner stage. If he'd rather the role also be picked by the invitee, we'd need to relax that server-side rule — flagging rather than silently choosing.