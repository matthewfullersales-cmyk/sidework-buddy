
CREATE OR REPLACE FUNCTION public.enforce_applicant_slot_selection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'anon' THEN
    RETURN NEW;
  END IF;

  IF OLD.stage <> 'video_offered' OR OLD.selected_slot IS NOT NULL THEN
    RAISE EXCEPTION 'Slot already confirmed or not offered';
  END IF;

  IF NEW.stage <> 'video_scheduled' THEN
    RAISE EXCEPTION 'Invalid stage transition';
  END IF;

  IF NEW.selected_slot IS NULL OR NOT (NEW.selected_slot = ANY(COALESCE(OLD.offered_slots, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'Selected slot is not among offered slots';
  END IF;

  NEW.id := OLD.id;
  NEW.owner_id := OLD.owner_id;
  NEW.job_id := OLD.job_id;
  NEW.name := OLD.name;
  NEW.first_name := OLD.first_name;
  NEW.last_name := OLD.last_name;
  NEW.email := OLD.email;
  NEW.phone := OLD.phone;
  NEW.role := OLD.role;
  NEW.pitch := OLD.pitch;
  NEW.source := OLD.source;
  NEW.weekly_availability := OLD.weekly_availability;
  NEW.availability_days := OLD.availability_days;
  NEW.availability_hours := OLD.availability_hours;
  NEW.note := OLD.note;
  NEW.applied_at := OLD.applied_at;
  NEW.status := OLD.status;
  NEW.verified := OLD.verified;
  NEW.ai_score := OLD.ai_score;
  NEW.interview_sent_at := OLD.interview_sent_at;
  NEW.interview_notes := OLD.interview_notes;
  NEW.interview_type := OLD.interview_type;
  NEW.offered_slots := OLD.offered_slots;
  NEW.shadow_shift := OLD.shadow_shift;
  NEW.archived := OLD.archived;
  NEW.hired_employee_id := OLD.hired_employee_id;
  NEW.work_experience := OLD.work_experience;
  NEW.special_talents := OLD.special_talents;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_applicant_slot_selection() FROM PUBLIC, anon, authenticated;
