ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS current_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_served_at timestamptz,
  ADD COLUMN IF NOT EXISTS responses jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_preview boolean NOT NULL DEFAULT false;