
-- Drop functions being replaced (return-shape changes)
DROP FUNCTION IF EXISTS public.get_effective_owner();
DROP FUNCTION IF EXISTS public.get_public_team_invite(uuid);

-- 1. shifts
CREATE TABLE public.shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.restaurant_employees(id) ON DELETE SET NULL,
  local_id text,
  date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  role text NOT NULL,
  "position" text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX shifts_owner_local_id_key ON public.shifts (owner_id, local_id) WHERE local_id IS NOT NULL;
CREATE INDEX shifts_owner_id_idx ON public.shifts (owner_id);
CREATE INDEX shifts_employee_id_idx ON public.shifts (employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. time_off_requests
CREATE TABLE public.time_off_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.restaurant_employees(id) ON DELETE CASCADE,
  local_id text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason_type text,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  resolved_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX time_off_requests_owner_local_id_key ON public.time_off_requests (owner_id, local_id) WHERE local_id IS NOT NULL;
CREATE INDEX time_off_requests_owner_id_idx ON public.time_off_requests (owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_off_requests TO authenticated;
GRANT ALL ON public.time_off_requests TO service_role;
ALTER TABLE public.time_off_requests ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_time_off_requests_updated_at BEFORE UPDATE ON public.time_off_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. shift_trades
CREATE TABLE public.shift_trades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE CASCADE,
  local_id text,
  posted_by uuid REFERENCES public.restaurant_employees(id) ON DELETE SET NULL,
  claimed_by uuid REFERENCES public.restaurant_employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  note text,
  auto_approved boolean NOT NULL DEFAULT false,
  approved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX shift_trades_owner_local_id_key ON public.shift_trades (owner_id, local_id) WHERE local_id IS NOT NULL;
CREATE INDEX shift_trades_owner_id_idx ON public.shift_trades (owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_trades TO authenticated;
GRANT ALL ON public.shift_trades TO service_role;
ALTER TABLE public.shift_trades ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_shift_trades_updated_at BEFORE UPDATE ON public.shift_trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. can_manage_schedule column
ALTER TABLE public.restaurant_team_members
  ADD COLUMN IF NOT EXISTS can_manage_schedule boolean NOT NULL DEFAULT false;

-- 5. helper
CREATE OR REPLACE FUNCTION public.can_manage_schedule_for(p_owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() = p_owner_id
    OR EXISTS (
      SELECT 1 FROM public.restaurant_team_members tm
      WHERE tm.owner_id = p_owner_id AND tm.auth_user_id = auth.uid()
        AND tm.can_manage_schedule = true
    )
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_schedule_for(uuid) TO authenticated, anon;

-- 6. Owner policies
CREATE POLICY "Owners view shifts" ON public.shifts FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners insert shifts" ON public.shifts FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update shifts" ON public.shifts FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete shifts" ON public.shifts FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners view timeoff" ON public.time_off_requests FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners insert timeoff" ON public.time_off_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update timeoff" ON public.time_off_requests FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete timeoff" ON public.time_off_requests FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners view trades" ON public.shift_trades FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners insert trades" ON public.shift_trades FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update trades" ON public.shift_trades FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete trades" ON public.shift_trades FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- 7. Additive schedule-manager policies
CREATE POLICY "Schedule managers view shifts" ON public.shifts FOR SELECT USING (public.can_manage_schedule_for(owner_id));
CREATE POLICY "Schedule managers insert shifts" ON public.shifts FOR INSERT WITH CHECK (public.can_manage_schedule_for(owner_id));
CREATE POLICY "Schedule managers update shifts" ON public.shifts FOR UPDATE USING (public.can_manage_schedule_for(owner_id)) WITH CHECK (public.can_manage_schedule_for(owner_id));
CREATE POLICY "Schedule managers delete shifts" ON public.shifts FOR DELETE USING (public.can_manage_schedule_for(owner_id));
CREATE POLICY "Schedule managers view timeoff" ON public.time_off_requests FOR SELECT USING (public.can_manage_schedule_for(owner_id));
CREATE POLICY "Schedule managers insert timeoff" ON public.time_off_requests FOR INSERT WITH CHECK (public.can_manage_schedule_for(owner_id));
CREATE POLICY "Schedule managers update timeoff" ON public.time_off_requests FOR UPDATE USING (public.can_manage_schedule_for(owner_id)) WITH CHECK (public.can_manage_schedule_for(owner_id));
CREATE POLICY "Schedule managers delete timeoff" ON public.time_off_requests FOR DELETE USING (public.can_manage_schedule_for(owner_id));
CREATE POLICY "Schedule managers view trades" ON public.shift_trades FOR SELECT USING (public.can_manage_schedule_for(owner_id));
CREATE POLICY "Schedule managers insert trades" ON public.shift_trades FOR INSERT WITH CHECK (public.can_manage_schedule_for(owner_id));
CREATE POLICY "Schedule managers update trades" ON public.shift_trades FOR UPDATE USING (public.can_manage_schedule_for(owner_id)) WITH CHECK (public.can_manage_schedule_for(owner_id));
CREATE POLICY "Schedule managers delete trades" ON public.shift_trades FOR DELETE USING (public.can_manage_schedule_for(owner_id));
CREATE POLICY "Schedule managers view employees" ON public.restaurant_employees
  FOR SELECT USING (public.can_manage_schedule_for(owner_id));

-- 8. Effective owner resolver with perm flags
CREATE OR REPLACE FUNCTION public.get_effective_owner()
RETURNS TABLE(owner_id uuid, restaurant_name text, acting text, can_manage_hiring boolean, can_manage_schedule boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  as_owner AS (
    SELECT p.id AS owner_id, p.restaurant_name, 'owner'::text AS acting,
           true AS can_manage_hiring, true AS can_manage_schedule
    FROM public.profiles p, me
    WHERE p.id = me.uid AND p.role = 'owner'
  ),
  as_tm AS (
    SELECT tm.owner_id, p.restaurant_name, 'team_member'::text AS acting,
           tm.can_manage_hiring, tm.can_manage_schedule
    FROM public.restaurant_team_members tm
    LEFT JOIN public.profiles p ON p.id = tm.owner_id
    , me
    WHERE tm.auth_user_id = me.uid
      AND (tm.can_manage_hiring = true OR tm.can_manage_schedule = true)
    LIMIT 1
  )
  SELECT * FROM as_owner
  UNION ALL
  SELECT * FROM as_tm WHERE NOT EXISTS (SELECT 1 FROM as_owner)
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_effective_owner() TO authenticated;

-- 9. Public team-invite lookup widened
CREATE OR REPLACE FUNCTION public.get_public_team_invite(p_team_member_id uuid)
RETURNS TABLE(id uuid, name text, first_name text, restaurant_name text, can_manage_hiring boolean, can_manage_schedule boolean, claimed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tm.id, tm.name, tm.first_name, p.restaurant_name,
         tm.can_manage_hiring, tm.can_manage_schedule,
         (tm.auth_user_id IS NOT NULL) AS claimed
  FROM public.restaurant_team_members tm
  LEFT JOIN public.profiles p ON p.id = tm.owner_id
  WHERE tm.id = p_team_member_id
$$;
GRANT EXECUTE ON FUNCTION public.get_public_team_invite(uuid) TO anon, authenticated;
