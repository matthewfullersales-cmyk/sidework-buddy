ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS disabled_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_roles jsonb NOT NULL DEFAULT '[]'::jsonb;