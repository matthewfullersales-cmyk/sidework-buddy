CREATE OR REPLACE FUNCTION public.get_public_job_restaurant(p_job_id uuid)
RETURNS TABLE(owner_id uuid, restaurant_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT j.owner_id, NULLIF(TRIM(COALESCE(pr.restaurant_name, '')), '')
  FROM public.job_postings j
  LEFT JOIN public.profiles pr ON pr.id = j.owner_id
  WHERE j.id = p_job_id
$function$;

REVOKE ALL ON FUNCTION public.get_public_job_restaurant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_job_restaurant(uuid) TO anon, authenticated;