## What's done now
- Removed "and pick their role" from the homepage self-onboarding card. New copy: "Print a QR code. Staff scan it, add their name, phone, email, emergency contact, experience, and availability before their first shift. No chasing paperwork."

## Feature 2 — role gate → training gate → schedule eligibility

This spans employee data, manager UI, training, and the schedule builder. Before I ship it I want to confirm scope so I don't rewrite the wrong surface.

### Data model changes
- `restaurant_employees`: add `role_assigned_at timestamptz null`, `role_assigned_by uuid null`. Treat "pending role assignment" as `personal_info_complete = true AND primary_role IS NULL` (no new enum column — derived state).
- Passing threshold: default 80%, already per-video via `passingScore`. No new settings surface — keep the existing per-video field, seed new videos at 80.
- Training eligibility is derived, not stored: `scheduleEligible = every required video for primary_role has progress.passed === true`. No migration to persist it.

### Role → training track mapping
Add `src/lib/training-tracks.ts` mapping each `Role` → list of required `videoId`s (general onboarding + role-specific + menu quiz). Manager assigning a role doesn't need to write training rows; the existing video library already keys off role, and the derived check just filters by the track for the assigned role.

### Manager UI (`src/routes/manager.tsx` + employee views)
- New "Pending role assignment" section at the top of the staff list showing employees where `personal_info_complete && !primary_role`. Each row: name, self-reported experience, a role dropdown (FOH/BOH from `role-colors.ts`), "Assign role" button.
- Assigning a role updates `primary_role` and stamps `role_assigned_at`. The training track for that role becomes their required list automatically.
- Employee profile card gets a status pill:
  - `Pending role` (gray) — no role yet
  - `In training — X / Y modules` (amber) — role assigned, not all passed
  - `Schedule eligible` (green) — all required videos passed at ≥ their `passingScore`

### Schedule builder gate
- In the shift-create / assign-employee flow (`ScheduleSection.tsx` + `schedule-supabase.ts`), filter the assignable employee list to schedule-eligible only. Ineligible employees still appear but are disabled with a tooltip.
- If the manager forces assignment via any code path, `upsertShiftRow` throws a typed error surfaced as a toast: "Alex hasn't completed required training yet — 2 of 4 modules complete." The message reads the derived progress.

### Employee-facing
- Employee dashboard shows "Waiting on manager to assign your role" when pending, then their training checklist once assigned. No new page — extend the existing employee route.

### Assumptions I'm making — flag any that are wrong
1. Role list to pick from = existing `FOH_ROLES_ORDERED + BOH_ROLES_ORDERED + customRoles` from `role-colors.ts`. No new role concepts.
2. "Required training for role X" = a static map I add in code (not manager-editable this pass). If you want managers to customize per-role required videos, that's a follow-up.
3. Existing self-onboarding QR flow (`claim_employee_invite`) — keep as-is; do NOT strip `primary_role` from the invite path. Pending state applies when the invite didn't include a role (which is now the default self-serve path).
4. No new "settings" panel for the 80% threshold — it's already per-video.
5. Manager assignment happens in the existing manager dashboard, not a new route.

Confirm and I'll implement in one pass: migration + track map + manager pending queue + eligibility pill + schedule-builder gate + employee dashboard messaging.