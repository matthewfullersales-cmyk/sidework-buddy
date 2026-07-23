DROP POLICY IF EXISTS "Employees can insert their own attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Employees can update their own attempts" ON public.quiz_attempts;
DROP POLICY IF EXISTS "Employees can view their own attempts" ON public.quiz_attempts;

CREATE OR REPLACE FUNCTION public.protect_employee_quiz_results()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  is_employee_self boolean := false;
BEGIN
  IF caller IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.restaurant_employees e
    WHERE e.id = NEW.employee_id
      AND e.auth_user_id = caller
      AND e.owner_id = NEW.owner_id
  ) INTO is_employee_self;

  IF NOT is_employee_self OR caller = NEW.owner_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.completed_at := NULL;
    NEW.quiz_score := NULL;
    NEW.passed := false;
    NEW.attempts := 0;
    NEW.locked_out := false;
    NEW.distraction_flagged := false;
  ELSE
    NEW.completed_at := OLD.completed_at;
    NEW.quiz_score := OLD.quiz_score;
    NEW.passed := OLD.passed;
    NEW.attempts := OLD.attempts;
    NEW.locked_out := OLD.locked_out;
    NEW.distraction_flagged := OLD.distraction_flagged;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_employee_quiz_results_trigger ON public.training_progress;
CREATE TRIGGER protect_employee_quiz_results_trigger
BEFORE INSERT OR UPDATE ON public.training_progress
FOR EACH ROW
EXECUTE FUNCTION public.protect_employee_quiz_results();