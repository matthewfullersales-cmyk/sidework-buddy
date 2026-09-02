-- 1. slot_id on interviews
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS slot_id uuid NULL REFERENCES public.interview_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS interviews_slot_idx ON public.interviews (slot_id);

-- 2. create_interview_offer: new signature without slots; drop the old one.
DROP FUNCTION IF EXISTS public.create_interview_offer(uuid, text, timestamptz[]);

CREATE OR REPLACE FUNCTION public.create_interview_offer(p_person_id uuid, p_type text)
RETURNS public.interviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_person public.people;
  v_row public.interviews;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_person FROM public.people WHERE id = p_person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Person not found'; END IF;

  IF NOT (auth.uid() = v_person.owner_id
          OR public.can_manage_schedule_for(v_person.owner_id)
          OR public.can_manage_hiring_for(v_person.owner_id)) THEN
    RAISE EXCEPTION 'Not authorized to manage this person';
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('phone','in_person') THEN
    RAISE EXCEPTION 'Invalid interview type: %', p_type;
  END IF;

  -- Release any slot held by an outstanding interview for this person.
  UPDATE public.interview_slots s
     SET status = 'open', interview_id = NULL, updated_at = now()
    FROM public.interviews i
   WHERE i.person_id = p_person_id
     AND i.status IN ('offered','scheduled')
     AND s.id = i.slot_id;

  UPDATE public.interviews
     SET status = 'cancelled', updated_at = now()
   WHERE person_id = p_person_id
     AND status IN ('offered','scheduled');

  INSERT INTO public.interviews (person_id, owner_id, interview_type)
  VALUES (p_person_id, v_person.owner_id, p_type)
  RETURNING * INTO v_row;

  UPDATE public.people
     SET state = 'interviewing',
         state_changed_at = now(),
         updated_at = now()
   WHERE id = p_person_id
     AND state IS DISTINCT FROM 'interviewing';

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_interview_offer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_interview_offer(uuid, text) TO authenticated;

-- 3. Public read: interview + booked slot + live open slots, in one call.
DROP FUNCTION IF EXISTS public.get_public_interview_by_token(uuid);

CREATE OR REPLACE FUNCTION public.get_public_interview_by_token(p_token uuid)
RETURNS TABLE(
  id uuid,
  interview_type text,
  status text,
  first_name text,
  restaurant_name text,
  address text,
  restaurant_phone text,
  booked_date date,
  booked_time time,
  open_slots jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
         AND s.slot_date >= CURRENT_DATE
    ), '[]'::jsonb)
  FROM public.interviews i
  JOIN public.people p ON p.id = i.person_id
  LEFT JOIN public.profiles pr ON pr.id = i.owner_id
  LEFT JOIN public.interview_slots bs ON bs.id = i.slot_id
  WHERE i.public_token = p_token
    AND i.status <> 'cancelled'
$$;

REVOKE ALL ON FUNCTION public.get_public_interview_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_interview_by_token(uuid) TO anon, authenticated;

-- 4. Atomic claim.
CREATE OR REPLACE FUNCTION public.claim_interview_slot(p_token uuid, p_slot_id uuid)
RETURNS TABLE(
  id uuid,
  interview_type text,
  status text,
  first_name text,
  restaurant_name text,
  address text,
  restaurant_phone text,
  booked_date date,
  booked_time time,
  open_slots jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.interviews;
  v_claimed int;
BEGIN
  SELECT * INTO r FROM public.interviews i WHERE i.public_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Interview not found'; END IF;
  IF r.status NOT IN ('offered','scheduled') THEN
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
$$;

REVOKE ALL ON FUNCTION public.claim_interview_slot(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_interview_slot(uuid, uuid) TO anon, authenticated;

-- 5. Legacy confirm_interview_slot is superseded; remove it so nothing calls it.
DROP FUNCTION IF EXISTS public.confirm_interview_slot(uuid, timestamptz);