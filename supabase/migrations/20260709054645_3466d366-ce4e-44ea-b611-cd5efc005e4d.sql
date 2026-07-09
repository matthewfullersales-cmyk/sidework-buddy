
REVOKE EXECUTE ON FUNCTION public.enforce_application_owner() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_application_owner() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_application_owner() FROM authenticated;
