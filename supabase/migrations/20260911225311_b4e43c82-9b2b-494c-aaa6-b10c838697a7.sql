CREATE TABLE public.availability_change_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  employee_id uuid REFERENCES public.people(id) ON DELETE CASCADE,
  requested_availability jsonb NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending',
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX availability_change_requests_owner_idx ON public.availability_change_requests (owner_id, created_at DESC);
CREATE INDEX availability_change_requests_employee_idx ON public.availability_change_requests (employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_change_requests TO authenticated;
GRANT ALL ON public.availability_change_requests TO service_role;

ALTER TABLE public.availability_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees insert own availability request"
ON public.availability_change_requests FOR INSERT TO authenticated
WITH CHECK (employee_id IN (
  SELECT p.id FROM public.people p
  WHERE p.auth_user_id = auth.uid()
    AND p.owner_id = availability_change_requests.owner_id
    AND p.state = ANY (ARRAY['hired','active','inactive','pending_approval'])
    AND p.archived = false
));

CREATE POLICY "Employees view own availability request"
ON public.availability_change_requests FOR SELECT TO authenticated
USING (employee_id IN (
  SELECT p.id FROM public.people p
  WHERE p.auth_user_id = auth.uid()
    AND p.state = ANY (ARRAY['hired','active','inactive','pending_approval'])
    AND p.archived = false
));

CREATE POLICY "Employees delete own pending availability request"
ON public.availability_change_requests FOR DELETE TO authenticated
USING (status = 'pending' AND employee_id IN (
  SELECT p.id FROM public.people p
  WHERE p.auth_user_id = auth.uid()
    AND p.state = ANY (ARRAY['hired','active','inactive','pending_approval'])
    AND p.archived = false
));

CREATE POLICY "Owners view availability requests"
ON public.availability_change_requests FOR SELECT TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY "Owners insert availability requests"
ON public.availability_change_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners update availability requests"
ON public.availability_change_requests FOR UPDATE TO authenticated
USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners delete availability requests"
ON public.availability_change_requests FOR DELETE TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY "Schedule managers view availability requests"
ON public.availability_change_requests FOR SELECT TO authenticated
USING (public.can_manage_schedule_for(owner_id));

CREATE POLICY "Schedule managers insert availability requests"
ON public.availability_change_requests FOR INSERT TO authenticated
WITH CHECK (public.can_manage_schedule_for(owner_id));

CREATE POLICY "Schedule managers update availability requests"
ON public.availability_change_requests FOR UPDATE TO authenticated
USING (public.can_manage_schedule_for(owner_id)) WITH CHECK (public.can_manage_schedule_for(owner_id));

CREATE POLICY "Schedule managers delete availability requests"
ON public.availability_change_requests FOR DELETE TO authenticated
USING (public.can_manage_schedule_for(owner_id));

CREATE TRIGGER update_availability_change_requests_updated_at
BEFORE UPDATE ON public.availability_change_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();