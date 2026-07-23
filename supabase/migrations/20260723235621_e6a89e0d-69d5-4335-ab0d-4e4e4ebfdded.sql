
DROP FUNCTION IF EXISTS public.get_menu_bank_meta(uuid);

CREATE FUNCTION public.get_menu_bank_meta(p_owner_id uuid)
RETURNS TABLE(bank_version integer, updated_at timestamptz, food_count integer, drink_count integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    b.bank_version,
    b.updated_at,
    COALESCE((
      SELECT count(*)::int FROM jsonb_array_elements(b.questions) q
      WHERE q->>'source' = 'food'
    ), 0) AS food_count,
    COALESCE((
      SELECT count(*)::int FROM jsonb_array_elements(b.questions) q
      WHERE q->>'source' = 'drink'
    ), 0) AS drink_count
  FROM public.menu_quiz_banks b
  WHERE b.owner_id = p_owner_id
    AND (
      auth.uid() = p_owner_id
      OR EXISTS (
        SELECT 1 FROM public.restaurant_employees e
        WHERE e.owner_id = p_owner_id AND e.auth_user_id = auth.uid()
      )
    )
$$;
