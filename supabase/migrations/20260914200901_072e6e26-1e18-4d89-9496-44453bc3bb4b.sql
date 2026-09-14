-- Both functions authorized staff reads against public.restaurant_employees,
-- which has been empty since the roster moved to public.people. The EXISTS
-- could never be true, so the owner's own read worked while every staff read
-- returned no rows. Point both at public.people using the same staff predicate
-- as get_employee_context, so both surfaces agree on who counts as staff.
-- This also removes the last two references to restaurant_employees.

CREATE OR REPLACE FUNCTION public.get_menu_test_config(p_owner_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(p.menu_test_config, '{}'::jsonb)
  FROM public.profiles p
  WHERE p.id = p_owner_id
    AND (
      auth.uid() = p_owner_id
      OR EXISTS (
        SELECT 1 FROM public.people e
        WHERE e.owner_id = p_owner_id
          AND e.auth_user_id = auth.uid()
          AND e.archived = false
          AND e.state IN ('hired','active','inactive','pending_approval')
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.get_menu_bank_meta(p_owner_id uuid)
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
        SELECT 1 FROM public.people e
        WHERE e.owner_id = p_owner_id
          AND e.auth_user_id = auth.uid()
          AND e.archived = false
          AND e.state IN ('hired','active','inactive','pending_approval')
      )
    )
$function$;

-- CREATE OR REPLACE preserves the ACL, but re-assert it explicitly so a future
-- drop-and-recreate cannot silently widen access. anon is deliberately excluded.
REVOKE ALL ON FUNCTION public.get_menu_test_config(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_menu_bank_meta(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_menu_test_config(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_menu_bank_meta(uuid) TO authenticated, service_role;
