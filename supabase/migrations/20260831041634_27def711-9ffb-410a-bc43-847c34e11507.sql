-- "Never configured" must be representable. NOT NULL DEFAULT '[]' made
-- "untouched" and "configured, nothing disabled" indistinguishable, which
-- caused a stale local cache to overwrite a legitimate empty server value.
--   NULL = never configured
--   []   = configured, nothing disabled / no custom roles
ALTER TABLE public.profiles
  ALTER COLUMN disabled_roles DROP NOT NULL,
  ALTER COLUMN disabled_roles SET DEFAULT NULL,
  ALTER COLUMN custom_roles   DROP NOT NULL,
  ALTER COLUMN custom_roles   SET DEFAULT NULL;

-- Every existing row holds '[]' purely from the previous migration's default,
-- never from an owner actually saving. Reset those to NULL so they read as
-- "not configured". Rows with real content (none today) are left untouched.
UPDATE public.profiles
   SET disabled_roles = NULL
 WHERE disabled_roles = '[]'::jsonb;

UPDATE public.profiles
   SET custom_roles = NULL
 WHERE custom_roles = '[]'::jsonb;