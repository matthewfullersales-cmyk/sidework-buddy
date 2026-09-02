-- 1. Cancel a single interview (manager-only), releasing its slot back to open.
CREATE OR REPLACE FUNCTION public.cancel_interview(p_interview_id uuid)
RETURNS TABLE(first_name text, email text, restaurant_name text, booked_date date, booked_time time without time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_iv public.interviews;
  v_slot public.interview_slots;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_iv FROM public.interviews WHERE id = p_interview_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Interview not found'; END IF;

  IF NOT (auth.uid() = v_iv.owner_id
          OR public.can_manage_schedule_for(v_iv.owner_id)
          OR public.can_manage_hiring_for(v_iv.owner_id)) THEN
    RAISE EXCEPTION 'Not authorized to manage this interview';
  END IF;

  IF v_iv.slot_id IS NOT NULL THEN
    SELECT * INTO v_slot FROM public.interview_slots WHERE id = v_iv.slot_id;
    UPDATE public.interview_slots
       SET status = 'open', interview_id = NULL, updated_at = now()
     WHERE id = v_iv.slot_id;
  END IF;

  UPDATE public.interviews
     SET status = 'cancelled', slot_id = NULL, updated_at = now()
   WHERE id = v_iv.id;

  RETURN QUERY
  SELECT p.first_name, p.email, pr.restaurant_name, v_slot.slot_date, v_slot.slot_time
    FROM public.people p
    LEFT JOIN public.profiles pr ON pr.id = v_iv.owner_id
   WHERE p.id = v_iv.person_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_interview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_interview(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_interview(uuid) TO authenticated;

-- 2. Close an entire interview day, cancelling anyone booked on it.
CREATE OR REPLACE FUNCTION public.close_interview_day(p_date date)
RETURNS TABLE(interview_id uuid, first_name text, email text, restaurant_name text, booked_date date, booked_time time without time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'A date is required'; END IF;

  SELECT eo.owner_id INTO v_owner FROM public.get_effective_owner() eo;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'No restaurant for this account'; END IF;

  IF NOT (auth.uid() = v_owner
          OR public.can_manage_schedule_for(v_owner)
          OR public.can_manage_hiring_for(v_owner)) THEN
    RAISE EXCEPTION 'Not authorized to manage this restaurant';
  END IF;

  CREATE TEMP TABLE _closing_day ON COMMIT DROP AS
  SELECT s.id AS slot_id, s.interview_id AS iv_id, s.slot_date, s.slot_time
    FROM public.interview_slots s
   WHERE s.owner_id = v_owner
     AND s.slot_date = p_date
     AND s.status = 'booked'
     AND s.interview_id IS NOT NULL;

  UPDATE public.interviews i
     SET status = 'cancelled', slot_id = NULL, updated_at = now()
    FROM _closing_day c
   WHERE i.id = c.iv_id
     AND i.owner_id = v_owner;

  -- The day is gone: booked slots close too, they do not reopen.
  UPDATE public.interview_slots s
     SET status = 'closed', interview_id = NULL, updated_at = now()
   WHERE s.owner_id = v_owner
     AND s.slot_date = p_date
     AND s.status IN ('open', 'booked');

  RETURN QUERY
  SELECT c.iv_id, p.first_name, p.email, pr.restaurant_name, c.slot_date, c.slot_time
    FROM _closing_day c
    JOIN public.interviews i ON i.id = c.iv_id
    JOIN public.people p ON p.id = i.person_id
    LEFT JOIN public.profiles pr ON pr.id = v_owner;
END;
$function$;

REVOKE ALL ON FUNCTION public.close_interview_day(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_interview_day(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_interview_day(date) TO authenticated;

-- 3. Token page: keep working after a cancellation, and stop hiding today's
-- remaining slots when the database's UTC date has already rolled over.
CREATE OR REPLACE FUNCTION public.get_public_interview_by_token(p_token uuid)
RETURNS TABLE(id uuid, interview_type text, status text, first_name text, restaurant_name text, address text, restaurant_phone text, booked_date date, booked_time time without time zone, open_slots jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    i.id,
    i.interview_type,
    i.status,
    p.first_name,
    pr.restaurant_name,
    CASE WHEN i.interview_type = 'in_person' THEN NULLIF(TRIM(CONCAT_WS(', ',
      NULLIF(pr.business_info->>'street',''),
      NULLIF(pr.business_info->>'city',''),
      NULLIF(CONCAT_WS(' ', NULLIF(pr.business_info->>'state',''), NULLIF(pr.business_info->>'zip','')), ''))), '') END,
    CASE WHEN i.interview_type = 'in_person' THEN NULLIF(pr.business_info->>'phone','') END,
    bs.slot_date,
    bs.slot_time,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'slot_date', s.slot_date, 'slot_time', s.slot_time)
                       ORDER BY s.slot_date, s.slot_time)
        FROM public.interview_slots s
       WHERE s.owner_id = i.owner_id
         AND s.status = 'open'
         AND s.slot_date >= (CURRENT_DATE - 1)
    ), '[]'::jsonb)
  FROM public.interviews i
  JOIN public.people p ON p.id = i.person_id
  LEFT JOIN public.profiles pr ON pr.id = i.owner_id
  LEFT JOIN public.interview_slots bs ON bs.id = i.slot_id
  WHERE i.public_token = p_token
$function$;

REVOKE ALL ON FUNCTION public.get_public_interview_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_interview_by_token(uuid) TO anon, authenticated;

-- 4. A cancelled interview can still claim a new time; concurrency logic unchanged.
CREATE OR REPLACE FUNCTION public.claim_interview_slot(p_token uuid, p_slot_id uuid)
RETURNS TABLE(id uuid, interview_type text, status text, first_name text, restaurant_name text, address text, restaurant_phone text, booked_date date, booked_time time without time zone, open_slots jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.interviews;
  v_claimed int;
BEGIN
  SELECT * INTO r FROM public.interviews i WHERE i.public_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Interview not found'; END IF;
  IF r.status NOT IN ('offered','scheduled','cancelled') THEN
    RAISE EXCEPTION 'This interview is no longer open';
  END IF;

  IF r.slot_id IS NOT NULL AND r.slot_id = p_slot_id THEN
    RETURN QUERY SELECT * FROM public.get_public_interview_by_token(p_token);
    RETURN;
  END IF;

  -- Conditional update IS the concurrency guarantee.
  UPDATE public.interview_slots s
     SET status = 'booked', interview_id = r.id, updated_at = now()
   WHERE s.id = p_slot_id
     AND s.owner_id = r.owner_id
     AND s.status = 'open';
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RAISE EXCEPTION 'SLOT_TAKEN: That time was just taken';
  END IF;

  -- Release the previously held slot, if any.
  IF r.slot_id IS NOT NULL THEN
    UPDATE public.interview_slots s
       SET status = 'open', interview_id = NULL, updated_at = now()
     WHERE s.id = r.slot_id;
  END IF;

  UPDATE public.interviews i
     SET slot_id = p_slot_id, status = 'scheduled', updated_at = now()
   WHERE i.id = r.id;

  RETURN QUERY SELECT * FROM public.get_public_interview_by_token(p_token);
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_interview_slot(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_interview_slot(uuid, uuid) TO anon, authenticated;
