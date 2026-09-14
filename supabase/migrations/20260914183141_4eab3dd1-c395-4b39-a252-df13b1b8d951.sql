CREATE OR REPLACE FUNCTION public.get_public_job_posting(p_job_id uuid)
RETURNS TABLE(
  id uuid,
  title text,
  role text,
  type text,
  pay_range text,
  description text,
  posted_at timestamp with time zone,
  open boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT j.id, j.title, j.role, j.type, j.pay_range, j.description, j.posted_at, j.open
  FROM public.job_postings j
  WHERE j.id = p_job_id
$$;

REVOKE ALL ON FUNCTION public.get_public_job_posting(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_job_posting(uuid) TO anon, authenticated, service_role;

CREATE POLICY "Owners can view their own postings"
  ON public.job_postings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);