ALTER TABLE public.people ADD COLUMN IF NOT EXISTS submission_count integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.submit_application(p_owner_slug text, p_job_id uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_source text)
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
BEGIN
  IF v_first = '' OR v_last = '' THEN
    RAISE EXCEPTION 'First and last name are required';
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

  -- Existing non-archived person at this restaurant, matched on normalized contact.
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

    -- Rapid repeat submission: no write at all, no counter increment.
    IF v_last_at > now() - interval '60 seconds' THEN
      RETURN v_match.id;
    END IF;

    -- Per-contact daily cap: silent no-op once 5+ submissions land in 24 hours.
    IF v_last_at > now() - interval '24 hours' AND coalesce(v_match.submission_count, 1) >= 5 THEN
      RETURN v_match.id;
    END IF;

    IF v_last_at > now() - interval '24 hours' THEN
      -- Still inside the daily window: keep counting up.
      IF v_match.state = 'applicant' THEN
        UPDATE public.people
        SET applied_at = now(),
            job_id = coalesce(job_id, p_job_id),
            submission_count = coalesce(submission_count, 1) + 1
        WHERE id = v_match.id;
      ELSE
        UPDATE public.people
        SET submission_count = coalesce(submission_count, 1) + 1
        WHERE id = v_match.id;
      END IF;
    ELSE
      -- Window has rolled over: restart the daily count.
      IF v_match.state = 'applicant' THEN
        UPDATE public.people
        SET applied_at = now(),
            job_id = coalesce(job_id, p_job_id),
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

  INSERT INTO public.people (owner_id, first_name, last_name, email, phone, state, state_changed_at, job_id, source, applied_at, submission_count)
  VALUES (v_owner, v_first, v_last, v_email, v_phone, 'applicant', now(), p_job_id, v_source, now(), 1)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;