
## Goal

Revert to a single-login owner model. Owner = full manager access via `profile.role === "owner"`. Employees keep their separate login untouched. Delete the "grant an employee manager permissions" / invite-as-manager / dual-role-switcher surface added earlier today. **Do not touch** the shifts realtime subscription or the stale-write `ShiftConflictError` toast — they are unrelated to permissions and Matt still wants them.

Non-destructive on the DB side: leave `restaurant_team_members`, `claim_team_invite`, `get_public_team_invite`, and the seeded Samantha/Mathew rows in place so we can restore later without a data-loss migration; stop referencing them from the app. `get_effective_owner` stays because `auth-context` still needs an owner-id resolver, but its "team_member" branch becomes dead code we simply ignore in the client.

## Scope-by-scope removal plan

### 1. `src/lib/permissions.ts` — DELETE
No other feature uses `ManagerPermission`, `PERMISSION_META`, `scopedTabsFor`, `permissionsShortTitle`, `permissionsDescriptor`, `permissionsFromFlags`, or `permissionsFromMember` once the callers below are cleaned up. Verify with a final `rg` before deletion.

### 2. `src/lib/auth-context.tsx` — SIMPLIFY
Keep `EffectiveOwner` and `get_effective_owner` (used to resolve `ownerId` / `restaurantName` for the sidework store), but strip permissions-related surface:
- Remove `ActingRole` export, `acting`, `permissions`, `canManageHiring`, `canManageSchedule` from `EffectiveOwner`.
- Stop importing `permissionsFromFlags` / `ManagerPermission`.
- `loadEffectiveOwner` still calls the RPC; only `owner_id` + `restaurant_name` are read from the row. If `data[0].acting === "team_member"`, treat as no effective owner (`setEffectiveOwner(null)`) — team members can no longer masquerade as owners in the client.
- `employeeContext` stays exactly as-is (employee side depends on it).

Risk: any component currently reading `.acting` / `.permissions` from `effectiveOwner` needs updating — enumerated below.

### 3. `src/lib/use-require-manager-access.ts` — REVERT
Gate purely on `profile?.role === "owner"`. Drop `effectiveOwner`/`permissions` checks. Confirmed safe for employee flow: this hook is only used in `manager.tsx`; employee routes use their own gates on `profile.role === "employee"`.

### 4. `src/routes/manager.tsx` — REMOVE SCOPED VIEW + TEAM CARD PERMISSION SWITCHES
- Delete the `isTeamMember` / `permissions` / `scopedTabs` block and the entire "scoped view for team members" branch (lines ~80–147). `ManagerPage` renders only the full dashboard.
- In the Team card (~2540–2578), remove: permission-status badges, hiring/schedule Switch rows, "Copy invite link" button, `team.setPermission` calls. Keep the card itself — it's still useful as a plain roster/contact list for hand-offs, matching how it looked before today.
- Alternative worth flagging: if Matt would rather see zero remnants, delete the whole Team card + `useTeamMembers` hook + `restaurant_team_members` CRUD from `hiring-supabase.ts`. My default is **keep the card as a read/write roster**, drop only the permission UI. Confirm which he wants.
- Remove `PERMISSION_META`, `PERMISSION_KEYS`, `permissionsShortTitle`, `scopedTabsFor`, `ManagerPermission` imports.

### 5. `src/lib/use-team-members.ts` — TRIM
Remove `setPermission`, `setHiringPermission`, `setSchedulePermission`, and the `PERMISSION_META` / `ManagerPermission` imports. Keep `add`/`update`/`remove` — still used by the plain Team card (option A above).

### 6. `src/lib/hiring-supabase.ts` — TRIM
- Delete `setTeamMemberPermission`, `setTeamMemberHiringPermission`, `setTeamMemberSchedulePermission`, `fetchPublicTeamInvite`, `claimTeamInvite`, and the `PublicTeamInvite` type.
- Keep `fetchTeamMembers` / `insertTeamMember` / `updateTeamMember` / `deleteTeamMember` and the `TeamMember` / `TeamMemberInput` types (still used by the roster card). Strip `canManageHiring`/`canManageSchedule` from the returned shape and stop reading `can_manage_*` columns (they simply stay `false` in the DB; RLS is unaffected).

### 7. `src/routes/team-invite.$id.tsx` — DELETE
Whole route file. Vite router plugin will regenerate `routeTree.gen.ts` without it. No other links reference `/team-invite/*` after step 4.

### 8. `src/components/sidework/SetupWizard.tsx` — REMOVE STEP 5 + RENUMBER
- Delete `ManagementTeamComposer` function and its `step === 5` render block.
- Renumber steps 6→5, 7→6, …, 11→10, and change `TOTAL_STEPS = 11` → `10`.
- Shift the `prompts` map keys down by one for steps ≥6. Delete the current step-5 prompt string ("Who else on your team should be able to manage hiring or scheduling…").
- Remove `PERMISSION_KEYS`, `PERMISSION_META`, `ManagerPermission` imports.
- Verify `advance()` still lands on the finish step correctly (no off-by-one — the increment is `s + 1`, so it only depends on `TOTAL_STEPS` being right and the `prompts` map keys matching).

### 9. `src/components/sidework/AppShell.tsx` — REMOVE DUAL-ROLE PILL
Delete the `hasManager` / `hasEmployee` / `showDualRoleSwitcher` / `switcherTarget` / `switcherLabel` computation and the `<Button>` that renders it. Stop reading `effectiveOwner` and `employeeContext` from `useAuth()`. `ArrowLeftRight` import goes with it.

### 10. `src/routes/login.tsx` — SIMPLIFY POST-SIGN-IN ROUTING
Drop the `get_effective_owner` round-trip. After a successful password sign-in, read `profiles.role` (or rely on the manager-access gate on `/manager` to bounce non-owners). Simplest: `navigate({ to: "/manager" })` and let `useRequireManagerAccess` redirect non-owners to `/employee` — that's exactly what it already does. Removes the "acting" check and the auto-signout-then-redirect-to-employee-login branch (that branch was there specifically for the team-member case).

### 11. DB — LEAVE IN PLACE (recommended)
`restaurant_team_members` (with the two seeded rows), `claim_team_invite`, `get_public_team_invite`, and the `can_manage_*` columns stay untouched. Reasoning:
- Non-destructive; if Matt reverses again we don't need a data-recovery story.
- These objects are unreachable from the UI after this cleanup, so they don't confuse users.
- The one wart: the `types.ts` regenerated file still lists these RPCs. Harmless — they're just unused.

Tradeoff (flagged, not silently chosen): the alternative is a migration that drops `restaurant_team_members`, `claim_team_invite`, `get_public_team_invite`, and the `can_manage_*` columns. Cleaner surface, but irreversible without restoring from backup, and the seeded rows go with it. **Default: leave.** Say the word to switch to a drop migration.

`get_effective_owner` also stays: it's the ownerId resolver used by `auth-context`. Its team-member fallback path becomes unreachable client-side after step 2 — acceptable.

## Guarded areas — do not modify

- `src/components/sidework/ScheduleSection.tsx`: `updatedAt` conflict handling and `applyRemoteShiftUpsert` callers. No permissions references live in this file; safe.
- `src/lib/schedule-supabase.ts`: `shiftFromRow`/`upsertShiftRow` with `updated_at` optimistic concurrency — untouched.
- `src/lib/sidework-store.tsx`: the realtime `postgres_changes` subscription on `shifts` and the applyRemoteShiftUpsert wiring — untouched. Only touches `effectiveOwner.ownerId` and `effectiveOwner.acting === "owner"` (line 1173, 1235, 1239) — the `acting === "owner"` check needs updating since we're removing `.acting`. Simplest fix: treat any non-null `effectiveOwner` as owner (that's what it means after step 2), i.e. drop the `acting === "owner"` conjunction.
- Employee routes (`/employee`, `/employee-login`), `useRequireRole`, `employee-supabase.ts`, `EmployeeContext` — untouched.

## Loose ends surfaced

- `src/integrations/supabase/types.ts` will regenerate on next migration; today it still contains `claim_team_invite` / `get_public_team_invite` / team-member `can_manage_*` types. Fine to leave since the DB objects remain.
- The `restaurant_team_members` RLS policies (5 of them) stay — they reference `can_manage_*` columns which still exist. No changes needed.
- `login.tsx` currently prints "This is the manager sign-in. Redirecting to employee sign-in…" — after the simplification, this toast disappears; a plain employee who mistypes the URL will now hit `/manager` briefly and get bounced to `/employee` by the gate. Acceptable, matches pre-today behavior.
- No changes needed to `use-require-role.ts`, `employee.tsx`, `employee-login.tsx`, `signup.tsx` (signup already assigns `role: "owner"` on the owner path).

## Verification after implementation (build mode)

- `bun run build` clean and `tsgo` clean.
- Playwright (service-role/seeded) as owner: `/manager` loads full dashboard, Team card renders as a plain roster (no permission switches, no invite-link button), Settings unaffected, wizard shows "Step N of 10" and skips cleanly from operations → pain points with no gap.
- Playwright (service-role/seeded) as employee: `/employee` loads normally; the removed dual-role pill does not appear in the header.
- Realtime + conflict toast smoke test (same technique as last turn): flip a shift via direct DB write → UI updates; edit a stale shift in the UI → conflict toast fires.
- `/team-invite/<id>` returns 404 (route deleted).

## Ready for approval

Two open questions worth confirming before I start:

1. **Team card:** keep it as a plain roster (add/edit/remove contacts, no permissions) — or delete it entirely along with `useTeamMembers` and the roster CRUD? I default to keeping it.
2. **DB objects:** leave `restaurant_team_members` + the two related RPCs + seeded rows dormant (recommended), or ship a drop migration in the same pass?
