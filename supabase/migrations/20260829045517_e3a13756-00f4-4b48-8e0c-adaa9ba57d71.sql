CREATE OR REPLACE FUNCTION public.create_person_invite(p_owner_id uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_primary_role text)
 RETURNS TABLE(person_id uuid, invite_token uuid, matched_existing boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token uuid := gen_random_uuid();
  v_id uuid;
  v_role text := NULLIF(TRIM(COALESCE(p_primary_role, '')), '');
  v_first text := NULLIF(TRIM(COALESCE(p_first_name,'')), '');
  v_last text := NULLIF(TRIM(COALESCE(p_last_name,'')), '');
  v_email text := NULLIF(TRIM(COALESCE(p_email,'')), '');
  v_phone text := NULLIF(TRIM(COALESCE(p_phone,'')), '');
  v_norm_email text;
  v_norm_phone text;
  v_match public.people%ROWTYPE;
  v_effective_role text;
BEGIN
  IF NOT public.person_can_manage(p_owner_id) THEN
    RAISE EXCEPTION 'Not authorized to invite staff for this restaurant';
  END IF;

  v_norm_email := lower(v_email);
  v_norm_phone := nullif(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), '');
  IF v_norm_phone IS NOT NULL AND length(v_norm_phone) < 10 THEN
    v_norm_phone := NULL;
  END IF;

  SELECT * INTO v_match
  FROM public.people
  WHERE owner_id = p_owner_id
    AND NOT archived
    AND (
      (v_norm_email IS NOT NULL AND lower(btrim(email)) = v_norm_email)
      OR (v_norm_phone IS NOT NULL AND regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_norm_phone)
    )
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_match.auth_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'This person is already on the roster with an account';
    END IF;

    -- Effective role: the existing row's primary_role if non-blank, otherwise the passed-in role.
    v_effective_role := COALESCE(
      NULLIF(TRIM(COALESCE(v_match.primary_role, '')), ''),
      v_role
    );

    PERFORM set_config('app.person_guard_bypass','on',true);
    UPDATE public.people
       SET invite_token = v_token,
           invite_expires_at = now() + interval '14 days',
           invited_at = now(),
           joined_via = 'invite',
           state = CASE WHEN state IN ('applicant','interviewing','shadow','hired','inactive') THEN 'active' ELSE state END,
           state_changed_at = CASE WHEN state IN ('applicant','interviewing','shadow','hired','inactive') THEN now() ELSE state_changed_at END,
           first_name = CASE WHEN NULLIF(TRIM(COALESCE(first_name,'')),'') IS NULL THEN COALESCE(v_first, first_name) ELSE first_name END,
           last_name = CASE WHEN NULLIF(TRIM(COALESCE(last_name,'')),'') IS NULL THEN COALESCE(v_last, last_name) ELSE last_name END,
           email = CASE WHEN NULLIF(TRIM(COALESCE(email,'')),'') IS NULL THEN COALESCE(v_email, email) ELSE email END,
           phone = CASE WHEN NULLIF(TRIM(COALESCE(phone,'')),'') IS NULL THEN COALESCE(v_phone, phone) ELSE phone END,
           primary_role = CASE WHEN NULLIF(TRIM(COALESCE(primary_role,'')),'') IS NULL THEN COALESCE(v_role, primary_role) ELSE primary_role END,
           approved_roles = CASE
             WHEN v_effective_role IS NOT NULL
              AND NOT (v_effective_role = ANY(COALESCE(approved_roles, ARRAY[]::text[])))
             THEN COALESCE(approved_roles, ARRAY[]::text[]) || v_effective_role
             ELSE approved_roles
           END,
           updated_at = now()
     WHERE id = v_match.id;
    PERFORM set_config('app.person_guard_bypass','off',true);

    RETURN QUERY SELECT v_match.id, v_token, true;
    RETURN;
  END IF;

  INSERT INTO public.people (
    owner_id, first_name, last_name, email, phone, state, auth_user_id,
    primary_role, approved_roles, invite_token, invited_at, invite_expires_at, joined_via
  ) VALUES (
    p_owner_id,
    COALESCE(v_first, 'New'),
    COALESCE(v_last, 'Member'),
    v_email,
    v_phone,
    'active', NULL,
    v_role,
    CASE WHEN v_role IS NULL THEN ARRAY[]::text[] ELSE ARRAY[v_role] END,
    v_token, now(), now() + interval '14 days', 'invite'
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_token, false;
END;
$function$;