
-- job_postings
CREATE TABLE public.job_postings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  role TEXT NOT NULL,
  type TEXT NOT NULL,
  pay_range TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  open BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_postings_owner_id_idx ON public.job_postings(owner_id);

GRANT SELECT ON public.job_postings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_postings TO authenticated;
GRANT ALL ON public.job_postings TO service_role;

ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view job postings"
  ON public.job_postings FOR SELECT
  USING (true);

CREATE POLICY "Owners can insert their own postings"
  ON public.job_postings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their own postings"
  ON public.job_postings FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their own postings"
  ON public.job_postings FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

CREATE TRIGGER update_job_postings_updated_at
  BEFORE UPDATE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- job_applications
CREATE TABLE public.job_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT NOT NULL DEFAULT '',
  role TEXT,
  pitch TEXT,
  source TEXT,
  weekly_availability JSONB,
  availability_days TEXT[] NOT NULL DEFAULT '{}',
  availability_hours TEXT NOT NULL DEFAULT 'Open availability',
  note TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new',
  stage TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  ai_score TEXT,
  interview_sent_at TIMESTAMPTZ,
  interview_notes TEXT,
  interview_type TEXT,
  offered_slots TEXT[],
  selected_slot TEXT,
  shadow_shift JSONB,
  archived BOOLEAN NOT NULL DEFAULT false,
  hired_employee_id TEXT,
  work_experience JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_applications_owner_id_idx ON public.job_applications(owner_id);
CREATE INDEX job_applications_job_id_idx ON public.job_applications(job_id);

-- No SELECT/UPDATE/DELETE for anon. Anon needs INSERT only.
GRANT INSERT ON public.job_applications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

-- Anyone can insert an application; owner_id is force-set by trigger from job_id.
CREATE POLICY "Anyone can submit an application"
  ON public.job_applications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Owners can view applications for their jobs"
  ON public.job_applications FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can update applications for their jobs"
  ON public.job_applications FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can delete applications for their jobs"
  ON public.job_applications FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

-- Trigger: force application owner_id to match the referenced job's owner_id.
CREATE OR REPLACE FUNCTION public.enforce_application_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_owner UUID;
BEGIN
  SELECT owner_id INTO post_owner FROM public.job_postings WHERE id = NEW.job_id;
  IF post_owner IS NULL THEN
    RAISE EXCEPTION 'Referenced job posting % does not exist', NEW.job_id;
  END IF;
  NEW.owner_id := post_owner;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_application_owner_trigger
  BEFORE INSERT OR UPDATE OF job_id ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_application_owner();

CREATE TRIGGER update_job_applications_updated_at
  BEFORE UPDATE ON public.job_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
