CREATE OR REPLACE FUNCTION public.enforce_person_self_edit_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  old_j jsonb := to_jsonb(OLD);
  new_j jsonb := to_jsonb(NEW);
  k text;
  allowlist text[] := ARRAY['email','phone','emergency_contact','push_opt_in','updated_at',
                            'weekly_availability','onboarding_started','personal_info_complete'];
BEGIN
  -- Bypass: server-side / service-role callers (no auth context)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bypass: trusted SECURITY DEFINER functions (transaction-local flag)
  IF coalesce(current_setting('app.person_guard_bypass', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Bypass: owner or a manager with schedule/hiring authority for this restaurant
  IF auth.uid() = OLD.owner_id
     OR public.can_manage_schedule_for(OLD.owner_id)
     OR public.can_manage_hiring_for(OLD.owner_id) THEN
    RETURN NEW;
  END IF;

  -- Self-edit: walk every changed key and enforce the allowlist
  FOR k IN
    SELECT key
    FROM jsonb_each(old_j) o
    WHERE new_j -> o.key IS DISTINCT FROM o.value
  LOOP
    IF NOT (k = ANY (allowlist)) THEN
      RAISE EXCEPTION 'people: column "%" cannot be edited by the person', k;
    END IF;

    IF k = 'weekly_availability' AND OLD.personal_info_complete THEN
      RAISE EXCEPTION 'people: weekly_availability cannot be edited after personal info is complete';
    END IF;

    IF k = 'onboarding_started' AND OLD.onboarding_started AND NOT NEW.onboarding_started THEN
      RAISE EXCEPTION 'people: onboarding_started cannot be unset';
    END IF;

    IF k = 'personal_info_complete' AND OLD.personal_info_complete AND NOT NEW.personal_info_complete THEN
      RAISE EXCEPTION 'people: personal_info_complete cannot be unset';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.person_can_manage(p_owner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND (auth.uid() = p_owner_id
          OR public.can_manage_schedule_for(p_owner_id)
          OR public.can_manage_hiring_for(p_owner_id))
$function$;

CREATE OR REPLACE FUNCTION public.create_person_invite(
  p_owner_id uuid, p_first_name text, p_last_name text,
  p_email text, p_phone text, p_primary_role text)
 RETURNS TABLE(person_id uuid, invite_token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token uuid := gen_random_uuid();
  v_id uuid;
  v_role text := NULLIF(TRIM(COALESCE(p_primary_role, '')), '');
BEGIN
  IF NOT public.person_can_manage(p_owner_id) THEN
    RAISE EXCEPTION 'Not authorized to invite staff for this restaurant';
  END IF;

  INSERT INTO public.people (
    owner_id, first_name, last_name, email, phone, state, auth_user_id,
    primary_role, approved_roles, invite_token, invited_at, invite_expires_at, joined_via
  ) VALUES (
    p_owner_id,
    COALESCE(NULLIF(TRIM(COALESCE(p_first_name,'')), ''), 'New'),
    COALESCE(NULLIF(TRIM(COALESCE(p_last_name,'')), ''), 'Member'),
    NULLIF(TRIM(COALESCE(p_email,'')), ''),
    NULLIF(TRIM(COALESCE(p_phone,'')), ''),
    'active', NULL,
    v_role,
    CASE WHEN v_role IS NULL THEN ARRAY[]::text[] ELSE ARRAY[v_role] END,
    v_token, now(), now() + interval '14 days', 'invite'
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.regenerate_person_invite(p_person_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_token uuid := gen_random_uuid();
BEGIN
  SELECT owner_id INTO v_owner FROM public.people WHERE id = p_person_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Person not found';
  END IF;
  IF NOT public.person_can_manage(v_owner) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM set_config('app.person_guard_bypass','on',true);
  UPDATE public.people
     SET invite_token = v_token,
         invite_expires_at = now() + interval '14 days',
         invited_at = now(),
         updated_at = now()
   WHERE id = p_person_id;
  PERFORM set_config('app.person_guard_bypass','off',true);

  RETURN v_token;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_person_invite(p_token uuid)
 RETURNS TABLE(first_name text, primary_role text, restaurant_name text, expired boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pe.first_name, pe.primary_role, pr.restaurant_name,
         (pe.invite_expires_at IS NOT NULL AND pe.invite_expires_at < now()) AS expired
  FROM public.people pe
  LEFT JOIN public.profiles pr ON pr.id = pe.owner_id
  WHERE p_token IS NOT NULL AND pe.invite_token = p_token
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.claim_person_invite(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.people%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row FROM public.people WHERE invite_token = p_token;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;
  IF v_row.invite_expires_at IS NOT NULL AND v_row.invite_expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;
  IF v_row.auth_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invite has already been claimed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.people
     WHERE owner_id = v_row.owner_id AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'This account is already linked to this restaurant';
  END IF;

  PERFORM set_config('app.person_guard_bypass','on',true);
  UPDATE public.people
     SET auth_user_id = auth.uid(),
         onboarding_started = true,
         invite_token = NULL,
         invite_expires_at = NULL,
         updated_at = now()
   WHERE id = v_row.id;
  PERFORM set_config('app.person_guard_bypass','off',true);

  RETURN v_row.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_restaurant_by_slug_v2(
  p_slug text, p_first_name text, p_last_name text,
  p_email text, p_phone text, p_primary_role text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_id uuid;
  v_role text := NULLIF(TRIM(COALESCE(p_primary_role,'')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT r.owner_id INTO v_owner FROM public.get_public_join_restaurant(p_slug) r;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Join link not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.people WHERE owner_id = v_owner AND auth_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'This account is already linked to this restaurant';
  END IF;

  INSERT INTO public.people (
    owner_id, auth_user_id, first_name, last_name, email, phone,
    state, primary_role, joined_via, onboarding_started
  ) VALUES (
    v_owner, auth.uid(),
    COALESCE(NULLIF(TRIM(COALESCE(p_first_name,'')), ''), 'New'),
    COALESCE(NULLIF(TRIM(COALESCE(p_last_name,'')), ''), 'Member'),
    NULLIF(TRIM(COALESCE(p_email,'')), ''),
    NULLIF(TRIM(COALESCE(p_phone,'')), ''),
    'pending_approval', v_role, 'join_link', true
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_pending_person(p_person_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_state text;
BEGIN
  SELECT owner_id, state INTO v_owner, v_state FROM public.people WHERE id = p_person_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Person not found';
  END IF;
  IF NOT public.person_can_manage(v_owner) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_state IS DISTINCT FROM 'pending_approval' THEN
    RAISE EXCEPTION 'Person is not pending approval';
  END IF;

  PERFORM set_config('app.person_guard_bypass','on',true);
  UPDATE public.people
     SET state = 'active', state_changed_at = now(), updated_at = now()
   WHERE id = p_person_id;
  PERFORM set_config('app.person_guard_bypass','off',true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.decline_pending_person(p_person_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_state text;
BEGIN
  SELECT owner_id, state INTO v_owner, v_state FROM public.people WHERE id = p_person_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Person not found';
  END IF;
  IF NOT public.person_can_manage(v_owner) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_state IS DISTINCT FROM 'pending_approval' THEN
    RAISE EXCEPTION 'Person is not pending approval';
  END IF;

  PERFORM set_config('app.person_guard_bypass','on',true);
  UPDATE public.people
     SET state = 'rejected', archived = true, state_changed_at = now(), updated_at = now()
   WHERE id = p_person_id;
  PERFORM set_config('app.person_guard_bypass','off',true);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_person_invite(uuid,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.regenerate_person_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_person_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_restaurant_by_slug_v2(text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_pending_person(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decline_pending_person(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.person_can_manage(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_person_invite(uuid,text,text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.regenerate_person_invite(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_person_invite(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_restaurant_by_slug_v2(text,text,text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_pending_person(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decline_pending_person(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.person_can_manage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_person_invite(uuid) TO anon, authenticated, service_role;