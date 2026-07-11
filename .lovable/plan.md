## Investigation findings

Short version: the whole two-flag permission system Matt is asking for is **already wired end-to-end**. Samantha's and Mathew's flags are `false` simply because nobody has toggled them in the Team card yet, and neither has claimed a login. The real gaps are (a) discoverability during initial owner setup, (b) generalizing beyond exactly two hardcoded booleans, and (c) a couple of production-polish items on the invite-claim flow.

### 1. Existing UI that reads/writes `can_manage_hiring` / `can_manage_schedule`

Fully wired, both directions:

- **Write UI** — `src/routes/manager.tsx` Team card (~lines 2545–2590): each team member row shows two `<Switch>` controls, "Can manage hiring & interviews" and "Can manage scheduling". They call `team.setPermission` / `team.setSchedulePermission` (`src/lib/use-team-members.ts`), which hit `setTeamMemberHiringPermission` / `setTeamMemberSchedulePermission` in `src/lib/hiring-supabase.ts` (plain `update` on `restaurant_team_members`).
- **Read UI (owner side)** — same card shows "Hiring access" / "Scheduling access" badges, and gates the "Copy invite link" button on `anyPerm && !hasAccount`.
- **Read UI (team-member side)** — `src/routes/manager.tsx` (~lines 78–150) reads `effectiveOwner.canManageHiring/canManageSchedule` from `useAuth()`, and when `acting === "team_member"` renders a **scoped dashboard**: only Schedule/Trades/TimeOff tabs if scheduling, only Jobs tab if hiring, both if both. Tab auto-pins to the first permitted one. `useRequireManagerAccess` already lets a permitted team member into `/manager` even without `role === "owner"`.
- **RLS side** — `can_manage_hiring_for(owner_id)` and `can_manage_schedule_for(owner_id)` SQL security-definer helpers already exist and are the intended predicate for policies on hiring/schedule tables.

**Why Samantha's/Matt's are false**: no owner has flipped the switches in the Team card. It's a discoverability problem, not a wiring problem. (Also — they have no `auth_user_id`, so even flipping the switch today just makes an invite link available; they haven't claimed a login.)

### 2. `auth_user_id` linkage + login-role separation

- **Flow exists**: owner toggles a permission → "Copy invite link" appears → link is `/team-invite/{team_member_id}` → `src/routes/team-invite.$id.tsx` fetches a public projection via `get_public_team_invite` RPC → invitee enters email+password → tries `signInWithPassword`, else `signUp` → on success calls the `claim_team_invite(team_member_id, auth_user_id)` SQL function, which sets `auth_user_id`, enforces "not already claimed", and rejects if that auth user is already linked to another team member row.
- After claiming, `get_effective_owner()` returns their owner's id + the two permission flags, and `useAuth().effectiveOwner.acting === "team_member"` drives the scoped dashboard.
- **Login-role separation status**: the plumbing is there and works, but the sign-up path on the invite page creates the auth user with `data: { role: "employee" }`. That's fine because gating uses `restaurant_team_members.auth_user_id`, not `profiles.role`. The **actual gaps** are:
  1. The Team card copies the invite link but never surfaces the invitee's email/phone or offers a "send" action — owners have to copy/paste out-of-band.
  2. There's no email-verified requirement or single-use-token wrapper on the invite id; anyone who gets the URL and picks any email/password can claim it. Fine for the demo, worth flagging.
  3. If someone already has an owner or employee login and lands on `/team-invite/...`, the current flow tries to sign them in with their existing password inside the invite page — works, but there's no explicit "you're already signed in — claim as this account?" affordance.

### 3. Where "add team + grant permissions" belongs in owner setup

- The owner setup wizard is `src/components/sidework/SetupWizard.tsx`. Step 4 is a `TeamForm` — but today it only asks about **role composition** (FOH/BOH role checkboxes, min staff/shift, "who makes the schedule"). It does **not** collect actual people, and does not touch `restaurant_team_members` at all.
- Team members are added exclusively later, from the Team card in the manager dashboard, via the "Add team member" dialog (`src/routes/manager.tsx` ~2500). That dialog can pre-fill from existing `restaurant_employees` rows.
- So there is **no onboarding moment today** where the owner is prompted to add a manager-level teammate and grant them permissions. Adding that is the right hook for Matt's ask.

### 4. What gates the Hiring / Schedule tabs today

- Route-level: `useRequireManagerAccess("/login")` — allows `profile.role === "owner"` **or** any team member with either flag true. Anyone else → `/employee`.
- Tab-level: for owners, `ManagerPage` shows the full tab set unconditionally. For `acting === "team_member"`, `scopedTabs` above filters to exactly the two-flag set. There is no per-tab permission read anywhere else — the concept of "permitted-but-not-owner" is already a first-class thing in the UI, just driven by exactly two booleans.

---

## Proposed plan

Three-part plan. Nothing changes the DB shape yet — we generalize inside the app first and only add columns if/when a third permission surfaces.

### Part A — surface permissions during owner setup (biggest UX gap)

Add a new **"Your management team"** step to `SetupWizard.tsx` immediately after the existing Team (roles) step. It writes real rows to `restaurant_team_members` via the same `useTeamMembers` hook the manager Team card uses, so nothing new server-side.

For each row the owner adds during setup, they can:
- Enter first/last name, title, email, phone (same fields as today's Add-team-member dialog).
- Toggle the two permission switches inline ("Can manage hiring & interviews", "Can manage scheduling").
- See an "Invite link" ready to copy the moment either switch is on.

Skippable step ("I'll do this later from Settings") — some owners run solo at launch. Existing Team card in the manager dashboard remains the durable edit surface.

### Part B — generalize the permission model in code (don't touch the DB yet)

Two hardcoded booleans is not what we want to keep pattern-matching against as we add more manageable areas (menus, training, payroll…). Refactor the **application layer only**, keeping the DB columns as-is:

- Introduce a `ManagerPermission` union type in a new `src/lib/permissions.ts`: initially `"hiring" | "schedule"`.
- Add a `PERMISSION_META` registry mapping each key to `{ label, description, tabs: string[], column: keyof RestaurantTeamMembersRow }` — this is the single source of truth for labels, descriptions, tab visibility, and which DB column to read/write.
- `useAuth().effectiveOwner` gains `permissions: Set<ManagerPermission>` (derived from the existing booleans). Existing `canManageHiring`/`canManageSchedule` fields stay for now to avoid breaking callers, but are marked deprecated in a comment and are computed from the set.
- `ManagerPage` scoping, Team card switches, the invite page copy, and `useRequireManagerAccess` all iterate over the registry instead of hardcoding two flags.
- `use-team-members.ts` exposes one generic `setPermission(id, key, value)` that dispatches to the right DB column, deprecating the two specific setters.

Effect: adding a third permission later = add one entry to the registry + one column + one RLS helper. No shotgun-edits across the codebase, no "paint us into a corner", and Matt sees no behavior change today.

Explicit non-goal: we do **not** migrate to a `team_member_permissions` join table or a JSONB permissions column right now. Two flags is fine at rest; the cost is a per-column DDL each time we add a permission, which is acceptable for the next 1–2 additions and easy to swap out later behind the same registry.

### Part C — small production-polish items on the invite flow (optional in this pass, flag for Matt)

Don't build unless approved:
- Team card: show the invite URL inline (not just a copy button) and a "Send invite" affordance (email/SMS) that pre-fills the invitee's email/phone from the row.
- Invite page: if the visitor is already signed in as some auth user, offer "Claim as {current email}" as a one-click path instead of re-entering credentials.
- Consider signing the invite URL (short-lived token per team_member_id) before we ship publicly, so a leaked id can't be claimed by a stranger.

## Technical work list (Parts A + B only, no code yet)

1. `src/lib/permissions.ts` (new) — `ManagerPermission` union, `PERMISSION_META` registry, `permissionsFromRow(row)` / `columnFor(key)` helpers.
2. `src/lib/auth-context.tsx` — derive `effectiveOwner.permissions: Set<ManagerPermission>` from the RPC row; keep `canManageHiring`/`canManageSchedule` as computed getters over the set for back-compat.
3. `src/lib/hiring-supabase.ts` — add generic `setTeamMemberPermission(id, key, value)`; keep the two specific setters as thin wrappers marked deprecated.
4. `src/lib/use-team-members.ts` — expose generic `setPermission(id, key, value)`; keep existing methods as wrappers.
5. `src/routes/manager.tsx` — `scopedTabs`, header title/subtitle, and the Team-card switches iterate over `PERMISSION_META` instead of the two if-branches. Behavior is byte-for-byte identical today.
6. `src/routes/team-invite.$id.tsx` — invite copy generated from `PERMISSION_META` labels.
7. `src/components/sidework/SetupWizard.tsx` — insert a new "Your management team" step after the existing role-composition Team step. Reuses `useTeamMembers` + the new generic `setPermission`. Skippable. Emits the same summary-line style as other steps.
8. `useRequireManagerAccess` — allow entry when `effectiveOwner.permissions.size > 0` instead of the explicit OR.

No migrations, no RLS changes, no changes to `get_effective_owner` — the two flag columns keep flowing through.

## Open questions before build

- **Setup-wizard placement**: right after the existing Team step (roles/scheduler), or as a later optional "finish setting up" step in the manager dashboard after the wizard closes? Either fits; the wizard slot is more likely to actually get filled in.
- **Skip behavior**: if the owner skips the new setup step, do we nudge them from the dashboard until they've added at least one manager (banner), or fully silent?
- **Part C**: worth doing in the same pass, or defer until after Matt sees Parts A+B?