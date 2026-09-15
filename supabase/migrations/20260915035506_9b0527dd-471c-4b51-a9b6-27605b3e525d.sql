-- Weekly scheduled-hours threshold at which the schedule builder flags a person
-- as approaching overtime. Nullable on purpose: NULL means "never configured,
-- use the application default", so no backfill is needed and an owner who has
-- explicitly chosen 38 stays distinguishable from one who never touched it.
--
-- The 40-hour overtime line itself is deliberately NOT stored here and is NOT
-- configurable. It is the law, not a preference, and making it editable would
-- let an owner silence the warning by moving the line.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS overtime_warning_hours integer;

COMMENT ON COLUMN public.profiles.overtime_warning_hours IS
  'Weekly SCHEDULED-hours threshold at which the schedule builder flags a person as approaching overtime. NULL = use the app default (38). Valid range enforced in application code is 20-40. Not a record of hours worked.';