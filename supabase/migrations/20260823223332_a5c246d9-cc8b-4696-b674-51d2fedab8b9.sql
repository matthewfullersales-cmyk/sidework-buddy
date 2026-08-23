ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS resume_counts jsonb NOT NULL DEFAULT '{}'::jsonb;