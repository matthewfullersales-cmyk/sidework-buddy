
-- 1) Team roster table
CREATE TABLE public.restaurant_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_team_members TO authenticated;
GRANT ALL ON public.restaurant_team_members TO service_role;

ALTER TABLE public.restaurant_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their team roster"
  ON public.restaurant_team_members FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY "Owners can insert their team roster"
  ON public.restaurant_team_members FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their team roster"
  ON public.restaurant_team_members FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their team roster"
  ON public.restaurant_team_members FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

CREATE TRIGGER update_restaurant_team_members_updated_at
  BEFORE UPDATE ON public.restaurant_team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_restaurant_team_members_owner ON public.restaurant_team_members(owner_id);

-- 2) assigned_to column on applications
ALTER TABLE public.job_applications
  ADD COLUMN assigned_to UUID REFERENCES public.restaurant_team_members(id) ON DELETE SET NULL;

-- 3) Public interview details RPC
CREATE OR REPLACE FUNCTION public.get_public_interview(p_application_id UUID)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  name TEXT,
  phone TEXT,
  role TEXT,
  stage TEXT,
  interview_type TEXT,
  offered_slots TEXT[],
  selected_slot TEXT,
  interview_notes TEXT,
  restaurant_name TEXT,
  job_title TEXT,
  assignee_name TEXT,
  assignee_email TEXT,
  assignee_phone TEXT
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
    a.phone,
    a.role,
    a.stage,
    a.interview_type,
    a.offered_slots,
    a.selected_slot,
    a.interview_notes,
    p.restaurant_name,
    jp.title AS job_title,
    tm.name AS assignee_name,
    tm.email AS assignee_email,
    tm.phone AS assignee_phone
  FROM public.job_applications a
  LEFT JOIN public.job_postings jp ON jp.id = a.job_id
  LEFT JOIN public.profiles p ON p.id = a.owner_id
  LEFT JOIN public.restaurant_team_members tm ON tm.id = a.assigned_to
  WHERE a.id = p_application_id
$$;

GRANT EXECUTE ON FUNCTION public.get_public_interview(UUID) TO anon, authenticated;

-- 4) Public host complete interview RPC (anon can save notes / mark done)
CREATE OR REPLACE FUNCTION public.host_complete_interview(
  p_application_id UUID,
  p_notes TEXT
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
  IF r.stage NOT IN ('video_scheduled', 'interviewed') THEN
    RAISE EXCEPTION 'Interview is not in a completable stage';
  END IF;

  UPDATE public.job_applications
  SET stage = 'interviewed',
      interview_notes = COALESCE(NULLIF(p_notes, ''), interview_notes),
      updated_at = now()
  WHERE id = p_application_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.host_complete_interview(UUID, TEXT) TO anon, authenticated;
