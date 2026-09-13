ALTER TABLE public.people ADD COLUMN availability_source text NULL;
ALTER TABLE public.people ADD CONSTRAINT people_availability_source_check
  CHECK (availability_source IS NULL OR availability_source IN ('application','invite','manager','join_link'));

CREATE OR REPLACE FUNCTION public.submit_application(p_owner_slug text, p_job_id uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_source text, p_weekly_availability jsonb, p_years_experience text, p_longest_tenure text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_id uuid;
  v_first text := left(btrim(coalesce(p_first_name, '')), 80);
  v_last  text := left(btrim(coalesce(p_last_name, '')), 80);
  v_email text := nullif(left(btrim(coalesce(p_email, '')), 160), '');
  v_phone text := nullif(left(btrim(coalesce(p_phone, '')), 40), '');
  v_source text := nullif(left(btrim(coalesce(p_source, '')), 40), '');
  v_norm_email text;
  v_norm_phone text;
  v_recent int;
  v_last_at timestamptz;
  v_match RECORD;
  v_avail jsonb := NULL;
  v_clean jsonb := '{}'::jsonb;
  v_day text;
  v_entry jsonb;
  v_kind text;
  v_half text;
  v_years text := nullif(left(btrim(coalesce(p_years_experience, '')), 40), '');
  v_tenure text := nullif(left(btrim(coalesce(p_longest_tenure, '')), 40), '');
  v_exp jsonb := NULL;
BEGIN
  IF v_first = '' OR v_last = '' THEN
    RAISE EXCEPTION 'First and last name are required';
  END IF;

  -- Defensive availability sanitising: only well-formed day entries survive.
  IF p_weekly_availability IS NOT NULL AND jsonb_typeof(p_weekly_availability) = 'object' THEN
    FOREACH v_day IN ARRAY ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] LOOP
      v_entry := p_weekly_availability -> v_day;
      IF v_entry IS NULL OR jsonb_typeof(v_entry) <> 'object' THEN
        CONTINUE;
      END IF;
      v_kind := v_entry ->> 'kind';
      IF v_kind = 'full' OR v_kind = 'none' THEN
        v_clean := v_clean || jsonb_build_object(v_day, jsonb_build_object('kind', v_kind));
      ELSIF v_kind = 'partial' THEN
        v_half := v_entry ->> 'half';
        IF v_half IN ('day','night') THEN
          v_clean := v_clean || jsonb_build_object(v_day, jsonb_build_object('kind','partial','half', v_half));
        END IF;
      END IF;
    END LOOP;
    IF v_clean <> '{}'::jsonb THEN
      v_avail := v_clean;
    END IF;
  END IF;

  IF v_years IS NOT NULL OR v_tenure IS NOT NULL THEN
    v_exp := jsonb_strip_nulls(jsonb_build_object(
      'v', 1,
      'yearsInRestaurants', v_years,
      'longestTenure', v_tenure
    ));
  END IF;

  IF coalesce(btrim(p_owner_slug), '') <> '' THEN
    SELECT owner_id INTO v_owner FROM public.get_public_join_restaurant(btrim(p_owner_slug));
  END IF;

  IF v_owner IS NULL AND p_job_id IS NOT NULL THEN
    SELECT owner_id INTO v_owner FROM public.job_postings WHERE id = p_job_id AND open;
  END IF;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Could not resolve the restaurant for this application';
  END IF;

  v_norm_email := lower(v_email);
  v_norm_phone := nullif(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), '');
  IF v_norm_phone IS NOT NULL AND length(v_norm_phone) < 10 THEN
    v_norm_phone := NULL;
  END IF;

  -- Burst throttle for this restaurant.
  SELECT count(*) INTO v_recent
  FROM public.people
  WHERE owner_id = v_owner
    AND NOT archived
    AND created_at > now() - interval '60 minutes';

  IF v_recent >= 100 THEN
    RAISE EXCEPTION 'Too many applications right now. Please try again later.';
  END IF;

  SELECT id, state, job_id, applied_at, created_at, submission_count
    INTO v_match
  FROM public.people
  WHERE owner_id = v_owner
    AND NOT archived
    AND (
      (v_norm_email IS NOT NULL AND lower(btrim(email)) = v_norm_email)
      OR (v_norm_phone IS NOT NULL AND regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_norm_phone)
    )
  ORDER BY created_at ASC
  LIMIT 1;

  IF FOUND THEN
    v_last_at := coalesce(v_match.applied_at, v_match.created_at);

    IF v_last_at > now() - interval '60 seconds' THEN
      RETURN v_match.id;
    END IF;

    IF v_last_at > now() - interval '24 hours' AND coalesce(v_match.submission_count, 1) >= 5 THEN
      RETURN v_match.id;
    END IF;

    IF v_last_at > now() - interval '24 hours' THEN
      IF v_match.state = 'applicant' THEN
        UPDATE public.people
        SET applied_at = now(),
            job_id = coalesce(job_id, p_job_id),
            availability_source = CASE WHEN weekly_availability IS NULL AND v_avail IS NOT NULL THEN 'application' ELSE availability_source END,
            weekly_availability = coalesce(v_avail, weekly_availability),
            work_experience = coalesce(v_exp, work_experience),
            submission_count = coalesce(submission_count, 1) + 1
        WHERE id = v_match.id;
      ELSE
        UPDATE public.people
        SET submission_count = coalesce(submission_count, 1) + 1
        WHERE id = v_match.id;
      END IF;
    ELSE
      IF v_match.state = 'applicant' THEN
        UPDATE public.people
        SET applied_at = now(),
            job_id = coalesce(job_id, p_job_id),
            availability_source = CASE WHEN weekly_availability IS NULL AND v_avail IS NOT NULL THEN 'application' ELSE availability_source END,
            weekly_availability = coalesce(v_avail, weekly_availability),
            work_experience = coalesce(v_exp, work_experience),
            submission_count = 1
        WHERE id = v_match.id;
      ELSE
        UPDATE public.people
        SET submission_count = 1
        WHERE id = v_match.id;
      END IF;
    END IF;

    RETURN v_match.id;
  END IF;

  INSERT INTO public.people (owner_id, first_name, last_name, email, phone, state, state_changed_at, job_id, source, applied_at, submission_count, weekly_availability, availability_source, work_experience)
  VALUES (v_owner, v_first, v_last, v_email, v_phone, 'applicant', now(), p_job_id, v_source, now(), 1, v_avail, (CASE WHEN v_avail IS NOT NULL THEN 'application' ELSE NULL END), v_exp)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

DROP FUNCTION public.create_person_invite(uuid, text, text, text, text, text);

CREATE FUNCTION public.create_person_invite(p_owner_id uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_primary_role text, p_weekly_availability jsonb DEFAULT NULL)
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
           availability_source = CASE WHEN p_weekly_availability IS NOT NULL AND weekly_availability IS NULL THEN 'manager' ELSE availability_source END,
           weekly_availability = CASE WHEN p_weekly_availability IS NOT NULL AND weekly_availability IS NULL THEN p_weekly_availability ELSE weekly_availability END,
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
    primary_role, approved_roles, invite_token, invited_at, invite_expires_at, joined_via,
    weekly_availability, availability_source
  ) VALUES (
    p_owner_id,
    COALESCE(v_first, 'New'),
    COALESCE(v_last, 'Member'),
    v_email,
    v_phone,
    'active', NULL,
    v_role,
    CASE WHEN v_role IS NULL THEN ARRAY[]::text[] ELSE ARRAY[v_role] END,
    v_token, now(), now() + interval '14 days', 'invite',
    p_weekly_availability,
    (CASE WHEN p_weekly_availability IS NOT NULL THEN 'manager' ELSE NULL END)
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_token, false;
END;
$function$;

DROP FUNCTION public.get_public_person_invite(uuid);

CREATE FUNCTION public.get_public_person_invite(p_token uuid)
 RETURNS TABLE(first_name text, last_name text, email text, phone text, primary_role text, restaurant_name text, expired boolean, claimed boolean, weekly_availability jsonb, availability_source text, applied_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pe.first_name,
         pe.last_name,
         pe.email,
         pe.phone,
         pe.primary_role,
         pr.restaurant_name,
         (pe.invite_expires_at IS NOT NULL AND pe.invite_expires_at < now()) AS expired,
         (pe.auth_user_id IS NOT NULL) AS claimed,
         pe.weekly_availability,
         pe.availability_source,
         pe.applied_at
  FROM public.people pe
  LEFT JOIN public.profiles pr ON pr.id = pe.owner_id
  WHERE p_token IS NOT NULL AND pe.invite_token = p_token
  LIMIT 1
$function$;

UPDATE public.people
SET availability_source = 'application'
WHERE applied_at IS NOT NULL AND source = 'careers' AND auth_user_id IS NULL AND weekly_availability IS NOT NULL AND availability_source IS NULL;