DROP FUNCTION IF EXISTS public.get_menu_bank_meta(uuid);
CREATE FUNCTION public.get_menu_bank_meta(p_owner_id uuid)
RETURNS TABLE(bank_version integer, updated_at timestamp with time zone, food_count integer, drink_count integer, dessert_count integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    b.bank_version,
    b.updated_at,
    COALESCE((SELECT count(*)::int FROM jsonb_array_elements(b.questions) q WHERE q->>'source' = 'food' OR q->>'source' IS NULL), 0) AS food_count,
    COALESCE((SELECT count(*)::int FROM jsonb_array_elements(b.questions) q WHERE q->>'source' = 'drink'), 0) AS drink_count,
    COALESCE((SELECT count(*)::int FROM jsonb_array_elements(b.questions) q WHERE q->>'source' = 'dessert'), 0) AS dessert_count
  FROM public.menu_quiz_banks b
  WHERE b.owner_id = p_owner_id
    AND (
      auth.uid() = p_owner_id
      OR EXISTS (
        SELECT 1 FROM public.restaurant_employees e
        WHERE e.owner_id = p_owner_id AND e.auth_user_id = auth.uid()
      )
    )
$function$;
REVOKE EXECUTE ON FUNCTION public.get_menu_bank_meta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_menu_bank_meta(uuid) TO authenticated, service_role;