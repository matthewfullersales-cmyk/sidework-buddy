
-- 1. Drop reassign conflict trigger + function
DROP TRIGGER IF EXISTS check_reassign_interview_conflict_trg ON public.job_applications;
DROP FUNCTION IF EXISTS public.check_reassign_interview_conflict();

-- 2. Drop assigned_to column (also drops FK to restaurant_team_members)
ALTER TABLE public.job_applications DROP COLUMN IF EXISTS assigned_to;

-- 3. Replace get_public_interview without assignee columns
DROP FUNCTION IF EXISTS public.get_public_interview(uuid);
CREATE OR REPLACE FUNCTION public.get_public_interview(p_application_id uuid)
 RETURNS TABLE(id uuid, first_name text, name text, phone text, role text, stage text, interview_type text, offered_slots text[], selected_slot text, interview_notes text, restaurant_name text, job_title text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT a.id, a.first_name, a.name, a.phone, a.role, a.stage,
         a.interview_type, a.offered_slots, a.selected_slot, a.interview_notes,
         p.restaurant_name, jp.title
  FROM public.job_applications a
  LEFT JOIN public.job_postings jp ON jp.id = a.job_id
  LEFT JOIN public.profiles p ON p.id = a.owner_id
  WHERE a.id = p_application_id
$$;
GRANT EXECUTE ON FUNCTION public.get_public_interview(uuid) TO anon, authenticated;

-- 4. Simplify applicant_confirm_interview_slot (no assigned_to)
CREATE OR REPLACE FUNCTION public.applicant_confirm_interview_slot(p_application_id uuid, p_slot text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r public.job_applications; conflict_exists boolean;
BEGIN
  SELECT * INTO r FROM public.job_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF r.stage <> 'video_offered' OR r.selected_slot IS NOT NULL THEN
    RAISE EXCEPTION 'Slot already confirmed or not offered';
  END IF;
  IF p_slot IS NULL OR NOT (p_slot = ANY(COALESCE(r.offered_slots, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'Selected slot is not among offered slots';
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.job_applications o
    WHERE o.id <> r.id AND o.owner_id = r.owner_id
      AND o.stage = 'video_scheduled' AND o.selected_slot = p_slot
  ) INTO conflict_exists;
  IF conflict_exists THEN
    RAISE EXCEPTION 'SLOT_TAKEN: That time was just booked by someone else';
  END IF;
  UPDATE public.job_applications
  SET stage = 'video_scheduled', selected_slot = p_slot, updated_at = now()
  WHERE id = p_application_id;
END;
$$;

-- 5. Drop team-invite RPCs, name-sync trigger/function, and the table
DROP FUNCTION IF EXISTS public.claim_team_invite(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_public_team_invite(uuid);
DROP TRIGGER IF EXISTS trg_sync_team_member_name ON public.restaurant_team_members;
DROP FUNCTION IF EXISTS public.sync_team_member_name();
DROP TABLE IF EXISTS public.restaurant_team_members CASCADE;

-- 6. Simplify effective owner and permission helpers to owner-only
CREATE OR REPLACE FUNCTION public.get_effective_owner()
 RETURNS TABLE(owner_id uuid, restaurant_name text, acting text, can_manage_hiring boolean, can_manage_schedule boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.id, p.restaurant_name, 'owner'::text, true, true
  FROM public.profiles p
  WHERE p.id = auth.uid() AND p.role = 'owner'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_manage_hiring_for(p_owner_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT auth.uid() = p_owner_id $$;

CREATE OR REPLACE FUNCTION public.can_manage_schedule_for(p_owner_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT auth.uid() = p_owner_id $$;

-- 7. Simplify coworker names (drop team-member branch)
CREATE OR REPLACE FUNCTION public.get_restaurant_coworker_names(p_owner_id uuid)
 RETURNS TABLE(employee_id uuid, first_name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT e.id, COALESCE(NULLIF(TRIM(e.first_name), ''), split_part(COALESCE(e.name,''), ' ', 1))
  FROM public.restaurant_employees e
  WHERE e.owner_id = p_owner_id
    AND (
      auth.uid() = p_owner_id
      OR EXISTS (
        SELECT 1 FROM public.restaurant_employees me
        WHERE me.owner_id = p_owner_id AND me.auth_user_id = auth.uid()
      )
    )
$$;
