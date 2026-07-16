CREATE OR REPLACE FUNCTION public.claim_employee_invite(p_token uuid, p_auth_user_id uuid, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.restaurant_employees;
  v_first text;
  v_last  text;
  v_phone text;
  v_role  text;
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
  v_role  := COALESCE(NULLIF(TRIM(p_patch->>'primary_role'), ''), r.primary_role);
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
         primary_role = v_role,
         weekly_availability = v_wa,
         emergency_contact   = v_ec,
         personal_info_complete = true,
         onboarding_started     = true,
         invite_token = NULL,
         updated_at = now()
   WHERE id = r.id;
END;
$function$;