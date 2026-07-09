
-- Wave A: employees roster + restaurant hours on profiles
CREATE TABLE public.restaurant_employees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  auth_user_id uuid,
  local_id text,
  name text NOT NULL DEFAULT '',
  first_name text,
  last_name text,
  email text,
  phone text,
  "position" text,
  section text,
  primary_role text NOT NULL DEFAULT 'Server',
  approved_roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  auto_approve_roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  seniority int,
  availability text NOT NULL DEFAULT '',
  weekly_availability jsonb,
  emergency_contact jsonb,
  photo_url text,
  invited_at date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  onboarding_started boolean NOT NULL DEFAULT false,
  personal_info_complete boolean NOT NULL DEFAULT false,
  hired_from_application_id text,
  application_pitch text,
  applied_at timestamptz,
  work_experience jsonb,
  special_talents text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: bootstrap uses INSERT ON CONFLICT on (owner_id, local_id).
CREATE UNIQUE INDEX restaurant_employees_owner_local_id_key
  ON public.restaurant_employees (owner_id, local_id)
  WHERE local_id IS NOT NULL;

-- One auth user can only be linked to one employee record (mirrors team_members pattern).
CREATE UNIQUE INDEX restaurant_employees_auth_user_id_key
  ON public.restaurant_employees (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX restaurant_employees_owner_id_idx
  ON public.restaurant_employees (owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_employees TO authenticated;
GRANT ALL ON public.restaurant_employees TO service_role;

ALTER TABLE public.restaurant_employees ENABLE ROW LEVEL SECURITY;

-- Owner-only access. Wave B will add can_manage_schedule alongside shifts.
CREATE POLICY "Owners can view their employees"
  ON public.restaurant_employees FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can insert their employees"
  ON public.restaurant_employees FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their employees"
  ON public.restaurant_employees FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their employees"
  ON public.restaurant_employees FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

CREATE TRIGGER update_restaurant_employees_updated_at
  BEFORE UPDATE ON public.restaurant_employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Restaurant hours as jsonb on profiles (no separate table).
-- Shape: { Mon: { closed: bool, open: "HH:mm", close: "HH:mm" }, ... }
ALTER TABLE public.profiles
  ADD COLUMN restaurant_hours jsonb;
