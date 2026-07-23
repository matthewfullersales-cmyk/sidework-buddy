
-- 1. quiz_attempts table
CREATE TABLE public.quiz_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.restaurant_employees(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  questions JSONB NOT NULL,
  question_count INTEGER NOT NULL,
  score INTEGER,
  passed BOOLEAN,
  distraction_flagged BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX quiz_attempts_employee_video_idx ON public.quiz_attempts(employee_id, video_id);
CREATE INDEX quiz_attempts_owner_idx ON public.quiz_attempts(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage all attempts in their restaurant"
  ON public.quiz_attempts
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Employees can insert their own attempts"
  ON public.quiz_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_employees e
      WHERE e.id = quiz_attempts.employee_id
        AND e.auth_user_id = auth.uid()
        AND e.owner_id = quiz_attempts.owner_id
    )
  );

CREATE POLICY "Employees can view their own attempts"
  ON public.quiz_attempts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_employees e
      WHERE e.id = quiz_attempts.employee_id
        AND e.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Employees can update their own attempts"
  ON public.quiz_attempts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_employees e
      WHERE e.id = quiz_attempts.employee_id
        AND e.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_employees e
      WHERE e.id = quiz_attempts.employee_id
        AND e.auth_user_id = auth.uid()
    )
  );

CREATE TRIGGER update_quiz_attempts_updated_at
  BEFORE UPDATE ON public.quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. menu_quiz_banks
CREATE TABLE public.menu_quiz_banks (
  owner_id UUID NOT NULL PRIMARY KEY,
  questions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_quiz_banks TO authenticated;
GRANT ALL ON public.menu_quiz_banks TO service_role;

ALTER TABLE public.menu_quiz_banks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their own menu quiz bank"
  ON public.menu_quiz_banks
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Employees need to know the bank exists (question count) but never see the answers.
-- We keep this internal — the server function returns only sanitized questions.

CREATE TRIGGER update_menu_quiz_banks_updated_at
  BEFORE UPDATE ON public.menu_quiz_banks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. training_progress: add distraction flag from most recent quiz attempt
ALTER TABLE public.training_progress
  ADD COLUMN IF NOT EXISTS distraction_flagged BOOLEAN NOT NULL DEFAULT false;
