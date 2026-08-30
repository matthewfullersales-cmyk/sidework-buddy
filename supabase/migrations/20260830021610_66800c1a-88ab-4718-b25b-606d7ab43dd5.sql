ALTER TABLE public.time_off_requests
  DROP COLUMN IF EXISTS reason,
  DROP COLUMN IF EXISTS reason_type,
  DROP COLUMN IF EXISTS decision_note;

DROP POLICY IF EXISTS "Employees view own timeoff" ON public.time_off_requests;
CREATE POLICY "Employees view own timeoff"
ON public.time_off_requests
FOR SELECT
TO authenticated
USING (
  employee_id IN (
    SELECT p.id FROM public.people p
    WHERE p.auth_user_id = auth.uid()
      AND p.state IN ('hired','active','inactive','pending_approval')
      AND p.archived = false
  )
);