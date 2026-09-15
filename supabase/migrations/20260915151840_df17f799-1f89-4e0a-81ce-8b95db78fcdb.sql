CREATE OR REPLACE FUNCTION public.get_public_jobs_by_slug(p_slug text)
RETURNS TABLE(
  restaurant_name text,
  job_id uuid,
  title text,
  job_type text,
  pay_range text,
  description text,
  posted_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NULLIF(TRIM(COALESCE(pr.restaurant_name, '')), ''),
         j.id, j.title, j.type, j.pay_range, j.description, j.posted_at
  FROM public.profiles pr
  LEFT JOIN public.job_postings j
    ON j.owner_id = pr.id AND j.open = true
  WHERE pr.slug = LOWER(TRIM(p_slug))
  ORDER BY j.posted_at DESC
$function$;

REVOKE ALL ON FUNCTION public.get_public_jobs_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_jobs_by_slug(text) TO anon, authenticated, service_role;