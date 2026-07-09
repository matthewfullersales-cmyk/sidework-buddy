
-- Public RPC to fetch minimal hire-invite details for the anonymous /hired/$id page.
CREATE OR REPLACE FUNCTION public.get_public_hire_invite(p_application_id uuid)
RETURNS TABLE(
  id uuid,
  first_name text,
  last_name text,
  name text,
  email text,
  phone text,
  role text,
  stage text,
  hired_employee_id text,
  restaurant_name text,
  job_title text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    a.id,
    a.first_name,
    a.last_name,
    a.name,
    a.email,
    a.phone,
    a.role,
    a.stage,
    a.hired_employee_id,
    p.restaurant_name,
    jp.title AS job_title
  FROM public.job_applications a
  LEFT JOIN public.job_postings jp ON jp.id = a.job_id
  LEFT JOIN public.profiles p ON p.id = a.owner_id
  WHERE a.id = p_application_id
    AND a.stage = 'hired'
$$;

GRANT EXECUTE ON FUNCTION public.get_public_hire_invite(uuid) TO anon, authenticated;

-- Public RPC to claim the hire invite by linking the new employee profile back to the application.
-- Only works once, only while stage='hired' and hired_employee_id is empty/unset, and only if a profile row exists.
CREATE OR REPLACE FUNCTION public.claim_hire_invite(p_application_id uuid, p_employee_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.job_applications;
  prof_exists boolean;
BEGIN
  SELECT * INTO r FROM public.job_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;
  IF r.stage <> 'hired' THEN
    RAISE EXCEPTION 'Application is not in hired stage';
  END IF;
  IF r.hired_employee_id IS NOT NULL AND r.hired_employee_id <> '' AND r.hired_employee_id !~ '^e_' THEN
    -- Already claimed by a real profile (not a placeholder local employee id like "e_...")
    RAISE EXCEPTION 'Hire invite already claimed';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = p_employee_profile_id) INTO prof_exists;
  IF NOT prof_exists THEN
    RAISE EXCEPTION 'Employee profile not found';
  END IF;

  UPDATE public.job_applications
  SET hired_employee_id = p_employee_profile_id::text,
      updated_at = now()
  WHERE id = p_application_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_hire_invite(uuid, uuid) TO anon, authenticated;
