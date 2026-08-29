CREATE TABLE public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  interview_type text NOT NULL CHECK (interview_type IN ('phone','in_person')),
  offered_slots timestamptz[] NOT NULL DEFAULT '{}',
  selected_slot timestamptz NULL,
  public_token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','scheduled','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviews TO authenticated;
GRANT ALL ON public.interviews TO service_role;

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view their interviews" ON public.interviews
  FOR SELECT TO authenticated
  USING (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id));
CREATE POLICY "Managers can add interviews" ON public.interviews
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id));
CREATE POLICY "Managers can update their interviews" ON public.interviews
  FOR UPDATE TO authenticated
  USING (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id))
  WITH CHECK (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id));
CREATE POLICY "Managers can delete their interviews" ON public.interviews
  FOR DELETE TO authenticated
  USING (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id));

CREATE UNIQUE INDEX interviews_public_token_key ON public.interviews (public_token);
CREATE INDEX interviews_owner_status_idx ON public.interviews (owner_id, status);
CREATE INDEX interviews_person_idx ON public.interviews (person_id);

CREATE TRIGGER update_interviews_updated_at
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Manager-only: create an interview offer and move the person to 'interviewing'.
CREATE OR REPLACE FUNCTION public.create_interview_offer(p_person_id uuid, p_type text, p_slots timestamptz[])
RETURNS public.interviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_person public.people;
  v_row public.interviews;
  v_slot timestamptz;
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

  IF p_slots IS NULL OR array_length(p_slots, 1) IS NULL
     OR array_length(p_slots, 1) < 1 OR array_length(p_slots, 1) > 5 THEN
    RAISE EXCEPTION 'Offer between 1 and 5 time slots';
  END IF;

  FOREACH v_slot IN ARRAY p_slots LOOP
    IF v_slot <= now() THEN RAISE EXCEPTION 'All offered times must be in the future'; END IF;
  END LOOP;

  UPDATE public.interviews
     SET status = 'cancelled', updated_at = now()
   WHERE person_id = p_person_id
     AND status IN ('offered','scheduled');

  INSERT INTO public.interviews (person_id, owner_id, interview_type, offered_slots)
  VALUES (p_person_id, v_person.owner_id, p_type, p_slots)
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

REVOKE ALL ON FUNCTION public.create_interview_offer(uuid, text, timestamptz[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_interview_offer(uuid, text, timestamptz[]) TO authenticated;

-- Public, token-scoped read. Deliberately named *_by_token: the legacy
-- get_public_interview(uuid) for job_applications still exists.
CREATE OR REPLACE FUNCTION public.get_public_interview_by_token(p_token uuid)
RETURNS TABLE(
  id uuid,
  interview_type text,
  offered_slots timestamptz[],
  selected_slot timestamptz,
  status text,
  first_name text,
  restaurant_name text,
  address text,
  restaurant_phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    i.id,
    i.interview_type,
    i.offered_slots,
    i.selected_slot,
    i.status,
    p.first_name,
    pr.restaurant_name,
    CASE WHEN i.interview_type = 'in_person' THEN NULLIF(TRIM(CONCAT_WS(', ',
      NULLIF(pr.business_info->>'street',''),
      NULLIF(pr.business_info->>'city',''),
      NULLIF(CONCAT_WS(' ', NULLIF(pr.business_info->>'state',''), NULLIF(pr.business_info->>'zip','')), ''))), '') END,
    CASE WHEN i.interview_type = 'in_person' THEN NULLIF(pr.business_info->>'phone','') END
  FROM public.interviews i
  JOIN public.people p ON p.id = i.person_id
  LEFT JOIN public.profiles pr ON pr.id = i.owner_id
  WHERE i.public_token = p_token
    AND i.status <> 'cancelled'
$$;

GRANT EXECUTE ON FUNCTION public.get_public_interview_by_token(uuid) TO anon, authenticated;

-- Public, token-scoped slot confirmation.
CREATE OR REPLACE FUNCTION public.confirm_interview_slot(p_token uuid, p_slot timestamptz)
RETURNS TABLE(
  id uuid,
  interview_type text,
  offered_slots timestamptz[],
  selected_slot timestamptz,
  status text,
  first_name text,
  restaurant_name text,
  address text,
  restaurant_phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.interviews;
BEGIN
  SELECT * INTO r FROM public.interviews WHERE public_token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Interview not found'; END IF;
  IF r.status = 'cancelled' THEN RAISE EXCEPTION 'This interview was cancelled'; END IF;
  IF r.status = 'completed' THEN RAISE EXCEPTION 'This interview is already complete'; END IF;
  IF p_slot IS NULL OR NOT (p_slot = ANY(COALESCE(r.offered_slots, ARRAY[]::timestamptz[]))) THEN
    RAISE EXCEPTION 'That time was not offered';
  END IF;

  IF r.status = 'scheduled' AND r.selected_slot = p_slot THEN
    RETURN QUERY SELECT * FROM public.get_public_interview_by_token(p_token);
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.interviews o
    WHERE o.id <> r.id
      AND o.owner_id = r.owner_id
      AND o.status = 'scheduled'
      AND o.selected_slot = p_slot
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN: That time was just booked by someone else';
  END IF;

  UPDATE public.interviews
     SET selected_slot = p_slot, status = 'scheduled', updated_at = now()
   WHERE id = r.id;

  RETURN QUERY SELECT * FROM public.get_public_interview_by_token(p_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_interview_slot(uuid, timestamptz) TO anon, authenticated;