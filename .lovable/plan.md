# Dual-role logins + concurrent schedule editing — investigation

Short version for Matt: **he doesn't need two separate accounts.** The plumbing already almost supports one login = both roles; it's a routing/UX gap, not a data-model gap. And on concurrency: today it is **silent last-write-wins with zero realtime**, so his instinct that "something bad could happen" is correct.

## Findings

### 1. Employee ↔ team_member identity overlap

- `restaurant_employees` and `restaurant_team_members` are structurally independent tables. Each has its own partial-unique index on `auth_user_id` (one employee row per auth user, one team_member row per auth user), but **nothing prevents the same `auth_user_id` from appearing on both** — no FK between them, no cross-table trigger, no RLS check that spans both, and no shared-id concept.
- `claim_team_invite(...)` (`supabase/migrations/20260709111637_...sql:98-127`) rejects a second team_member claim by the same auth user, but only queries `restaurant_team_members` — it never looks at `restaurant_employees`.
- The hired-invite path (`claim_hire_invite`) doesn't set `restaurant_employees.auth_user_id` directly at all; that field lives outside the code paths surfaced in this pass and is worth a small follow-up read of `20260709120136_...sql` to confirm the exact write path.
- Bottom line: today, a single human with one email/password can already be sitting on both an employee row (their scheduled shifts) and a claimed team_member row (their manager permissions). Nothing blocks it.

### 2. Dual-role routing today (what actually happens)

- `auth-context.tsx` loads `effectiveOwner` (team_member/owner) AND `employeeContext` (employee) as **two independent RPCs on every session** — both can be populated for the same user simultaneously.
- `useRequireManagerAccess` lets the user into `/manager` whenever `effectiveOwner.acting === "team_member"` with permissions > 0 (independent of any employee row).
- `/employee` gates only on `employeeContext?.employeeId ?? profile?.employee_id` — independent of `effectiveOwner`.
- `login.tsx` post-sign-in redirect: if `get_effective_owner()` returns a row → `/manager`; else → `/employee-login`. **There is no branch that offers the user a choice.** A dual-role bartender-manager who signs in at `/login` gets deposited on `/manager` with no visible way to reach `/employee`.
- `profile.role` is a strict `"owner" | "employee"` union. A claimed team member still has `profile.role = "employee"` — their manager status lives entirely in `get_effective_owner()`. So the "dual-role" identity is already effectively modeled; the app just doesn't expose a switch.
- No role-switcher UI exists anywhere (`grep`: zero hits for switchRole / "Switch to manager" / mode toggles).

### 3. Concurrent schedule editing (what actually happens)

- All shift writes (single edit, manual add, AI-generate, copy-to-next-week, clear-week) funnel through `sidework-store.tsx#upsertShift` (`:1514-1536`), which does an optimistic local update then calls `upsertShiftRow` in `schedule-supabase.ts:58-78`.
- The DB write is **a plain `.update()` keyed only by `.eq("id", s.id)`** — no `updated_at`/version predicate, no if-match. Pure last-write-wins with **no warning to either editor**.
- Bulk paths (`performCopyToNextWeek`, `performClearWeek`) are **not batched**: they loop and fire one delete or one upsert per shift. Copying a full week of ~40 shifts = ~40 round trips.
- **No realtime subscription on `shifts` anywhere in `src/`** (`rg "channel\(|postgres_changes"` → 0 hits). Two managers editing the same week see each other's changes only on manual refresh.
- The `shifts` table has 12 columns; `updated_at` is trigger-maintained but never read back into a WHERE. No `version` / lock column.

## Proposed fixes (not built yet)

### Fix A — One login serves both roles (small, one build session)

Concept: keep the two tables independent (they model different things — a shift-eligible staff record vs. a permission grant), but let one auth user hold both, and give them a role switcher.

Changes:
1. **Routing / gate logic** (~4 files):
   - `useRequireManagerAccess`: unchanged — already correctly allows dual-role.
   - Add a matching helper `useCanAccessEmployeeView()` that returns true when `employeeContext?.employeeId || profile?.employee_id` is present, regardless of manager status.
   - `login.tsx` post-sign-in redirect: if BOTH `effectiveOwner` (with permissions) AND `employeeContext` are set → route to `/manager` by default AND render a small "You also have a personal schedule → Go to My Schedule" affordance on that page. If only one, keep current behavior.
   - `AppShell` nav (already has slots): for dual-role users add a persistent "Switch to My Schedule" / "Switch to Manager" link in the header/menu. Drives entirely off `useAuth()` — no new server state.
2. **Team-invite claim safeguard** (~1 SQL migration):
   - Extend `claim_team_invite` to be a no-op-and-succeed when `p_auth_user_id` already belongs to a `restaurant_employees` row under the same `owner_id` (this is the "bartender + manager" case — legal). Continue rejecting when it's a *different* owner (cross-restaurant leak).
   - Symmetric small guard on the employee auth-link path if we find one (the follow-up read of `20260709120136_...sql` will tell us where that write happens).
3. **No new columns, no data migration.** Existing rows already work — Samantha/Mathew would just gain an employee row later if the owner adds them to the roster.

Scope estimate: ~one focused build session. No DB shape change beyond the RPC tweak. Zero behavior change for single-role users today.

### Fix B — First-pass concurrent-edit safety

Two independent pieces, both small; recommend shipping together but they can split:

**B1. Optimistic concurrency check on shift writes** (~30 min of code):
- `upsertShiftRow`: change the `.eq("id", ...)` to also `.eq("updated_at", lastKnownUpdatedAt)`; if `.single()` returns no row, we have a conflict — surface a toast: *"This shift was just changed by someone else. Reloading…"* and refetch that shift.
- `shift` type in the store already carries `updatedAt` via `shiftFromRow`; thread it into `upsertShift(shift, { ifUnchangedSince: shift.updatedAt })`.
- Concretely covers the "two managers save the same shift within seconds of each other" case that Matt is worried about, with no server work and no realtime infra.

**B2. Realtime "someone else is editing" awareness** (~2–3 hours of code, still one build session):
- Enable Realtime on `public.shifts` via `ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts` migration.
- In `ScheduleSection.tsx`, subscribe (inside `useEffect`, tear down on unmount — per the realtime rules) to `postgres_changes` on `shifts` filtered to the current `owner_id`. On any INSERT/UPDATE/DELETE that's not from the local session, patch the store's `shifts` slice and (if the change touched a shift currently open in the edit dialog) flash a subtle "updated by {name}" indicator.
- RLS on `shifts` already scopes reads to authorized viewers, so subscribers get filtered correctly out of the box.

**Deferred (bigger, own session):**
- Server-side presence/locking ("Danny is editing this shift right now, take over?"). Real value but needs presence channels + UI. Not needed for the first pass — B1 + B2 already eliminate silent overwrite.
- Batching `performCopyToNextWeek` / `performClearWeek` into a single RPC to cut ~40 round trips → 1. Independent perf win, unrelated to correctness; flag for later.

## Sizing summary

| Fix | Size | Recommend |
|---|---|---|
| A — one-login-dual-role + role switcher + claim guard | small, one session | Yes, next build |
| B1 — optimistic-concurrency check on shift writes | tiny, ~30 min | Yes, next build (bundle with A or B2) |
| B2 — realtime schedule sync | small, one session | Yes, its own or bundled with A |
| Presence/locking, batched copy-week RPC | medium, own session each | Defer, flag for later |

## Open follow-ups before implementing A

- Confirm where `restaurant_employees.auth_user_id` actually gets set (which trigger/RPC in `20260709120136_...sql`) so the symmetric guard in A2 lands in the right place.
- Decide default landing page for a dual-role user: `/manager` (current behavior, add "My Schedule" link) or a tiny picker page on first login. My default is stay on `/manager` and add the switcher — one fewer click for the majority case.
