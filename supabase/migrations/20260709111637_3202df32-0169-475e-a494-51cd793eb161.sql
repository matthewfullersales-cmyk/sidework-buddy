
-- 1. Columns
ALTER TABLE public.restaurant_team_members
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS can_manage_hiring boolean NOT NULL DEFAULT false;

-- One auth user maps to at most one team-member row
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_team_members_auth_user_id_key
  ON public.restaurant_team_members (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- 2. Helper: is the current user allowed to manage hiring for this owner?
CREATE OR REPLACE FUNCTION public.can_manage_hiring_for(p_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = p_owner_id
    OR EXISTS (
      SELECT 1 FROM public.restaurant_team_members tm
      WHERE tm.owner_id = p_owner_id
        AND tm.auth_user_id = auth.uid()
        AND tm.can_manage_hiring = true
    )
$$;

-- 3. Resolve "effective owner id" for the caller
CREATE OR REPLACE FUNCTION public.get_effective_owner()
RETURNS TABLE(owner_id uuid, restaurant_name text, acting text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  as_owner AS (
    SELECT p.id AS owner_id, p.restaurant_name, 'owner'::text AS acting
    FROM public.profiles p, me
    WHERE p.id = me.uid AND p.role = 'owner'
  ),
  as_hm AS (
    SELECT tm.owner_id, p.restaurant_name, 'hiring_manager'::text AS acting
    FROM public.restaurant_team_members tm
    LEFT JOIN public.profiles p ON p.id = tm.owner_id
    , me
    WHERE tm.auth_user_id = me.uid
      AND tm.can_manage_hiring = true
    LIMIT 1
  )
  SELECT * FROM as_owner
  UNION ALL
  SELECT * FROM as_hm
  WHERE NOT EXISTS (SELECT 1 FROM as_owner)
  LIMIT 1
$$;

-- 4. Additive RLS policies
-- job_applications: hiring managers can view + update
DROP POLICY IF EXISTS "Hiring managers can view applications" ON public.job_applications;
CREATE POLICY "Hiring managers can view applications"
  ON public.job_applications FOR SELECT
  USING (public.can_manage_hiring_for(owner_id));

DROP POLICY IF EXISTS "Hiring managers can update applications" ON public.job_applications;
CREATE POLICY "Hiring managers can update applications"
  ON public.job_applications FOR UPDATE
  USING (public.can_manage_hiring_for(owner_id))
  WITH CHECK (public.can_manage_hiring_for(owner_id));

-- restaurant_team_members: hiring managers can view (needed for reassign)
DROP POLICY IF EXISTS "Hiring managers can view team roster" ON public.restaurant_team_members;
CREATE POLICY "Hiring managers can view team roster"
  ON public.restaurant_team_members FOR SELECT
  USING (public.can_manage_hiring_for(owner_id));

-- 5. Invite/claim RPCs (public — no auth required to look up an invite)
CREATE OR REPLACE FUNCTION public.get_public_team_invite(p_team_member_id uuid)
RETURNS TABLE(id uuid, name text, first_name text, restaurant_name text, can_manage_hiring boolean, claimed boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tm.id,
    tm.name,
    tm.first_name,
    p.restaurant_name,
    tm.can_manage_hiring,
    (tm.auth_user_id IS NOT NULL) AS claimed
  FROM public.restaurant_team_members tm
  LEFT JOIN public.profiles p ON p.id = tm.owner_id
  WHERE tm.id = p_team_member_id
$$;

CREATE OR REPLACE FUNCTION public.claim_team_invite(p_team_member_id uuid, p_auth_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.restaurant_team_members;
  already_linked uuid;
BEGIN
  SELECT * INTO r FROM public.restaurant_team_members WHERE id = p_team_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;
  IF r.auth_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invite already claimed';
  END IF;

  SELECT id INTO already_linked FROM public.restaurant_team_members
    WHERE auth_user_id = p_auth_user_id LIMIT 1;
  IF already_linked IS NOT NULL THEN
    RAISE EXCEPTION 'This account is already linked to a team member';
  END IF;

  UPDATE public.restaurant_team_members
  SET auth_user_id = p_auth_user_id,
      updated_at = now()
  WHERE id = p_team_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_hiring_for(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_effective_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_team_invite(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_team_invite(uuid, uuid) TO authenticated;
