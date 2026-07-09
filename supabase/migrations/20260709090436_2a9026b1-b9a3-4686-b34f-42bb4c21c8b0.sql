CREATE OR REPLACE FUNCTION public.check_reassign_interview_conflict()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_assignee uuid;
  conflict_exists boolean;
BEGIN
  IF NEW.stage <> 'video_scheduled' OR NEW.selected_slot IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.job_applications o
    WHERE o.id <> NEW.id
      AND o.owner_id = NEW.owner_id
      AND o.stage = 'video_scheduled'
      AND o.selected_slot = NEW.selected_slot
      AND (
        (NEW.assigned_to IS NOT NULL AND o.assigned_to IS NOT DISTINCT FROM NEW.assigned_to)
        OR (NEW.assigned_to IS NULL AND o.assigned_to IS NULL)
      )
  ) INTO conflict_exists;

  IF conflict_exists THEN
    RAISE EXCEPTION 'REASSIGN_CONFLICT: assignee already has an interview booked at %', NEW.selected_slot;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_reassign_interview_conflict_trg ON public.job_applications;
CREATE TRIGGER check_reassign_interview_conflict_trg
BEFORE UPDATE OF assigned_to ON public.job_applications
FOR EACH ROW
EXECUTE FUNCTION public.check_reassign_interview_conflict();