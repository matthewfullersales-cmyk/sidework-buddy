
ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS shadow_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shadow_response_note TEXT;

-- Public read: minimal fields for the applicant confirmation page
CREATE OR REPLACE FUNCTION public.get_public_shadow_shift(p_application_id UUID)
RETURNS TABLE(
  id UUID,
  first_name TEXT,
  name TEXT,
  role TEXT,
  stage TEXT,
  shadow_shift JSONB,
  shadow_confirmed_at TIMESTAMPTZ,
  shadow_response_note TEXT,
  restaurant_name TEXT,
  job_title TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.first_name,
    a.name,
    a.role,
    a.stage,
    a.shadow_shift::jsonb,
    a.shadow_confirmed_at,
    a.shadow_response_note,
    p.restaurant_name,
    jp.title AS job_title
  FROM public.job_applications a
  LEFT JOIN public.job_postings jp ON jp.id = a.job_id
  LEFT JOIN public.profiles p ON p.id = a.owner_id
  WHERE a.id = p_application_id
$$;

GRANT EXECUTE ON FUNCTION public.get_public_shadow_shift(UUID) TO anon, authenticated;

-- Public action: applicant confirms the shadow shift
CREATE OR REPLACE FUNCTION public.applicant_confirm_shadow_shift(p_application_id UUID)
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
  IF r.stage <> 'shadow_scheduled' OR r.shadow_shift IS NULL THEN
    RAISE EXCEPTION 'No shadow shift to confirm';
  END IF;

  UPDATE public.job_applications
  SET shadow_confirmed_at = now(),
      shadow_response_note = NULL,
      updated_at = now()
  WHERE id = p_application_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.applicant_confirm_shadow_shift(UUID) TO anon, authenticated;

-- Public action: applicant declines (stores a note; manager reschedules)
CREATE OR REPLACE FUNCTION public.applicant_decline_shadow_shift(p_application_id UUID, p_note TEXT)
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
  IF r.stage <> 'shadow_scheduled' OR r.shadow_shift IS NULL THEN
    RAISE EXCEPTION 'No shadow shift to decline';
  END IF;

  UPDATE public.job_applications
  SET shadow_confirmed_at = NULL,
      shadow_response_note = COALESCE(NULLIF(TRIM(p_note), ''), 'Can''t make it'),
      updated_at = now()
  WHERE id = p_application_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.applicant_decline_shadow_shift(UUID, TEXT) TO anon, authenticated;
