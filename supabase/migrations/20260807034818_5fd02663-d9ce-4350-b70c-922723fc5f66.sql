ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS menu_test_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.get_menu_test_config(p_owner_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(p.menu_test_config, '{}'::jsonb)
  FROM public.profiles p
  WHERE p.id = p_owner_id
    AND (
      auth.uid() = p_owner_id
      OR EXISTS (
        SELECT 1 FROM public.restaurant_employees e
        WHERE e.owner_id = p_owner_id AND e.auth_user_id = auth.uid()
      )
    )
$$;

REVOKE EXECUTE ON FUNCTION public.get_menu_test_config(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_menu_test_config(uuid) TO authenticated;