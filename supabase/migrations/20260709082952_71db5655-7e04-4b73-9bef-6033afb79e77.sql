CREATE OR REPLACE FUNCTION public.applicant_confirm_interview_slot(p_application_id uuid, p_slot text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.job_applications;
  conflict_exists boolean;
BEGIN
  SELECT * INTO r FROM public.job_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;
  IF r.stage <> 'video_offered' OR r.selected_slot IS NOT NULL THEN
    RAISE EXCEPTION 'Slot already confirmed or not offered';
  END IF;
  IF p_slot IS NULL OR NOT (p_slot = ANY(COALESCE(r.offered_slots, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'Selected slot is not among offered slots';
  END IF;

  -- Reject conflicting bookings for the same effective assignee
  -- (same assigned_to when set on both, otherwise same owner_id with both unassigned).
  SELECT EXISTS(
    SELECT 1 FROM public.job_applications o
    WHERE o.id <> r.id
      AND o.stage = 'video_scheduled'
      AND o.selected_slot = p_slot
      AND (
        (r.assigned_to IS NOT NULL AND o.assigned_to = r.assigned_to)
        OR (r.assigned_to IS NULL AND o.assigned_to IS NULL AND o.owner_id = r.owner_id)
      )
  ) INTO conflict_exists;
  IF conflict_exists THEN
    RAISE EXCEPTION 'SLOT_TAKEN: That time was just booked by someone else';
  END IF;

  UPDATE public.job_applications
  SET stage = 'video_scheduled',
      selected_slot = p_slot,
      updated_at = now()
  WHERE id = p_application_id;
END;
$function$;