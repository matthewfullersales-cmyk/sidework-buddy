
-- Drop the direct-write path.
DROP POLICY IF EXISTS "Applicant can confirm offered interview slot" ON public.job_applications;
REVOKE UPDATE (stage, selected_slot) ON public.job_applications FROM anon;
DROP TRIGGER IF EXISTS enforce_applicant_slot_selection_trg ON public.job_applications;
DROP FUNCTION IF EXISTS public.enforce_applicant_slot_selection();

-- Purpose-built RPC.
CREATE OR REPLACE FUNCTION public.applicant_confirm_interview_slot(
  p_application_id UUID,
  p_slot TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.job_applications;
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

  UPDATE public.job_applications
  SET stage = 'video_scheduled',
      selected_slot = p_slot,
      updated_at = now()
  WHERE id = p_application_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.applicant_confirm_interview_slot(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.applicant_confirm_interview_slot(UUID, TEXT) TO anon, authenticated;
