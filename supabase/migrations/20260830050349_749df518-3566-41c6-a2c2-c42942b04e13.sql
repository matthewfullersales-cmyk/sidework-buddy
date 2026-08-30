CREATE POLICY "Employees delete own pending timeoff"
ON public.time_off_requests
FOR DELETE
TO authenticated
USING (
  status = 'pending'
  AND employee_id IN (
    SELECT p.id
    FROM public.people p
    WHERE p.auth_user_id = auth.uid()
      AND p.state = ANY (ARRAY['hired'::text, 'active'::text, 'inactive'::text, 'pending_approval'::text])
      AND p.archived = false
  )
);