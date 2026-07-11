-- 1. Tighten claim_team_invite: allow same-owner employee overlap (bartender + manager),
--    reject different-owner employee overlap (cross-restaurant leak).
CREATE OR REPLACE FUNCTION public.claim_team_invite(p_team_member_id uuid, p_auth_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.restaurant_team_members;
  already_linked uuid;
  employee_owner uuid;
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

  -- Cross-restaurant guard: if this auth user is already an employee, they must
  -- be an employee at the SAME owner as this team_member row (dual-role at one
  -- restaurant), otherwise reject to avoid accidental cross-restaurant grants.
  SELECT e.owner_id INTO employee_owner
    FROM public.restaurant_employees e
    WHERE e.auth_user_id = p_auth_user_id
    LIMIT 1;
  IF employee_owner IS NOT NULL AND employee_owner <> r.owner_id THEN
    RAISE EXCEPTION 'This account is already an employee at another restaurant';
  END IF;

  UPDATE public.restaurant_team_members
  SET auth_user_id = p_auth_user_id,
      updated_at = now()
  WHERE id = p_team_member_id;
END;
$function$;

-- 2. Enable Realtime on public.shifts so concurrent managers see each other's
--    edits live. REPLICA IDENTITY FULL so DELETE payloads carry the old row.
ALTER TABLE public.shifts REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'shifts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
  END IF;
END $$;