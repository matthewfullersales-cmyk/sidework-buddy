DROP FUNCTION IF EXISTS public.create_shadow_shift(uuid, text, date, time without time zone, uuid, text);
DROP FUNCTION IF EXISTS public.update_shadow_shift(uuid, date, time without time zone, uuid, text);

REVOKE ALL ON FUNCTION public.get_public_shadow_shift_by_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_shadow_shift_by_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decline_shadow_shift_by_token(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_shadow_shift_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_shadow_shift_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decline_shadow_shift_by_token(uuid) TO anon, authenticated;