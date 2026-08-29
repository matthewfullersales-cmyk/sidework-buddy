CREATE OR REPLACE FUNCTION public.confirm_interview_slot(p_token uuid, p_slot timestamp with time zone)
 RETURNS TABLE(id uuid, interview_type text, offered_slots timestamp with time zone[], selected_slot timestamp with time zone, status text, first_name text, restaurant_name text, address text, restaurant_phone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.interviews;
BEGIN
  SELECT * INTO r FROM public.interviews i WHERE i.public_token = p_token FOR UPDATE;
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

  UPDATE public.interviews AS i
     SET selected_slot = p_slot, status = 'scheduled', updated_at = now()
   WHERE i.id = r.id;

  RETURN QUERY SELECT * FROM public.get_public_interview_by_token(p_token);
END;
$function$;