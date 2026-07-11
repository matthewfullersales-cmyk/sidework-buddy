
-- Staff self-fill invite: add token column + two SECURITY DEFINER RPCs

ALTER TABLE public.restaurant_employees
  ADD COLUMN IF NOT EXISTS invite_token uuid UNIQUE;

CREATE OR REPLACE FUNCTION public.get_public_employee_invite(p_token uuid)
RETURNS TABLE(
  id uuid,
  first_name text,
  last_name text,
  name text,
  email text,
  phone text,
  primary_role text,
  restaurant_name text,
  claimed boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.first_name, e.last_name, e.name, e.email, e.phone,
         e.primary_role, p.restaurant_name,
         (e.auth_user_id IS NOT NULL) AS claimed
  FROM public.restaurant_employees e
  LEFT JOIN public.profiles p ON p.id = e.owner_id
  WHERE e.invite_token = p_token
$$;

GRANT EXECUTE ON FUNCTION public.get_public_employee_invite(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_employee_invite(
  p_token uuid,
  p_auth_user_id uuid,
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.restaurant_employees;
  v_first text;
  v_last  text;
  v_phone text;
  v_wa    jsonb;
  v_ec    jsonb;
  v_name  text;
BEGIN
  SELECT * INTO r FROM public.restaurant_employees
    WHERE invite_token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;
  IF r.auth_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invite already claimed';
  END IF;

  v_first := COALESCE(NULLIF(TRIM(p_patch->>'first_name'), ''), r.first_name);
  v_last  := COALESCE(NULLIF(TRIM(p_patch->>'last_name'),  ''), r.last_name);
  v_phone := COALESCE(NULLIF(TRIM(p_patch->>'phone'),      ''), r.phone);
  v_wa    := COALESCE(p_patch->'weekly_availability', r.weekly_availability);
  v_ec    := COALESCE(p_patch->'emergency_contact',  r.emergency_contact);
  v_name  := NULLIF(TRIM(CONCAT_WS(' ', v_first, v_last)), '');
  IF v_name IS NULL THEN v_name := r.name; END IF;

  UPDATE public.restaurant_employees
     SET auth_user_id = p_auth_user_id,
         first_name = v_first,
         last_name  = v_last,
         name       = v_name,
         phone      = v_phone,
         weekly_availability = v_wa,
         emergency_contact   = v_ec,
         personal_info_complete = true,
         onboarding_started     = true,
         invite_token = NULL,
         updated_at = now()
   WHERE id = r.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_employee_invite(uuid, uuid, jsonb) TO anon, authenticated;
