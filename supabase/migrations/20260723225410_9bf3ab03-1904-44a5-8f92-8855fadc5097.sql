
CREATE TABLE public.training_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.restaurant_employees(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  watched_sec INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  quiz_score INTEGER,
  passed BOOLEAN NOT NULL DEFAULT false,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_out BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, video_id)
);

CREATE INDEX training_progress_owner_idx ON public.training_progress(owner_id);
CREATE INDEX training_progress_employee_idx ON public.training_progress(employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_progress TO authenticated;
GRANT ALL ON public.training_progress TO service_role;

ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;

-- Owner can manage everything for their restaurant.
CREATE POLICY "Owner manages training progress"
  ON public.training_progress
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Employees can view their own progress.
CREATE POLICY "Employee reads own training progress"
  ON public.training_progress
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_employees e
      WHERE e.id = training_progress.employee_id
        AND e.auth_user_id = auth.uid()
    )
  );

-- Employees can insert/update their own progress.
CREATE POLICY "Employee inserts own training progress"
  ON public.training_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_employees e
      WHERE e.id = training_progress.employee_id
        AND e.auth_user_id = auth.uid()
        AND e.owner_id = training_progress.owner_id
    )
  );

CREATE POLICY "Employee updates own training progress"
  ON public.training_progress
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_employees e
      WHERE e.id = training_progress.employee_id
        AND e.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurant_employees e
      WHERE e.id = training_progress.employee_id
        AND e.auth_user_id = auth.uid()
    )
  );

CREATE TRIGGER update_training_progress_updated_at
  BEFORE UPDATE ON public.training_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
