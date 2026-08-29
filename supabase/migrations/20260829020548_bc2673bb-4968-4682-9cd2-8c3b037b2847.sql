DROP INDEX IF EXISTS public.people_auth_user_id_key;

CREATE UNIQUE INDEX people_owner_auth_user_id_key
  ON public.people (owner_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS people_owner_email_idx
  ON public.people (owner_id, lower(btrim(email)))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS people_owner_phone_digits_idx
  ON public.people (owner_id, regexp_replace(phone, '\D', '', 'g'))
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS people_owner_created_at_idx
  ON public.people (owner_id, created_at);

CREATE OR REPLACE FUNCTION public.submit_application(
  p_owner_slug text,
  p_job_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_source text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  IF v_recent >= 20 THEN
    RAISE EXCEPTION 'Too many applications right now. Please try again later.';
  END IF;

  -- Existing non-archived person at this restaurant, matched on normalized contact.
  SELECT id, state, job_id, applied_at, created_at
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
    -- Rapid repeat submission: no write at all.
    IF coalesce(v_match.applied_at, v_match.created_at) > now() - interval '60 seconds' THEN
      RETURN v_match.id;
    END IF;

    IF v_match.state = 'applicant' THEN
      UPDATE public.people
      SET applied_at = now(),
          job_id = coalesce(job_id, p_job_id)
      WHERE id = v_match.id;
    END IF;

    RETURN v_match.id;
  END IF;

  INSERT INTO public.people (owner_id, first_name, last_name, email, phone, state, state_changed_at, job_id, source, applied_at)
  VALUES (v_owner, v_first, v_last, v_email, v_phone, 'applicant', now(), p_job_id, v_source, now())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_application(text, uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_application(text, uuid, text, text, text, text, text) TO anon, authenticated;