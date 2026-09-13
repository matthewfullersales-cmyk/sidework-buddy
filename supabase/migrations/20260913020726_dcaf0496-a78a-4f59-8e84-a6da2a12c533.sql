CREATE OR REPLACE FUNCTION public.get_employee_context()
 RETURNS TABLE(owner_id uuid, employee_id uuid, restaurant_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pe.owner_id, pe.id AS employee_id, pr.restaurant_name
  FROM public.people pe
  LEFT JOIN public.profiles pr ON pr.id = pe.owner_id
  WHERE pe.auth_user_id = auth.uid()
    AND pe.archived = false
    AND pe.state IN ('hired','active','inactive','pending_approval')
  ORDER BY pe.created_at ASC
$function$;